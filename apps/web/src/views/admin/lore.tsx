// Admin · Lore (60-lore.sql): the events (a defence with its key and harmful fighters, or a vote with
// its options and their chances; the reward card and its chance), the world map (its image, and its
// places, placed with a click on the map) and the story's chapters.

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
  type Chapter,
  createEvent,
  deleteChapter,
  deleteEvent,
  deletePlace,
  endEventNow,
  type EventDraft,
  fetchChapters,
  fetchEvents,
  fetchWorldMap,
  loreKeys,
  type Place,
  type PlaceDraft,
  saveChapter,
  saveMapImage,
  savePlace,
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

const emptyEvent = (): EventDraft => ({
  type: 'defense',
  titre: '',
  texte: '',
  image: null,
  fin: defaultEnd(),
  recompense_variante_id: null,
  recompense_pct: 40,
  base_pct: 0,
  cle_pct: 20,
  autre_pct: 2,
  nuisible_pct: 10,
  montrer_cles: false,
  cles: [],
  nuisibles: [],
  options: [
    { libelle: '', collection_id: null, chance: 50, image: null },
    { libelle: '', collection_id: null, chance: 50, image: null },
  ],
});

// ── Events ──

function EventsAdmin() {
  const events = useQuery({ queryKey: loreKeys.events, queryFn: fetchEvents });
  const variants = useQuery({ queryKey: adminKeys.variants, queryFn: fetchVariants });
  const cards = useQuery({ queryKey: adminKeys.cards, queryFn: fetchCardList });
  const collections = useQuery({ queryKey: adminKeys.collections, queryFn: fetchCollections });
  const add = useAction();
  const action = useAction();
  const [d, setD] = useState(emptyEvent);
  const [form, setForm] = useState(0);
  const set = (patch: Partial<EventDraft>) => setD({ ...d, ...patch });

  const error = events.error ?? variants.error ?? cards.error ?? collections.error;
  if (error) return <AdminError error={error} />;
  if (!events.data || !variants.data || !cards.data || !collections.data) return <PageSkeleton />;
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
            onValueChange={(v) => v && set({ type: v === 'vote' ? 'vote' : 'defense' })}
          >
            <ToggleGroupItem value="defense">
              <ICONS.combat />
              Défense
            </ToggleGroupItem>
            <ToggleGroupItem value="vote">
              <ICONS.votes />
              Vote de collection
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
            <Field label="Carte récompense (une version précise)">
              <NativeSelect
                value={d.recompense_variante_id ?? ''}
                onChange={(e) =>
                  set({ recompense_variante_id: e.target.value ? Number(e.target.value) : null })
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
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <b className="text-sm">Options du vote</b>
              {d.options.map((o, i) => (
                <div key={i} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-4">
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
                        { libelle: '', collection_id: null, chance: 50, image: null },
                      ],
                    })
                  }
                >
                  <ICONS.add />
                  Ajouter une option
                </Button>
              </div>
            </div>
          )}
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
            {e.statut === 'ouvert' && (
              <HoldButton
                size="sm"
                variant="outline"
                disabled={action.pending}
                onConfirm={() =>
                  action.run(async () => {
                    await endEventNow(e.id);
                    return `« ${e.titre} » est terminé : le destin a parlé.`;
                  })
                }
              >
                <ICONS.wait />
                Terminer maintenant
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
  x: 50,
  y: 50,
  image: null,
});

function MapAdmin() {
  const map = useQuery({ queryKey: loreKeys.map, queryFn: fetchWorldMap });
  const collections = useQuery({ queryKey: adminKeys.collections, queryFn: fetchCollections });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const act = useAction();
  const [editing, setEditing] = useState<number | null>(null);
  const [p, setP] = useState(emptyPlace);
  const [form, setForm] = useState(0);
  const error = map.error ?? collections.error;
  if (error) return <AdminError error={error} />;
  if (!map.data || !collections.data) return <PageSkeleton />;
  const picture = imageUrl(map.data.image, mirror.data ?? new Set<string>());
  const edit = (place: Place) => {
    setEditing(place.id);
    setP({
      nom: place.nom,
      texte: place.texte,
      collection_id: place.collection_id,
      x: place.x,
      y: place.y,
      image: null,
    });
    setForm(form + 1);
  };
  const reset = () => {
    setEditing(null);
    setP(emptyPlace());
    setForm(form + 1);
  };
  return (
    <AdminSection
      title="Carte du monde"
      description="Envoie l'illustration de la carte, puis clique dessus pour placer un lieu (ou clique sur un lieu pour le modifier)."
    >
      <Field label="Image de la carte">
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
      {picture && (
        <div
          className="relative cursor-crosshair"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setP({
              ...p,
              x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10,
              y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10,
            });
          }}
        >
          <img src={picture} alt="" className="w-full rounded-xl" />
          <MapPins places={map.data.places} onPick={edit} picked={editing} />
          <span
            style={{ '--x': `${p.x}%`, '--y': `${p.y}%` }}
            className="pointer-events-none absolute top-(--y) left-(--x) -translate-x-1/2 -translate-y-1/2"
          >
            <ICONS.add className="size-6" />
          </span>
        </div>
      )}
      <div key={form} className="flex flex-col gap-3 rounded-lg border p-3">
        <b className="text-sm">
          {editing === null ? 'Nouveau lieu' : 'Modifier le lieu'} (position : {p.x} % · {p.y} %)
        </b>
        <div className="grid gap-3 sm:grid-cols-2">
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
        </div>
        <Field label="Texte">
          <Textarea
            rows={3}
            value={p.texte}
            onChange={(e) => setP({ ...p, texte: e.target.value })}
          />
        </Field>
        <Field label="Image du lieu (facultative)">
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => setP({ ...p, image: e.target.files?.[0] ?? null })}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={act.pending}
            onClick={() =>
              act.run(async () => {
                await savePlace(editing, p);
                reset();
                return 'Lieu enregistré.';
              })
            }
          >
            <ICONS.save />
            Enregistrer le lieu
          </Button>
          {editing !== null && (
            <>
              <Button variant="outline" onClick={reset}>
                Nouveau lieu
              </Button>
              <HoldButton
                variant="destructive-ghost"
                disabled={act.pending}
                onConfirm={() =>
                  act.run(async () => {
                    await deletePlace(editing);
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
