// Admin · Raretés (aRaretes): name, colour, drop weight and order of each rarity, and a new one.

import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminKeys, fetchRarities, type RarityRow, saveRarity } from '@/data/admin';
import { ICONS } from '@/lib/icons';
import { AdminError, AdminSection, NoticeView, useAction } from './kit';

export function RaritiesAdmin() {
  const rarities = useQuery({ queryKey: adminKeys.rarities, queryFn: fetchRarities });
  const action = useAction();
  if (rarities.error) return <AdminError error={rarities.error} />;
  if (!rarities.data) return <PageSkeleton />;
  const list = rarities.data;
  const save = (
    id: number | null,
    row: { nom: string; couleur: string; poids: number; ordre: number },
  ) => {
    if (!row.nom.trim()) return;
    action.run(async () => {
      await saveRarity(id, { ...row, nom: row.nom.trim() });
      return id === null ? `Rareté « ${row.nom} » ajoutée.` : `Rareté « ${row.nom} » enregistrée.`;
    });
  };
  return (
    <AdminSection
      title="Raretés"
      description="Poids : plus il est grand, plus la rareté sort souvent (ex : 70 / 25 / 5). Chaque booster peut ajouter son modificateur (Boosters)."
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Couleur</TableHead>
            <TableHead>Poids</TableHead>
            <TableHead>Ordre</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => (
            <RarityLine
              key={JSON.stringify(r)}
              rarity={r}
              pending={action.pending}
              onSave={(row) => save(r.id, row)}
            />
          ))}
          <RarityLine
            key={`new-${list.length}`}
            rarity={{ id: 0, nom: '', couleur: '#a855f7', poids: 10, ordre: list.length + 1 }}
            isNew
            pending={action.pending}
            onSave={(row) => save(null, row)}
          />
        </TableBody>
      </Table>
      <NoticeView notice={action.notice} />
    </AdminSection>
  );
}

function RarityLine({
  rarity,
  isNew = false,
  pending,
  onSave,
}: {
  rarity: RarityRow;
  isNew?: boolean;
  pending: boolean;
  onSave: (row: { nom: string; couleur: string; poids: number; ordre: number }) => void;
}) {
  const name = useRef<HTMLInputElement>(null);
  const colour = useRef<HTMLInputElement>(null);
  const weight = useRef<HTMLInputElement>(null);
  const order = useRef<HTMLInputElement>(null);
  return (
    <TableRow>
      <TableCell>
        <Input
          ref={name}
          defaultValue={rarity.nom}
          placeholder="Nouvelle rareté"
          className="min-w-36"
        />
      </TableCell>
      <TableCell>
        <Input
          ref={colour}
          type="color"
          defaultValue={rarity.couleur ?? '#a855f7'}
          className="w-14"
        />
      </TableCell>
      <TableCell>
        <Input
          ref={weight}
          type="number"
          step="any"
          min={0}
          defaultValue={rarity.poids}
          className="w-24"
        />
      </TableCell>
      <TableCell>
        <Input ref={order} type="number" defaultValue={rarity.ordre} className="w-20" />
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            onSave({
              nom: name.current?.value ?? '',
              couleur: colour.current?.value ?? '#a855f7',
              poids: Number(weight.current?.value) || 0,
              ordre: Number(order.current?.value) || 0,
            })
          }
        >
          {isNew ? <ICONS.add /> : <ICONS.save />}
          {isNew ? 'Ajouter' : 'Enregistrer'}
        </Button>
      </TableCell>
    </TableRow>
  );
}
