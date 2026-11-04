// Admin · Collections (aCollections): rename, add, delete. A card keeps its collection id: deleting
// a collection the cards still use is refused by the database.

import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
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
import { adminKeys, deleteCollection, fetchCollections, saveCollection } from '@/data/admin';
import { ICONS } from '@/lib/icons';
import { AdminError, AdminSection, NoticeView, useAction } from './kit';

export function CollectionsAdmin() {
  const collections = useQuery({ queryKey: adminKeys.collections, queryFn: fetchCollections });
  const action = useAction();
  if (collections.error) return <AdminError error={collections.error} />;
  if (!collections.data) return <PageSkeleton />;
  const { list, count } = collections.data;

  const save = (id: number | null, input: HTMLInputElement | null) => {
    const nom = input?.value.trim() ?? '';
    if (!nom) return;
    action.run(async () => {
      await saveCollection(id, nom);
      if (id === null && input) input.value = '';
      return id === null ? `Collection « ${nom} » ajoutée.` : 'Collection enregistrée.';
    });
  };

  return (
    <AdminSection
      title="Collections"
      description="Une collection range les cartes et compose les boosters. Ajouter une collection ne crée pas de booster : c'est dans Boosters."
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Cartes</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((c) => (
            <CollectionLine
              key={`${c.id}-${c.nom}`}
              name={c.nom}
              cards={count.get(c.id) ?? 0}
              pending={action.pending}
              onSave={(input) => save(c.id, input)}
              onDelete={() =>
                action.run(async () => {
                  await deleteCollection(c.id);
                  return `Collection « ${c.nom} » supprimée.`;
                })
              }
            />
          ))}
          <CollectionLine name="" pending={action.pending} onSave={(input) => save(null, input)} />
        </TableBody>
      </Table>
      <NoticeView notice={action.notice} />
    </AdminSection>
  );
}

function CollectionLine({
  name,
  cards,
  pending,
  onSave,
  onDelete,
}: {
  name: string;
  cards?: number;
  pending: boolean;
  onSave: (input: HTMLInputElement | null) => void;
  onDelete?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const isNew = cards === undefined;
  return (
    <TableRow>
      <TableCell>
        <Input
          ref={input}
          defaultValue={name}
          placeholder="Nouvelle collection"
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave(input.current);
          }}
        />
      </TableCell>
      <TableCell>{cards ?? ''}</TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <Button size="sm" disabled={pending} onClick={() => onSave(input.current)}>
            {isNew ? <ICONS.add /> : <ICONS.save />}
            {isNew ? 'Ajouter' : 'Enregistrer'}
          </Button>
          {onDelete && (
            <HoldButton
              size="sm"
              variant="destructive-ghost"
              disabled={pending}
              onConfirm={onDelete}
            >
              <ICONS.delete />
              Supprimer
            </HoldButton>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
