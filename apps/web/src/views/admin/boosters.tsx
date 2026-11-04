// Admin · Boosters (aBoosters): create, edit and delete the boosters of the shop: price, number of
// cards, on sale or not, given by the daily booster or not, image, collections inside (common cards
// are always in), a drop modifier per rarity added to its weight, and 0 to 2 featured cards.

import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  adminKeys,
  type BoosterRow,
  type BoostersData,
  deleteBooster,
  fetchBoostersAdmin,
  saveBooster,
} from '@/data/admin';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { ICONS } from '@/lib/icons';
import { AdminError, AdminSection, Choice, Field, NoticeView, useAction } from './kit';

// A combat won pays 50: a booster costs at least 5 wins.
const MIN_PRICE = 250;

export function BoostersAdmin() {
  const data = useQuery({ queryKey: adminKeys.boostersFull, queryFn: fetchBoostersAdmin });
  if (data.error) return <AdminError error={data.error} />;
  if (!data.data) return <PageSkeleton />;
  return (
    <div className="flex flex-col gap-6">
      <BoosterEditor key={`new-${data.data.boosters.length}`} booster={null} data={data.data} />
      <h2 className="text-lg font-semibold">Boosters existants ({data.data.boosters.length})</h2>
      {data.data.boosters.map((b) => (
        <BoosterEditor key={`${b.id}-${JSON.stringify(b)}`} booster={b} data={data.data} />
      ))}
    </div>
  );
}

