// Admin · Effets (aEffets): the custom effects, a text only. The combat engine does not run them:
// an effect that acts in combat is added to the engine (docs/guides/ajouter-un-effet.md).

import { EDITOR_FIELDS } from '@forestcard/describe';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { addCustomEffect, adminKeys, deleteCustomEffect, fetchCustomEffects } from '@/data/admin';
import { ICONS } from '@/lib/icons';
import { AdminError, AdminSection, Choice, Field, NoticeView, useAction } from './kit';

const CATEGORIES: Record<string, string> = {
  passif: 'Passif',
  ultime: 'Ultime',
  magie: 'Magie',
  condition: 'Condition de piège',
};
const FIELDS = Object.entries(EDITOR_FIELDS).map(([key, [label]]) => ({ key, label }));
const fieldLabel = (key: string) => FIELDS.find((f) => f.key === key)?.label ?? key;

export function EffectsAdmin() {
  const effects = useQuery({ queryKey: adminKeys.effects, queryFn: fetchCustomEffects });
  const action = useAction();
  const [category, setCategory] = useState('passif');
  const [label, setLabel] = useState('');
  const [params, setParams] = useState<string[]>([]);
  if (effects.error) return <AdminError error={effects.error} />;
  if (!effects.data) return <PageSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <Alert variant="warning">
        <ICONS.info />
        <AlertDescription>
          Les effets créés ici sont seulement un texte affiché : le moteur de combat ne sait pas les
          exécuter. Pour qu'un nouvel effet agisse vraiment dans les combats, il doit être ajouté au
          moteur : utilise d'abord les effets de la liste de base des cartes.
        </AlertDescription>
      </Alert>
      <AdminSection title="Nouvel effet">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Type">
            <NativeSelect
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-48"
            >
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Texte affiché">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex : Gagne X PV quand il attaque"
              className="min-w-80"
            />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Valeurs à saisir pour cet effet</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((f) => (
            <Choice key={f.key}>
              <Checkbox
                checked={params.includes(f.key)}
                onChange={(e) =>
                  setParams((list) =>
                    e.target.checked ? [...list, f.key] : list.filter((k) => k !== f.key),
                  )
                }
              />
              {f.label}
            </Choice>
          ))}
        </div>
        <div>
          <Button
            disabled={action.pending || !label.trim()}
            onClick={() =>
              action.run(async () => {
                await addCustomEffect(
                  category,
                  label,
                  FIELDS.map((f) => f.key).filter((k) => params.includes(k)),
                );
                setLabel('');
                setParams([]);
                return 'Effet ajouté.';
              })
            }
          >
            <ICONS.add />
            Ajouter l'effet
          </Button>
        </div>
        <NoticeView notice={action.notice} />
      </AdminSection>
      <AdminSection title={`Effets ajoutés (${effects.data.length})`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Texte</TableHead>
              <TableHead>Valeurs</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {effects.data.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{CATEGORIES[e.categorie] ?? e.categorie}</TableCell>
                <TableCell>{e.libelle}</TableCell>
                <TableCell>{(e.params ?? []).map(fieldLabel).join(', ') || '—'}</TableCell>
                <TableCell>
                  <HoldButton
                    size="sm"
                    variant="destructive-ghost"
                    disabled={action.pending}
                    onConfirm={() =>
                      action.run(async () => {
                        await deleteCustomEffect(e.id);
                        return 'Effet retiré de la liste (les cartes déjà créées avec cet effet le gardent).';
                      })
                    }
                  >
                    <ICONS.delete />
                  </HoldButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminSection>
    </div>
  );
}
