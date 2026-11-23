// Admin · Lore: the vaults (data/vaults.ts, 97-coffres-forts.sql). Create an event (title, end, price
// of a drill, drills needed by each vault), follow the drilling, move its end, delete it. An open
// vault announces its treasure (new cards of its rarity, which the admin creates afterwards).

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  type AdminHeist,
  createHeist,
  deleteHeist,
  fetchAdminHeists,
  setHeistEnd,
  vaultKeys,
} from '@/data/vaults';
import { ICONS } from '@/lib/icons';
import { AdminError, AdminSection, Field, NoticeView, useAction } from './kit';

const local = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
// In a week, at 20:00.
const inAWeek = () => {
  const d = new Date(Date.now() + 7 * 86400000);
  d.setHours(20, 0, 0, 0);
  return local(d);
};

type Run = ReturnType<typeof useAction>['run'];

export function VaultsAdmin() {
  const heists = useQuery({ queryKey: vaultKeys.admin, queryFn: fetchAdminHeists });
  const action = useAction();
  const [title, setTitle] = useState('Les coffres-forts');
  const [end, setEnd] = useState(inAWeek);
  const [price, setPrice] = useState('1000');
  const [blue, setBlue] = useState('20');
  const [violet, setViolet] = useState('55');
  const [gold, setGold] = useState('100');
  if (heists.error) return <AdminError error={heists.error} />;
  return (
    <AdminSection
      title={
        <span className="flex items-center gap-2">
          <ICONS.vault />
          Coffres-forts
        </span>
      }
      description="Trois coffres communs (bleu, violet, légendaire), percés par la communauté avec des foreuses achetées en gold. À son ouverture, un coffre annonce son trésor (40 rares, 12 épiques, 5 légendaires) : les nouvelles cartes que tu créeras ensuite. Le nombre de foreuses reste secret pour les joueurs."
    >
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <b>Nouvel événement</b>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Titre">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="w-64" />
          </Field>
          <Field label="Fin">
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="Prix d'une foreuse (gold)">
            <Input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-28"
            />
          </Field>
          <Field label="Foreuses : bleu">
            <Input
              type="number"
              min={1}
              value={blue}
              onChange={(e) => setBlue(e.target.value)}
              className="w-24"
            />
          </Field>
          <Field label="violet">
            <Input
              type="number"
              min={1}
              value={violet}
              onChange={(e) => setViolet(e.target.value)}
              className="w-24"
            />
          </Field>
          <Field label="légendaire">
            <Input
              type="number"
              min={1}
              value={gold}
              onChange={(e) => setGold(e.target.value)}
              className="w-24"
            />
          </Field>
          <Button
            disabled={action.pending}
            onClick={() =>
              action.run(async () => {
                await createHeist({
                  titre: title,
                  fin: end,
                  prix: Number(price) || 0,
                  bleu: Number(blue) || 20,
                  violet: Number(violet) || 55,
                  or: Number(gold) || 100,
                });
                return 'Coffres créés : choisis maintenant leur butin ci-dessous.';
              })
            }
          >
            <ICONS.add />
            Créer les coffres
          </Button>
        </div>
        <small className="text-muted-foreground">
          Le jeu montre le dernier événement commencé, jusqu'à 3 jours après sa fin.
        </small>
      </div>
      <NoticeView notice={action.notice} />
      {(heists.data ?? []).map((h) => (
        <HeistAdmin key={h.id} heist={h} run={action.run} />
      ))}
    </AdminSection>
  );
}

function HeistAdmin({ heist: h, run }: { heist: AdminHeist; run: Run }) {
  const [end, setEnd] = useState(() => local(new Date(h.fin)));
  const over = new Date(h.fin).getTime() <= Date.now();
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <b>{h.titre}</b>
        <Badge variant={over ? 'outline' : 'info'}>{over ? 'Terminé' : 'En cours'}</Badge>
        <span className="text-sm text-muted-foreground">
          {h.prix} gold la foreuse · fin le {new Date(h.fin).toLocaleString('fr-FR')}
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Changer la fin">
          <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            run(async () => {
              await setHeistEnd(h.id, end);
              return 'Fin changée.';
            })
          }
        >
          <ICONS.save />
          Enregistrer
        </Button>
        <HoldButton
          size="sm"
          variant="destructive-ghost"
          onConfirm={() =>
            run(async () => {
              await deleteHeist(h.id);
              return 'Événement supprimé.';
            })
          }
        >
          <ICONS.delete />
          Supprimer (maintenir)
        </HoldButton>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {(h.coffres ?? []).map((v) => (
          <div key={v.id} className="flex flex-col gap-1 rounded-md border p-2 text-sm">
            <b className="flex items-center gap-2">
              {v.nom}
              <Badge variant={v.ouvert_le ? 'success' : 'outline'}>
                {v.ouvert_le ? 'Ouvert' : `${v.poses} / ${v.requis}`}
              </Badge>
            </b>
            <span className="text-muted-foreground">
              Trésor annoncé à l'ouverture : {v.nb_cartes ?? '?'} nouvelles cartes {v.rarete ?? ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
