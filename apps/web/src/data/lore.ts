// The lore (60-lore.sql): the story's chapters, the world map (an image and its places, each tied to
// a collection) and the events. An event is a defence (each player places one of their fighters:
// key fighters add a lot, once each; the others a little; harmful ones take some away) or a vote
// (each player votes for an option with its own chance). One draw at the end decides; on success,
// each participant has a chance to get the reward card. The site resolves the events past their
// end when it lists them (evenements_resoudre).

import { z } from 'zod';
import { call, uploadImage } from '@/data/admin';
import { supabase } from '@/lib/supabase';

const Num = z.union([z.number(), z.string()]).transform(Number);
const NumOrNull = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => (v === null ? null : Number(v)));

export const loreKeys = {
  chapters: ['lore', 'chapters'] as const,
  map: ['lore', 'map'] as const,
  events: ['lore', 'events'] as const,
};
export const EVENTS_REFRESH = 60 * 1000;

// ── Chapters ──

const Chapter = z.object({
  id: Num,
  titre: z.string(),
  texte: z.string(),
  image_path: z.string().nullable(),
  ordre: Num,
});
export type Chapter = z.infer<typeof Chapter>;

export async function fetchChapters(): Promise<Chapter[]> {
  return z
    .array(Chapter)
    .parse(
      await call(
        supabase
          .from('lore_chapitres')
          .select('id,titre,texte,image_path,ordre')
          .order('ordre')
          .order('id'),
      ),
    );
}

const upload = (file: File | null) =>
  file ? uploadImage(file, { prefix: 'lore/' }) : Promise.resolve(null);

export async function saveChapter(
  id: number | null,
  d: { titre: string; texte: string; ordre: number; image: File | null },
): Promise<void> {
  if (!d.titre.trim()) throw new Error('Donne un titre au chapitre.');
  const row: Record<string, unknown> = { titre: d.titre.trim(), texte: d.texte, ordre: d.ordre };
  if (d.image) row.image_path = await upload(d.image);
  if (id === null) await call(supabase.from('lore_chapitres').insert(row));
  else await call(supabase.from('lore_chapitres').update(row).eq('id', id));
}

export async function deleteChapter(id: number): Promise<void> {
  await call(supabase.from('lore_chapitres').delete().eq('id', id));
}

// ── World map ──

const Place = z.object({
  id: Num,
  nom: z.string(),
  texte: z.string(),
  image_path: z.string().nullable(),
  collection_id: NumOrNull,
  x: Num,
  y: Num,
  collections: z.object({ nom: z.string() }).nullable(),
});
export type Place = z.infer<typeof Place>;

export async function fetchWorldMap(): Promise<{ image: string | null; places: Place[] }> {
  const [map, places] = await Promise.all([
    call(supabase.from('lore_carte').select('image_path').eq('id', 1).maybeSingle()),
    call(
      supabase
        .from('lore_lieux')
        .select('id,nom,texte,image_path,collection_id,x,y,collections(nom)')
        .order('id'),
    ),
  ]);
  return {
    image:
      z.object({ image_path: z.string().nullable() }).nullable().parse(map)?.image_path ?? null,
    places: z.array(Place).parse(places),
  };
}

export async function saveMapImage(file: File): Promise<void> {
  const image_path = await uploadImage(file, { prefix: 'lore/', maxHeight: 2400, quality: 0.9 });
  await call(supabase.from('lore_carte').upsert({ id: 1, image_path }));
}

export type PlaceDraft = {
  nom: string;
  texte: string;
  collection_id: number | null;
  x: number;
  y: number;
  image: File | null;
};

export async function savePlace(id: number | null, d: PlaceDraft): Promise<void> {
  if (!d.nom.trim()) throw new Error('Donne un nom au lieu.');
  const row: Record<string, unknown> = {
    nom: d.nom.trim(),
    texte: d.texte,
    collection_id: d.collection_id,
    x: Math.min(100, Math.max(0, d.x)),
    y: Math.min(100, Math.max(0, d.y)),
  };
  if (d.image) row.image_path = await upload(d.image);
  if (id === null) await call(supabase.from('lore_lieux').insert(row));
  else await call(supabase.from('lore_lieux').update(row).eq('id', id));
}

export async function deletePlace(id: number): Promise<void> {
  await call(supabase.from('lore_lieux').delete().eq('id', id));
}

// ── Events ──

const Option = z.object({
  id: Num,
  libelle: z.string(),
  collection_id: NumOrNull,
  image_path: z.string().nullable(),
  chance: Num,
  voix: Num,
});
export type EventOption = z.infer<typeof Option>;

const KeyFighter = z.object({
  carte_id: Num,
  role: z.enum(['cle', 'nuisible']),
  nom: z.string(),
});

