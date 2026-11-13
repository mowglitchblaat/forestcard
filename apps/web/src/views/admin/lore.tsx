// Admin · Lore (60-lore.sql): the events (a defence with its key and harmful fighters, or a vote with
// its options and their chances; the reward card and its chance), the world map (its image, and its
// places, placed with a click on the map, with their layers, hidden until revealed:
// 64-lore-carte-calques.sql) and the story's chapters.

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { PageSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { adminKeys, fetchCollections, fetchVariants, variantLabel } from '@/data/admin';
import { fetchCardList } from '@/data/admin-cards';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import {
  addLayers,
  type Chapter,
  createEvent,
  deleteChapter,
  deleteEvent,
  deleteLayer,
  deletePlace,
  endEventNow,
  type EventDraft,
  fetchChapters,
  fetchEvents,
  fetchWorldMap,
  loreKeys,
  type Layer,
  type Place,
  type PlaceDraft,
  privateLayerUrls,
  saveChapter,
  saveMapImage,
  savePlace,
  setCountEnd,
  setMapStorm,
  setPlaceRevealed,
} from '@/data/lore';
import { ICONS } from '@/lib/icons';
import { EventCard, MapPins } from '@/views/lore/page';
import { AdminError, AdminSection, Choice, Field, NoticeView, useAction } from './kit';

type Run = (action: () => Promise<string | void>) => void;

export function LoreAdmin() {
  return (
    <div className="flex flex-col gap-6">
      <EventsAdmin />
      <MapAdmin />
      <ChaptersAdmin />
    </div>
  );
}

const num = (v: string, fallback: number) => (v.trim() === '' ? fallback : Number(v) || 0);

// A datetime-local value, in the browser's time: now + 2 days at 20:00.
const defaultEnd = () => {
  const d = new Date(Date.now() + 2 * 86400000);
  d.setHours(20, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// A date as a datetime-local value, in the browser's time.
const localInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// A contest counting its points (76-evenement-contestation.sql): the admin sets when the count ends
// (the best collection then takes the lightning), or ends it now.
function CountEnd({ id, end, run }: { id: number; end: string | null; run: Run }) {
  const [value, setValue] = useState(() => (end ? localInput(end) : ''));
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Fin du décompte (heure de ton ordinateur)">
        <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <Button
        size="sm"
        disabled={!value}
        onClick={() =>
          run(async () => {
            await setCountEnd(id, value);
            return 'Fin du décompte enregistrée.';
          })
        }
      >
        <ICONS.save />
        Enregistrer
      </Button>
    </div>
  );
}

const emptyEvent = (): EventDraft => ({
  type: 'defense',
  titre: '',
  texte: '',
  image: null,
  fin: defaultEnd(),
  recompense_variante_id: null,
  recompense_pct: 40,
  attaquant_variante_id: null,
  lieu_id: null,
  eclair_x: null,
  eclair_y: null,
  base_pct: 0,
  cle_pct: 20,
  autre_pct: 2,
  nuisible_pct: 10,
  montrer_cles: false,
  enjeu_eclair: false,
  vague: 0,
  montrer_chances: true,
  boss_bonus_pct: 70,
  boss_essais_jour: 3,
  boss_or_10pv: 5,
  boss_or_croissance: 10,
  cles: [],
  nuisibles: [],
  options: [
    { libelle: '', collection_id: null, chance: 50, vitesse: 10, image: null },
    { libelle: '', collection_id: null, chance: 50, vitesse: 10, image: null },
  ],
});

// ── Events ──

function EventsAdmin() {
  const events = useQuery({ queryKey: loreKeys.events, queryFn: fetchEvents });
  const variants = useQuery({ queryKey: adminKeys.variants, queryFn: fetchVariants });
  const cards = useQuery({ queryKey: adminKeys.cards, queryFn: fetchCardList });
  const collections = useQuery({ queryKey: adminKeys.collections, queryFn: fetchCollections });
  const map = useQuery({ queryKey: loreKeys.map, queryFn: fetchWorldMap });
  const add = useAction();
  const action = useAction();
  const [d, setD] = useState(emptyEvent);
  const [form, setForm] = useState(0);
  const set = (patch: Partial<EventDraft>) => setD({ ...d, ...patch });

  const error = events.error ?? variants.error ?? cards.error ?? collections.error ?? map.error;
  if (error) return <AdminError error={error} />;
  if (!events.data || !variants.data || !cards.data || !collections.data || !map.data)
    return <PageSkeleton />;
  const fighters = cards.data.filter((c) => c.type === 'combattant');
  const nameOf = (id: number) => fighters.find((c) => c.id === id)?.nom ?? `#${id}`;

  const FighterList = ({
    label,
    list,
    onChange,
  }: {
    label: string;
    list: number[];
    onChange: (l: number[]) => void;
  }) => (
    <Field label={label}>
      <NativeSelect
        value=""
        onChange={(e) => {
          const id = Number(e.target.value);
          if (id && !list.includes(id)) onChange([...list, id]);
        }}
      >
        <option value="">+ Ajouter un combattant…</option>
        {fighters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
            {c.raretes ? ` · ${c.raretes.nom}` : ''}
          </option>
        ))}
      </NativeSelect>
      <span className="flex flex-wrap gap-1">
        {list.map((id) => (
          <Badge key={id} variant="outline">
            {nameOf(id)}
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Retirer"
              onClick={() => onChange(list.filter((x) => x !== id))}
            >
              <ICONS.remove />
            </Button>
          </Badge>
        ))}
      </span>
    </Field>
  );

  return (
    <>
      <AdminSection
        title="Nouvel événement"
        description="Défense : chaque joueur place un de ses combattants (les clés comptent une fois chacune). Vote : chaque joueur vote pour une option, la plus votée est envoyée avec sa chance. Un seul jet à la fin ; en cas de réussite, chaque participant a X % de chances de recevoir la carte récompense."
      >
        <div key={form} className="flex flex-col gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            value={d.type}
            onValueChange={(v) =>
              v && set({ type: v === 'vote' ? 'vote' : v === 'boss' ? 'boss' : 'defense' })
            }
          >
            <ToggleGroupItem value="defense">
              <ICONS.combat />
              Défense
            </ToggleGroupItem>
            <ToggleGroupItem value="vote">
              <ICONS.votes />
              Vote de collection
            </ToggleGroupItem>
            <ToggleGroupItem value="boss">
              <ICONS.combat />
              Combat de boss (1 contre 1)
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Titre">
              <Input value={d.titre} onChange={(e) => set({ titre: e.target.value })} />
            </Field>
            <Field label="Fin (heure de ton ordinateur)">
              <Input
                type="datetime-local"
                value={d.fin}
                onChange={(e) => set({ fin: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Texte (l'histoire de l'événement)">
            <Textarea rows={4} value={d.texte} onChange={(e) => set({ texte: e.target.value })} />
          </Field>
          <Field label="Image (facultative)">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => set({ image: e.target.files?.[0] ?? null })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={
                d.type === 'boss'
                  ? 'Le boss (sa carte peut rester non publiée)'
                  : 'Carte qui attaque (boss, facultatif)'
              }
            >
              <NativeSelect
                value={d.attaquant_variante_id ?? ''}
                onChange={(e) =>
                  set({ attaquant_variante_id: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">— Aucune —</option>
                {variants.data
                  .filter((v) => v.cartes.type === 'combattant')
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {variantLabel(v)}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="Lieu attaqué (fond : la carte du lore zoomée dessus)">
              <NativeSelect
                value={d.lieu_id ?? ''}
                onChange={(e) => set({ lieu_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— Toute la carte —</option>
                {map.data.places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                    {p.revele ? '' : ' (caché : les joueurs verront toute la carte)'}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          {d.type === 'boss' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Boss plus fort que sa carte : ATQ et PV + (%)">
                  <Input
                    type="number"
                    value={d.boss_bonus_pct}
                    onChange={(e) => set({ boss_bonus_pct: num(e.target.value, 70) })}
                  />
                </Field>
                <Field label="Essais par joueur et par jour">
                  <Input
                    type="number"
                    value={d.boss_essais_jour}
                    onChange={(e) => set({ boss_essais_jour: num(e.target.value, 3) })}
                  />
                </Field>
                <Field label="Gold des 10 premiers PV retirés au boss (caché aux joueurs)">
                  <Input
                    type="number"
                    value={d.boss_or_10pv}
                    onChange={(e) => set({ boss_or_10pv: num(e.target.value, 5) })}
                  />
                </Field>
                <Field label="Chaque tranche de 10 PV suivante rapporte + (%)">
                  <Input
                    type="number"
                    value={d.boss_or_croissance}
                    onChange={(e) => set({ boss_or_croissance: num(e.target.value, 10) })}
                  />
                </Field>
              </div>
              <p className="text-sm text-muted-foreground">
                Chaque joueur affronte le boss depuis Lore &gt; Événements, avec un combattant de sa
                collection, sans magie ni piège des deux côtés ; le combat se joue sur le site avec
                l'animation du stream, sur fond orageux. Récompense cachée, qui grossit avec les
                dégâts : la 1re tranche de 10 PV retirés rapporte le gold ci-dessus, chaque tranche
                suivante X % de plus (les joueurs voient seulement ce qu'ils ramassent). À la fin,
                l'événement est réussi si quelqu'un l'a battu.
              </p>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Carte récompense (une version précise)">
                  <NativeSelect
                    value={d.recompense_variante_id ?? ''}
                    onChange={(e) =>
                      set({
                        recompense_variante_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">— Aucune —</option>
                    {variants.data.map((v) => (
                      <option key={v.id} value={v.id}>
                        {variantLabel(v)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Chance de chaque participant d'avoir la carte (%)">
                  <Input
                    type="number"
                    value={d.recompense_pct}
                    onChange={(e) => set({ recompense_pct: num(e.target.value, 40) })}
                  />
                </Field>
              </div>
              <Choice>
                <Checkbox
                  checked={d.montrer_chances}
                  onChange={(e) => set({ montrer_chances: e.target.checked })}
                />{' '}
                Montrer les chances de réussite aux joueurs (sinon, ils les découvrent au résultat)
              </Choice>
            </>
          )}
          {d.type === 'defense' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Chance de départ (%)">
                  <Input
                    type="number"
                    value={d.base_pct}
                    onChange={(e) => set({ base_pct: num(e.target.value, 0) })}
                  />
                </Field>
                <Field label="Combattant clé (+%)">
                  <Input
                    type="number"
                    value={d.cle_pct}
                    onChange={(e) => set({ cle_pct: num(e.target.value, 20) })}
                  />
                </Field>
                <Field label="Autre combattant (+%)">
                  <Input
                    type="number"
                    value={d.autre_pct}
                    onChange={(e) => set({ autre_pct: num(e.target.value, 2) })}
                  />
                </Field>
                <Field label="Vague (combattants, 0 : un seul jet à la fin)">
                  <Input
                    type="number"
                    min={0}
                    value={d.vague}
                    onChange={(e) => set({ vague: num(e.target.value, 0) })}
                  />
                </Field>
                <Field label="Nuisible (−%)">
                  <Input
                    type="number"
                    value={d.nuisible_pct}
                    onChange={(e) => set({ nuisible_pct: num(e.target.value, 10) })}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FighterList
                  label="Combattants clés"
                  list={d.cles}
                  onChange={(cles) => set({ cles })}
                />
                <FighterList
                  label="Combattants nuisibles"
                  list={d.nuisibles}
                  onChange={(nuisibles) => set({ nuisibles })}
                />
              </div>
              <Choice>
                <Checkbox
                  checked={d.montrer_cles}
                  onChange={(e) => set({ montrer_cles: e.target.checked })}
                />{' '}
                Montrer aux joueurs les combattants clés et nuisibles (sinon, ils les découvrent à
                la fin)
              </Choice>
              <Choice>
                <Checkbox
                  checked={d.enjeu_eclair}
                  onChange={(e) => set({ enjeu_eclair: e.target.checked })}
                />{' '}
                L'éclair est en jeu : si la défense échoue, l'attaquant reprend l'éclair (il quitte
                la carte du monde) ; pendant l'attaque, il est contesté
              </Choice>
            </>
          ) : d.type === 'vote' ? (
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Éclair : X sur la carte du lore (%, vide = pas d'éclair)">
                  <Input
                    type="number"
                    value={d.eclair_x ?? ''}
                    onChange={(e) =>
                      set({ eclair_x: e.target.value === '' ? null : num(e.target.value, 50) })
                    }
                  />
                </Field>
                <Field label="Éclair : Y sur la carte du lore (%)">
                  <Input
                    type="number"
                    value={d.eclair_y ?? ''}
                    onChange={(e) =>
                      set({ eclair_y: e.target.value === '' ? null : num(e.target.value, 50) })
                    }
                  />
                </Field>
              </div>
              <small className="text-muted-foreground">
                Avec un éclair, la faction la plus votée part de son lieu (celui de sa collection) à
                la fin du vote, et arrive après distance ÷ vitesse heures (à vitesse 10, une moitié
                de carte = 5 h) : le jet de réussite se fait à son arrivée.
              </small>
              <b className="text-sm">Options du vote</b>
              {d.options.map((o, i) => (
                <div key={i} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-5">
                  <Field label={`Option ${i + 1}`}>
                    <Input
                      value={o.libelle}
                      onChange={(e) =>
                        set({
                          options: d.options.map((x, j) =>
                            j === i ? { ...x, libelle: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="Collection (facultative)">
                    <NativeSelect
                      value={o.collection_id ?? ''}
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : null;
                        const name = collections.data.list.find((c) => c.id === id)?.nom ?? '';
                        set({
                          options: d.options.map((x, j) =>
                            j === i ? { ...x, collection_id: id, libelle: x.libelle || name } : x,
                          ),
                        });
                      }}
                    >
                      <option value="">—</option>
                      {collections.data.list.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nom}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Chance de réussite (%)">
                    <Input
                      type="number"
                      value={o.chance}
                      onChange={(e) =>
                        set({
                          options: d.options.map((x, j) =>
                            j === i ? { ...x, chance: num(e.target.value, 50) } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="Vitesse (éclair)">
                    <Input
                      type="number"
                      value={o.vitesse}
                      onChange={(e) =>
                        set({
                          options: d.options.map((x, j) =>
                            j === i ? { ...x, vitesse: num(e.target.value, 10) } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="Image">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        set({
                          options: d.options.map((x, j) =>
                            j === i ? { ...x, image: e.target.files?.[0] ?? null } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  {d.options.length > 2 && (
                    <div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => set({ options: d.options.filter((_, j) => j !== i) })}
                      >
                        <ICONS.remove />
                        Retirer
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    set({
                      options: [
                        ...d.options,
                        { libelle: '', collection_id: null, chance: 50, vitesse: 10, image: null },
                      ],
                    })
                  }
                >
                  <ICONS.add />
                  Ajouter une option
                </Button>
              </div>
            </div>
          ) : null}
          <div>
            <Button
              disabled={add.pending}
              onClick={() =>
                add.run(async () => {
                  await createEvent(d);
                  setD(emptyEvent());
                  setForm(form + 1);
                  return 'Événement lancé.';
                })
              }
            >
              <ICONS.send />
              {add.pending ? 'Lancement…' : "Lancer l'événement"}
            </Button>
          </div>
        </div>
        <NoticeView notice={add.notice} />
      </AdminSection>

      <NoticeView notice={action.notice} />
      {events.data.map((e) => (
        <EventCard key={e.id} event={e} owned={[]}>
          <div className="flex flex-wrap gap-2">
            {e.statut === 'decompte' && (
              <CountEnd
                key={e.decompte_fin ?? ''}
                id={e.id}
                end={e.decompte_fin}
                run={action.run}
              />
            )}
            {(e.statut === 'ouvert' || e.statut === 'decompte') && (
              <HoldButton
                size="sm"
                variant="outline"
                disabled={action.pending}
                onConfirm={() =>
                  action.run(async () => {
                    await endEventNow(e.id);
                    return e.statut === 'decompte'
                      ? `« ${e.titre} » : décompte terminé, la collection en tête s’empare de l’éclair.`
                      : `« ${e.titre} » est terminé : le destin a parlé.`;
                  })
                }
              >
                <ICONS.wait />
                {e.statut === 'decompte'
                  ? 'Terminer le décompte maintenant'
                  : 'Terminer maintenant'}
              </HoldButton>
            )}
            <HoldButton
              size="sm"
              variant="destructive-ghost"
              disabled={action.pending}
              onConfirm={() =>
                action.run(async () => {
                  await deleteEvent(e.id);
                  return `« ${e.titre} » supprimé.`;
                })
              }
            >
              <ICONS.delete />
              Supprimer
            </HoldButton>
          </div>
        </EventCard>
      ))}
    </>
  );
}

// ── World map ──

const emptyPlace = (): PlaceDraft => ({
  nom: '',
  texte: '',
  collection_id: null,
  chapitre_id: null,
  x: 50,
  y: 50,
  image: null,
});

// The world map (64-lore-carte-calques.sql): the blank map, then the places. A place has layers
// (transparent images the size of the map) and is born hidden: its layers wait in the private
// storage; revealing it moves them to the public one and lifts the fog for the players. The preview
// shows every layer, the hidden places' faded.
function MapAdmin() {
  const map = useQuery({ queryKey: loreKeys.map, queryFn: fetchWorldMap });
  const collections = useQuery({ queryKey: adminKeys.collections, queryFn: fetchCollections });
  const chapters = useQuery({ queryKey: loreKeys.chapters, queryFn: fetchChapters });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const hiddenPaths = (map.data?.places ?? []).flatMap((pl) =>
    pl.lore_calques.filter((l) => l.prive).map((l) => l.image_path),
  );
  const signed = useQuery({
    queryKey: [...loreKeys.map, 'private', hiddenPaths.join('|')],
    queryFn: () => privateLayerUrls(hiddenPaths),
    enabled: hiddenPaths.length > 0,
    staleTime: 50 * 60 * 1000,
  });
  const act = useAction();
  const [editing, setEditing] = useState<number | null>(null);
  const [p, setP] = useState(emptyPlace);
  const [pending, setPending] = useState<File[]>([]);
  const [form, setForm] = useState(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const error = map.error ?? collections.error ?? chapters.error;
  if (error) return <AdminError error={error} />;
  if (!map.data || !collections.data || !chapters.data) return <PageSkeleton />;
  const images = mirror.data ?? new Set<string>();
  const picture = imageUrl(map.data.image, images);
  const places = map.data.places;
  const current = places.find((pl) => pl.id === editing) ?? null;
  const layerUrl = (l: Layer) =>
    l.prive ? (signed.data?.get(l.image_path) ?? null) : imageUrl(l.image_path, images);
  const edit = (place: Place) => {
    setEditing(place.id);
    setP({
      nom: place.nom,
      texte: place.texte,
      collection_id: place.collection_id,
      chapitre_id: place.chapitre_id,
      x: place.x,
      y: place.y,
      image: null,
    });
    setPending([]);
    setForm(form + 1);
  };
  const reset = () => {
    setEditing(null);
    setP(emptyPlace());
    setPending([]);
    setForm(form + 1);
  };
  const needMap = () => {
    if (!size) throw new Error('Envoie d’abord la carte de base.');
    return size;
  };
  return (
    <AdminSection
      title="Carte du monde"
      description="Envoie la carte vierge, puis crée les lieux : clique sur la carte pour placer le nom d'un lieu, ajoute ses calques (PNG transparents exactement de la taille de la carte) et révèle-le quand tu veux. Un lieu caché, et ses calques, ne sont jamais envoyés aux joueurs."
    >
      <Field label="Carte de base (la carte vierge)">
        <Input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file)
              act.run(async () => {
                await saveMapImage(file);
                return 'Carte enregistrée.';
              });
          }}
        />
      </Field>
      <Field label="Tempête sur la carte (ce que voient les joueurs dans Lore > Carte)">
        <NativeSelect
          value={String(map.data.tempete)}
          onChange={(e) => {
            const level = Number(e.target.value);
            act.run(async () => {
              await setMapStorm(level);
              return level ? `Tempête sur la carte : intensité ${level}.` : 'Tempête éteinte.';
            });
          }}
        >
          <option value="0">Éteinte</option>
          <option value="1">1 : quelques éclairs lointains</option>
          <option value="2">2 : orage qui gronde</option>
          <option value="3">3 : éclairs partout, flashs dans le ciel</option>
          <option value="4">4 : tempête, ciel sombre et pluie</option>
          <option value="5">5 : déluge d'éclairs</option>
        </NativeSelect>
      </Field>
      {picture && (
        <div
          className="relative cursor-crosshair overflow-hidden rounded-xl"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setP({
              ...p,
              x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10,
              y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10,
            });
          }}
        >
          <img
            src={picture}
            alt=""
            className="block w-full"
            onLoad={(e) =>
              setSize({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
          />
          {places.flatMap((pl) =>
            pl.lore_calques.map((l) => {
              const src = layerUrl(l);
              return src ? (
                <img
                  key={l.id}
                  src={src}
                  alt=""
                  className={`lore-layer pointer-events-none absolute inset-0 size-full ${pl.revele ? '' : 'opacity-45'} ${pl.id === editing ? 'lore-layer-lit' : ''}`}
                />
              ) : null;
            }),
          )}
          <MapPins places={places} onPick={edit} picked={editing} />
          <span
            style={{ '--x': `${p.x}%`, '--y': `${p.y}%` }}
            className="pointer-events-none absolute top-(--y) left-(--x) -translate-x-1/2 -translate-y-1/2"
          >
            <ICONS.add className="size-6" />
          </span>
        </div>
      )}
      {places.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {places.map((pl) => (
            <Button
              key={pl.id}
              size="sm"
              variant={pl.id === editing ? 'default' : 'outline'}
              onClick={() => edit(pl)}
            >
              {pl.nom}
              <Badge variant={pl.revele ? 'success' : 'secondary'}>
                {pl.revele ? 'Révélé' : 'Caché'}
              </Badge>
              {pl.lore_calques.length > 0 && (
                <small className="text-muted-foreground">{pl.lore_calques.length} calque(s)</small>
              )}
            </Button>
          ))}
        </div>
      )}
      <div key={form} className="flex flex-col gap-3 rounded-lg border p-3">
        <b className="text-sm">
          {current ? `Modifier « ${current.nom} »` : 'Nouveau lieu'} (nom affiché à : {p.x} % ·{' '}
          {p.y} %)
        </b>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nom du lieu">
            <Input value={p.nom} onChange={(e) => setP({ ...p, nom: e.target.value })} />
          </Field>
          <Field label="Collection liée">
            <NativeSelect
              value={p.collection_id ?? ''}
              onChange={(e) =>
                setP({ ...p, collection_id: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">—</option>
              {collections.data.list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Chapitre du lore">
            <NativeSelect
              value={p.chapitre_id ?? ''}
              onChange={(e) =>
                setP({ ...p, chapitre_id: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">—</option>
              {chapters.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.titre}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Texte">
          <Textarea
            rows={3}
            value={p.texte}
            onChange={(e) => setP({ ...p, texte: e.target.value })}
          />
        </Field>
        <Field label="Image du lieu (facultative, dans « En savoir plus »)">
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => setP({ ...p, image: e.target.files?.[0] ?? null })}
          />
        </Field>
        <Field label="Ajouter des calques (PNG transparents, taille de la carte)">
          <Input
            type="file"
            accept="image/png,image/webp"
            multiple
            onChange={(e) => setPending([...(e.target.files ?? [])])}
          />
        </Field>
        {current && current.lore_calques.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {current.lore_calques.map((l, i) => {
              const src = layerUrl(l);
              return (
                <div key={l.id} className="flex flex-col items-center gap-1 rounded-md border p-1">
                  <span className="relative block aspect-video w-32 overflow-hidden rounded bg-muted">
                    {picture && (
                      <img src={picture} alt="" className="absolute inset-0 size-full opacity-30" />
                    )}
                    {src && <img src={src} alt="" className="absolute inset-0 size-full" />}
                  </span>
                  <small>Calque {i + 1}</small>
                  <HoldButton
                    size="sm"
                    variant="destructive-ghost"
                    disabled={act.pending}
                    onConfirm={() =>
                      act.run(async () => {
                        await deleteLayer(l);
                        return 'Calque supprimé.';
                      })
                    }
                  >
                    <ICONS.delete />
                    Retirer
                  </HoldButton>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={act.pending}
            onClick={() =>
              act.run(async () => {
                if (pending.length) needMap();
                const id = await savePlace(editing, p);
                const place = places.find((pl) => pl.id === id) ?? {
                  id,
                  revele: false,
                  lore_calques: [],
                };
                const added = pending.length ? await addLayers(place, pending, needMap()) : 0;
                setEditing(id);
                setPending([]);
                setForm(form + 1);
                return added
                  ? `Lieu enregistré, ${added} calque(s) ajouté(s).`
                  : 'Lieu enregistré.';
              })
            }
          >
            <ICONS.save />
            Enregistrer le lieu
          </Button>
          {current && (
            <HoldButton
              variant={current.revele ? 'outline' : 'default'}
              disabled={act.pending}
              onConfirm={() =>
                act.run(async () => {
                  await setPlaceRevealed(current, !current.revele);
                  return current.revele
                    ? `« ${current.nom} » est de nouveau caché.`
                    : `« ${current.nom} » est révélé : le brouillard se lève pour les joueurs.`;
                })
              }
            >
              <ICONS.worldMap />
              {current.revele ? 'Cacher (maintenir)' : 'Révéler (maintenir)'}
            </HoldButton>
          )}
          {current && (
            <>
              <Button variant="outline" onClick={reset}>
                Nouveau lieu
              </Button>
              <HoldButton
                variant="destructive-ghost"
                disabled={act.pending}
                onConfirm={() =>
                  act.run(async () => {
                    await deletePlace(current);
                    reset();
                    return 'Lieu supprimé.';
                  })
                }
              >
                <ICONS.delete />
                Supprimer
              </HoldButton>
            </>
          )}
        </div>
      </div>
      <NoticeView notice={act.notice} />
    </AdminSection>
  );
}

// ── Chapters ──

function ChaptersAdmin() {
  const chapters = useQuery({ queryKey: loreKeys.chapters, queryFn: fetchChapters });
  const act = useAction();
  if (chapters.error) return <AdminError error={chapters.error} />;
  if (!chapters.data) return <PageSkeleton />;
  return (
    <AdminSection
      title="Histoire"
      description="Les chapitres, dans l'ordre (le plus petit numéro d'abord)."
    >
      <ChapterForm
        key={`new-${chapters.data.length}`}
        chapter={null}
        next={chapters.data.length + 1}
        run={act.run}
        pending={act.pending}
      />
      {chapters.data.map((ch) => (
        <ChapterForm key={ch.id} chapter={ch} next={0} run={act.run} pending={act.pending} />
      ))}
      <NoticeView notice={act.notice} />
    </AdminSection>
  );
}

function ChapterForm({
  chapter,
  next,
  run,
  pending,
}: {
  chapter: Chapter | null;
  next: number;
  run: Run;
  pending: boolean;
}) {
  const [titre, setTitre] = useState(chapter?.titre ?? '');
  const [texte, setTexte] = useState(chapter?.texte ?? '');
  const [ordre, setOrdre] = useState(String(chapter?.ordre ?? next));
  const [image, setImage] = useState<File | null>(null);
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <b className="text-sm">{chapter ? `Chapitre « ${chapter.titre} »` : 'Nouveau chapitre'}</b>
      <div className="grid gap-3 sm:layout-main-aside-22">
        <Field label="Titre">
          <Input value={titre} onChange={(e) => setTitre(e.target.value)} />
        </Field>
        <Field label="Ordre">
          <Input type="number" value={ordre} onChange={(e) => setOrdre(e.target.value)} />
        </Field>
      </div>
      <Field label="Texte">
        <Textarea rows={6} value={texte} onChange={(e) => setTexte(e.target.value)} />
      </Field>
      <Field label={chapter?.image_path ? 'Remplacer l’image' : 'Image (facultative)'}>
        <Input
          type="file"
          accept="image/*"
          onChange={(e) => setImage(e.target.files?.[0] ?? null)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            run(async () => {
              await saveChapter(chapter?.id ?? null, {
                titre,
                texte,
                ordre: Number(ordre) || 0,
                image,
              });
              if (!chapter) {
                setTitre('');
                setTexte('');
              }
              return chapter ? 'Chapitre enregistré.' : 'Chapitre ajouté.';
            })
          }
        >
          <ICONS.save />
          {chapter ? 'Enregistrer' : 'Ajouter le chapitre'}
        </Button>
        {chapter && (
          <HoldButton
            variant="destructive-ghost"
            disabled={pending}
            onConfirm={() =>
              run(async () => {
                await deleteChapter(chapter.id);
                return 'Chapitre supprimé.';
              })
            }
          >
            <ICONS.delete />
            Supprimer
          </HoldButton>
        )}
      </div>
    </div>
  );
}
