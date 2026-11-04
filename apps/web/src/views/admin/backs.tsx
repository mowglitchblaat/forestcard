// Admin · Dos de cartes (aDos): the backs in stock, the base back (open to every player), giving a
// back to a player or to all, taking it back, deleting it.

import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  addBack,
  adminKeys,
  type BackRow,
  deleteBack,
  fetchBacksAdmin,
  fetchPlayers,
  giveBack,
  type PlayerRow,
  setBaseBack,
  takeBack,
} from '@/data/admin';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { ICONS } from '@/lib/icons';
import { AdminError, AdminSection, Choice, Field, NoticeView, useAction } from './kit';

export function BacksAdmin() {
  const backs = useQuery({ queryKey: adminKeys.backs, queryFn: fetchBacksAdmin });
  const players = useQuery({ queryKey: adminKeys.players, queryFn: fetchPlayers });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const add = useAction();
  const action = useAction();
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [base, setBase] = useState(false);

  const error = backs.error ?? players.error;
  if (error) return <AdminError error={error} />;
  if (!backs.data || !players.data) return <PageSkeleton />;
  const images = mirror.data ?? new Set<string>();

  return (
    <div className="flex flex-col gap-6">
      <AdminSection
        title="Ajouter un dos"
        description="Même format que tes cartes (ratio 5/7). Le « dos de base » est utilisable par tous les joueurs ; les autres ne servent qu'à ceux à qui tu les offres. Chaque joueur choisit le sien dans « Dos de cartes »."
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Nom du dos">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="w-56" />
          </Field>
          <Field label="Image du dos">
            <Input ref={file} type="file" accept="image/*" className="w-64" />
          </Field>
          <Choice>
            <Checkbox checked={base} onChange={(e) => setBase(e.target.checked)} /> Dos de base
            (disponible pour tous)
          </Choice>
          <Button
            disabled={add.pending}
            onClick={() => {
              const picked = file.current?.files?.[0];
              add.run(async () => {
                if (!name.trim() || !picked) throw new Error('Donne un nom et une image au dos.');
                await addBack(name.trim(), picked, base);
                setName('');
                setBase(false);
                if (file.current) file.current.value = '';
                return `Dos « ${name.trim()} » ajouté.`;
              });
            }}
          >
            <ICONS.add />
            Ajouter ce dos
          </Button>
        </div>
        <NoticeView notice={add.notice} />
      </AdminSection>

      <NoticeView notice={action.notice} />
      {backs.data.backs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun dos pour l'instant.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {backs.data.backs.map((b) => (
            <BackTile
              key={String(b.id)}
              back={b}
              image={imageUrl(b.image, images)}
              owners={backs.data.owners
                .filter((o) => String(o.dos_id) === String(b.id))
                .map(
                  (o) =>
                    players.data.find((p) => p.id === o.joueur_id) ?? {
                      id: o.joueur_id,
                      pseudo: '?',
                      monnaie: null,
                    },
                )}
              players={players.data}
              pending={action.pending}
              run={action.run}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BackTile({
  back,
  image,
  owners,
  players,
  pending,
  run,
}: {
  back: BackRow;
  image: string | null;
  owners: PlayerRow[];
  players: PlayerRow[];
  pending: boolean;
  run: (action: () => Promise<string | void>) => void;
}) {
  const [to, setTo] = useState('');
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        {image ? (
          <img src={image} alt="" className="aspect-5/7 w-full rounded-lg object-cover" />
        ) : (
          <div className="aspect-5/7 w-full rounded-lg bg-muted" />
        )}
        <b>{back.nom}</b>
        {back.par_defaut ? (
          <Badge variant="warning">★ Dos de base</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {owners.length} joueur{owners.length > 1 ? 's' : ''} l'ont reçu
          </span>
        )}
        <NativeSelect value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">🎁 Tous les joueurs</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.pseudo ?? p.id}
            </option>
          ))}
        </NativeSelect>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const n = await giveBack(back.id, to || null);
              return n
                ? `${n} joueur(s) ont reçu « ${back.nom} ».`
                : 'Rien à faire : le ou les joueurs ont déjà ce dos.';
            })
          }
        >
          <ICONS.gifts />
          Offrir
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => setBaseBack(back.id, !back.par_defaut))}
        >
          {back.par_defaut ? 'Retirer « dos de base »' : 'Définir comme dos de base'}
        </Button>
        <HoldButton
          size="sm"
          variant="destructive-ghost"
          disabled={pending}
          onConfirm={() =>
            run(async () => {
              await deleteBack(back.id);
              return `Dos « ${back.nom} » supprimé : ceux qui l'utilisaient reviennent au dos standard.`;
            })
          }
        >
          <ICONS.delete />
          Supprimer
        </HoldButton>
        {owners.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {owners.map((o) => (
              <Badge key={o.id} variant="outline">
                {o.pseudo}
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Retirer ce dos à ${o.pseudo ?? '?'}`}
                  disabled={pending}
                  onClick={() => run(() => takeBack(back.id, o.id))}
                >
                  <ICONS.remove />
                </Button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