const LoreEvent = z.object({
  id: Num,
  type: z.enum(['defense', 'vote']),
  titre: z.string(),
  texte: z.string(),
  image_path: z.string().nullable(),
  fin: z.string(),
  statut: z.enum(['ouvert', 'resolu']),
  reussi: z.boolean().nullable(),
  chance_finale: NumOrNull,
  tirage: NumOrNull,
  option_gagnante: NumOrNull,
  recompense_pct: Num,
  recompense_variante_id: NumOrNull,
  recompense_nom: z.string().nullable(),
  recompense_image: z.string().nullable(),
  base_pct: Num,
  cle_pct: Num,
  autre_pct: Num,
  nuisible_pct: Num,
  montrer_cles: z.boolean(),
  chance: NumOrNull,
  participants: Num,
  ma_carte: NumOrNull,
  mon_option: NumOrNull,
  ma_recompense: z.boolean().nullable(),
  vu: z.boolean(),
  combattants: z.array(KeyFighter),
  options: z.array(Option),
});
export type LoreEvent = z.infer<typeof LoreEvent>;

// Resolves the events past their end first (anyone may: one draw each, done once).
export async function fetchEvents(): Promise<LoreEvent[]> {
  const { data: session } = await supabase.auth.getSession();
  if (session.session) await supabase.rpc('evenements_resoudre');
  return z.array(LoreEvent).parse(await call(supabase.rpc('evenements_liste')));
}

export async function joinEvent(id: number, card: number | null, option: number | null) {
  await call(supabase.rpc('participer_evenement', { p_id: id, p_carte: card, p_option: option }));
}

export async function markEventSeen(id: number): Promise<void> {
  await call(supabase.rpc('evenement_vu', { p_id: id }));
}

// An open event the player has not joined, or a result they have not seen: the sidebar's dot.
export const eventTodo = (list: LoreEvent[]): 'todo' | 'news' | null =>
  list.some((e) => e.statut === 'resolu' && (e.ma_carte !== null || e.mon_option !== null) && !e.vu)
    ? 'news'
    : list.some((e) => e.statut === 'ouvert' && e.ma_carte === null && e.mon_option === null)
      ? 'todo'
      : null;

export type OptionDraft = {
  libelle: string;
  collection_id: number | null;
  chance: number;
  image: File | null;
};
export type EventDraft = {
  type: 'defense' | 'vote';
  titre: string;
  texte: string;
  image: File | null;
  fin: string; // datetime-local, Paris time of the admin's browser
  recompense_variante_id: number | null;
  recompense_pct: number;
  base_pct: number;
  cle_pct: number;
  autre_pct: number;
  nuisible_pct: number;
  montrer_cles: boolean;
  cles: number[];
  nuisibles: number[];
  options: OptionDraft[];
};

export async function createEvent(d: EventDraft): Promise<void> {
  if (!d.titre.trim()) throw new Error("Donne un titre à l'événement.");
  const end = new Date(d.fin);
  if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now())
    throw new Error('Choisis une fin dans le futur.');
  const options = d.type === 'vote' ? d.options.filter((o) => o.libelle.trim()) : [];
  if (d.type === 'vote' && options.length < 2) throw new Error('Un vote a besoin de deux options.');
  const created = z.object({ id: Num }).parse(
    await call(
      supabase
        .from('evenements')
        .insert({
          type: d.type,
          titre: d.titre.trim(),
          texte: d.texte.trim(),
          image_path: await upload(d.image),
          fin: end.toISOString(),
          recompense_variante_id: d.recompense_variante_id,
          recompense_pct: d.recompense_pct,
          base_pct: d.base_pct,
          cle_pct: d.cle_pct,
          autre_pct: d.autre_pct,
          nuisible_pct: d.nuisible_pct,
          montrer_cles: d.montrer_cles,
        })
        .select('id')
        .single(),
    ),
  );
  if (d.type === 'defense') {
    const rows = [
      ...d.cles.map((carte_id) => ({ evenement_id: created.id, carte_id, role: 'cle' })),
      ...d.nuisibles
        .filter((id) => !d.cles.includes(id))
        .map((carte_id) => ({ evenement_id: created.id, carte_id, role: 'nuisible' })),
    ];
    if (rows.length) await call(supabase.from('evenements_combattants').insert(rows));
  } else {
    const rows = [];
    for (const [i, o] of options.entries())
      rows.push({
        evenement_id: created.id,
        libelle: o.libelle.trim(),
        collection_id: o.collection_id,
        chance: Math.min(100, Math.max(0, o.chance)),
        image_path: await upload(o.image),
        ordre: i,
      });
    await call(supabase.from('evenements_options').insert(rows));
  }
}

export async function endEventNow(id: number): Promise<void> {
  await call(supabase.rpc('evenement_terminer', { p_id: id }));
}

export async function deleteEvent(id: number): Promise<void> {
  await call(supabase.from('evenements').delete().eq('id', id));
}
