// Admin · Lore: the vaults (data/vaults.ts, 97-coffres-forts.sql). Create an event (title, end, price
// of a drill, drills needed by each vault), choose the secret loot of each vault (cards not
// published yet: they are published when the vault opens), move its end, delete it.

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { adminKeys } from '@/data/admin';
import { type CardListRow, fetchCardList } from '@/data/admin-cards';
import {
  type AdminHeist,
  createHeist,
  deleteHeist,
  fetchAdminHeists,
  setHeistEnd,
  setVaultCards,
  vaultKeys,
} from '@/data/vaults';
import { ICONS } from '@/lib/icons';
import { AdminError, AdminSection, Choice, Field, NoticeView, useAction } from './kit';

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
  const cards = useQuery({ queryKey: adminKeys.cards, queryFn: fetchCardList });
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
      description="Trois coffres communs (bleu, violet, légendaire), percés par la communauté avec des foreuses achetées en gold. Range dans chaque coffre des cartes pas encore publiées : elles restent secrètes et sont publiées à l'ouverture du coffre."
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
        <HeistAdmin key={h.id} heist={h} cards={cards.data ?? []} run={action.run} />
      ))}
    </AdminSection>
  );
}

function HeistAdmin({
  heist: h,
  cards,
  run,
}: {
  heist: AdminHeist;
  cards: CardListRow[];
  run: Run;
}) {
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
          <LootPicker key={`${v.id}-${v.cartes.join(',')}`} vault={v} cards={cards} run={run} />
        ))}
      </div>
    </div>
  );
}

type AdminVault = NonNullable<AdminHeist['coffres']>[number];

const RARITY: Record<AdminVault['teinte'], RegExp> = {
  bleu: /^rare/i,
  violet: /^[ée]pique/i,
  or: /^l[ée]gendaire/i,
};

function LootPicker({
  vault: v,
  cards,
  run,
}: {
  vault: AdminVault;
  cards: CardListRow[];
  run: Run;
}) {
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(v.cartes));
  const [all, setAll] = useState(false);
  const open = !!v.ouvert_le;
  // The cards that can go in: not published yet, of the vault's rarity (or any, on demand); plus
  // those already chosen.
  const list = cards.filter(
    (c) => chosen.has(c.id) || (!c.actif && (all || RARITY[v.teinte].test(c.raretes?.nom ?? ''))),
  );
  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <b className="flex items-center gap-2">
        {v.nom}
        <Badge variant={open ? 'success' : 'outline'}>
          {open ? 'Ouvert' : `${v.poses} / ${v.requis}`}
        </Badge>
      </b>
      <small className="text-muted-foreground">
        {chosen.size} carte{chosen.size > 1 ? 's' : ''} dans le coffre
      </small>
      {!open && (
        <Choice>
          <Checkbox checked={all} onChange={(e) => setAll(e.target.checked)} /> Toutes les raretés
        </Choice>
      )}
      <div className="flex max-h-dialog flex-col gap-1 overflow-y-auto text-sm">
        {list.length === 0 && (
          <small className="text-muted-foreground">
            Aucune carte non publiée de cette rareté pour l'instant.
          </small>
        )}
        {list.map((c) => (
          <Choice key={c.id}>
            <Checkbox
              disabled={open}
              checked={chosen.has(c.id)}
              onChange={(e) => {
                const next = new Set(chosen);
                if (e.target.checked) next.add(c.id);
                else next.delete(c.id);
                setChosen(next);
              }}
            />{' '}
            {c.nom}
            <small className="text-muted-foreground">
              {c.raretes?.nom ?? ''}
              {c.actif ? ' · publiée' : ''}
            </small>
          </Choice>
        ))}
      </div>
      {!open && (
        <Button
          size="sm"
          onClick={() =>
            run(async () => {
              await setVaultCards(v.id, [...chosen]);
              return `${v.nom} : butin enregistré (${chosen.size} cartes).`;
            })
          }
        >
          <ICONS.save />
          Enregistrer le butin
        </Button>
      )}
    </div>
  );
}