function BoosterEditor({ booster, data }: { booster: BoosterRow | null; data: BoostersData }) {
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const action = useAction();
  const file = useRef<HTMLInputElement>(null);
  const id = booster?.id ?? null;
  const [name, setName] = useState(booster?.nom ?? '');
  const [price, setPrice] = useState(booster?.prix ?? MIN_PRICE);
  const [count, setCount] = useState(booster?.nb_cartes ?? 5);
  const [onSale, setOnSale] = useState(booster ? booster.actif !== false : true);
  const [daily, setDaily] = useState(booster?.quotidien === true);
  const [collections, setCollections] = useState<number[]>(
    data.links.filter((l) => l.type_id === id).map((l) => l.collection_id),
  );
  const [modifiers, setModifiers] = useState<Record<number, number>>(
    Object.fromEntries(
      data.rarities.map((r) => [
        r.id,
        data.modifiers.find((m) => m.type_id === id && m.rarete_id === r.id)?.modif ?? 0,
      ]),
    ),
  );
  const current = (data.featured ?? []).filter((v) => v.type_id === id);
  const [featured, setFeatured] = useState(
    [0, 1].map((i) => ({ carte_id: current[i]?.carte_id ?? 0, poids: current[i]?.poids ?? 3 })),
  );
  const image = booster?.image_path ? imageUrl(booster.image_path, mirror.data ?? new Set()) : null;

  return (
    <AdminSection
      title={booster ? booster.nom : 'Nouveau booster'}
      description={
        booster
          ? undefined
          : `Prix minimum ${MIN_PRICE} (un combat gagné rapporte 50). Le booster quotidien ne tire que parmi les boosters cochés « Distribué par le booster quotidien » : laisse décochés les boosters premium.`
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Nom du booster">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="w-64" />
        </Field>
        <Field label="Prix">
          <Input
            type="number"
            min={MIN_PRICE}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value) || 0)}
            className="w-28"
          />
        </Field>
        <Field label="Nb de cartes">
          <Input
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 1)}
            className="w-24"
          />
        </Field>
        <Choice>
          <Checkbox checked={onSale} onChange={(e) => setOnSale(e.target.checked)} /> En vente
        </Choice>
        <Choice>
          <Checkbox checked={daily} onChange={(e) => setDaily(e.target.checked)} /> 🎁 Distribué par
          le booster quotidien
        </Choice>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {image && <img src={image} alt="" className="w-32 rounded-md" />}
        <Field label="Image du booster (facultatif)">
          <Input ref={file} type="file" accept="image/*" className="w-64" />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">
          Collections présentes (les cartes communes sont toujours incluses)
        </span>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {data.collections.length === 0 && (
            <span className="text-sm text-muted-foreground">Aucune collection</span>
          )}
          {data.collections.map((c) => (
            <Choice key={c.id}>
              <Checkbox
                checked={collections.includes(c.id)}
                onChange={(e) =>
                  setCollections((list) =>
                    e.target.checked ? [...list, c.id] : list.filter((x) => x !== c.id),
                  )
                }
              />
              {c.nom}
            </Choice>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">
          Modificateur de drop : s'ajoute au poids de la rareté pour ce booster (négatif possible)
        </span>
        <div className="flex flex-wrap gap-3">
          {data.rarities.map((r) => (
            <Field key={r.id} label={`${r.nom} (poids ${r.poids})`}>
              <Input
                type="number"
                step="any"
                value={modifiers[r.id] ?? 0}
                onChange={(e) =>
                  setModifiers((m) => ({ ...m, [r.id]: Number(e.target.value) || 0 }))
                }
                className="w-24"
              />
            </Field>
          ))}
        </div>
      </div>
      {data.featured ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">
            ⭐ Cartes vedettes (0 à 2) : mises en avant dans la boutique. Poids : 1 = comme les
            autres cartes de sa rareté ; 3 = trois fois plus de chances que chacune des autres
            cartes de cette rareté dans ce booster. La carte doit faire partie d'une collection du
            booster, être sans collection, ou être de rareté commune.
          </span>
          <div className="flex flex-wrap gap-3">
            {featured.map((v, i) => (
              <div key={i} className="flex items-end gap-2">
                <Field label={`Vedette ${i + 1}`}>
                  <NativeSelect
                    value={v.carte_id || ''}
                    onChange={(e) =>
                      setFeatured((list) =>
                        list.map((x, k) =>
                          k === i ? { ...x, carte_id: Number(e.target.value) || 0 } : x,
                        ),
                      )
                    }
                    className="w-72"
                  >
                    <option value="">— aucune —</option>
                    {data.cards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom} ({c.raretes?.nom ?? '?'}
                        {c.collections ? ` · ${c.collections.nom}` : ''})
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Poids">
                  <Input
                    type="number"
                    step="any"
                    min={0.01}
                    value={v.poids}
                    onChange={(e) =>
                      setFeatured((list) =>
                        list.map((x, k) =>
                          k === i ? { ...x, poids: Number(e.target.value) || 0 } : x,
                        ),
                      )
                    }
                    className="w-20"
                  />
                </Field>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          ⭐ Cartes vedettes indisponibles ({data.featuredError}).
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={action.pending}
          onClick={() =>
            action.run(async () => {
              if (!name.trim()) throw new Error('Donne un nom au booster.');
              await saveBooster(id, {
                nom: name.trim(),
                prix: price,
                nb_cartes: count,
                actif: onSale,
                quotidien: daily,
                image: file.current?.files?.[0] ?? null,
                collections,
                modifiers,
                featured: data.featured ? featured : null,
              });
              return id === null ? `Booster « ${name.trim()} » créé.` : 'Booster enregistré.';
            })
          }
        >
          {id === null ? <ICONS.add /> : <ICONS.save />}
          {id === null ? 'Créer le booster' : 'Enregistrer'}
        </Button>
        {booster && (
          <HoldButton
            variant="destructive-ghost"
            disabled={action.pending}
            onConfirm={() =>
              action.run(async () => {
                await deleteBooster(booster.id);
                return `Booster « ${booster.nom} » supprimé.`;
              })
            }
          >
            <ICONS.delete />
            Supprimer
          </HoldButton>
        )}
      </div>
      {booster && (
        <p className="text-xs text-muted-foreground">
          Supprimer : les boosters non ouverts de ce type chez les joueurs sont perdus. Pour
          seulement le retirer de la boutique, décoche « En vente ».
        </p>
      )}
      <NoticeView notice={action.notice} />
    </AdminSection>
  );
}
