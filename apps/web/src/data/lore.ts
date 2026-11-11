// The lore (60-lore.sql): the story's chapters, the world map (an image and its places, each tied to
// a collection; 64-lore-carte-calques.sql: each place has layers, transparent images the size of the
// map, and stays hidden, layers in the private storage, until the admin reveals it) and the events. An event is a defence (each player places one of their fighters:
// key fighters add a lot, once each; the others a little; harmful ones take some away) or a vote
// (each player votes for an option with its own chance). One draw at the end decides; on success,
// each participant has a chance to get the reward card. The site resolves the events past their
// end when it lists them (evenements_resoudre).

import { z } from 'zod';
import { call, lighten, removeImages, uploadImage } from '@/data/admin';
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

const Layer = z.object({
  id: Num,
  image_path: z.string(),
  prive: z.boolean(),
  ordre: Num,
});
export type Layer = z.infer<typeof Layer>;

const Place = z.object({
  id: Num,
  nom: z.string(),
  texte: z.string(),
  image_path: z.string().nullable(),
  collection_id: NumOrNull,
  chapitre_id: NumOrNull,
  revele: z.boolean(),
  x: Num,
  y: Num,
  collections: z.object({ nom: z.string() }).nullable(),
  lore_calques: z.array(Layer),
});
export type Place = z.infer<typeof Place>;

// The map and its places: a player gets the revealed places and their public layers only (the
// database filters), the admin gets everything.
// tempete: the storm over the map, 0 (none) to 5 (80-tempete-et-intensite-orage.sql).
export async function fetchWorldMap(): Promise<{
  image: string | null;
  tempete: number;
  places: Place[];
}> {
  const [map, places] = await Promise.all([
    call(supabase.from('lore_carte').select('image_path,tempete').eq('id', 1).maybeSingle()),
    call(
      supabase
        .from('lore_lieux')
        .select(
          'id,nom,texte,image_path,collection_id,chapitre_id,revele,x,y,collections(nom),lore_calques(id,image_path,prive,ordre)',
        )
        .order('id'),
    ),
  ]);
  const row = z
    .object({ image_path: z.string().nullable(), tempete: Num.default(0) })
    .nullable()
    .parse(map);
  return {
    image: row?.image_path ?? null,
    tempete: row?.tempete ?? 0,
    places: z
      .array(Place)
      .parse(places)
      .map((p) => ({
        ...p,
        lore_calques: [...p.lore_calques].sort((a, b) => a.ordre - b.ordre || a.id - b.id),
      })),
  };
}

// The storm over the world map, 0 (none) to 5. Admin only.
export async function setMapStorm(level: number): Promise<void> {
  const tempete = Math.max(0, Math.min(5, Math.round(level)));
  await call(supabase.from('lore_carte').upsert({ id: 1, tempete }));
}

export async function saveMapImage(file: File): Promise<void> {
  const image_path = await uploadImage(file, { prefix: 'lore/', maxHeight: 2400, quality: 0.9 });
  await call(supabase.from('lore_carte').upsert({ id: 1, image_path }));
}

export type PlaceDraft = {
  nom: string;
  texte: string;
  collection_id: number | null;
  chapitre_id: number | null;
  x: number;
  y: number;
  image: File | null;
};

// Creates or updates a place; a new place is born hidden. Returns its id.
export async function savePlace(id: number | null, d: PlaceDraft): Promise<number> {
  if (!d.nom.trim()) throw new Error('Donne un nom au lieu.');
  const row: Record<string, unknown> = {
    nom: d.nom.trim(),
    texte: d.texte,
    collection_id: d.collection_id,
    chapitre_id: d.chapitre_id,
    x: Math.min(100, Math.max(0, d.x)),
    y: Math.min(100, Math.max(0, d.y)),
  };
  if (d.image) row.image_path = await upload(d.image);
  const saved =
    id === null
      ? await call(supabase.from('lore_lieux').insert(row).select('id').single())
      : await call(supabase.from('lore_lieux').update(row).eq('id', id).select('id').single());
  return z.object({ id: Num }).parse(saved).id;
}

// ── Layers: the private storage (lore-secret) while their place is hidden, the public one after ──

const SECRET = 'lore-secret';
const CACHE_ONE_YEAR = '31536000';
const bucketOf = (l: { prive: boolean }) => (l.prive ? SECRET : 'cartes');

async function storeLayer(blob: Blob, hidden: boolean): Promise<string> {
  const path = hidden ? `${crypto.randomUUID()}.webp` : `lore/calques/${crypto.randomUUID()}.webp`;
  const type = blob.type || 'image/webp';
  const options = hidden
    ? { contentType: type }
    : { contentType: type, cacheControl: CACHE_ONE_YEAR };
  await call(supabase.storage.from(hidden ? SECRET : 'cartes').upload(path, blob, options));
  return path;
}

async function removeLayerFile(l: { prive: boolean; image_path: string }): Promise<void> {
  if (l.prive) await call(supabase.storage.from(SECRET).remove([l.image_path]));
  else await removeImages([l.image_path]);
}

const sizeOf = async (file: Blob) => {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
};

// Adds layers to a place: each must be exactly the map's size (or it would not line up), and goes
// to the private storage unless the place is already revealed.
export async function addLayers(
  place: { id: number; revele: boolean; lore_calques: Layer[] },
  files: File[],
  map: { width: number; height: number },
): Promise<number> {
  for (const file of files) {
    const s = await sizeOf(file);
    if (s.width !== map.width || s.height !== map.height)
      throw new Error(
        `« ${file.name} » fait ${s.width} × ${s.height} px, la carte ${map.width} × ${map.height} : un calque doit avoir exactement la taille de la carte.`,
      );
  }
  let ordre = Math.max(-1, ...place.lore_calques.map((l) => l.ordre));
  for (const file of files) {
    ordre += 1;
    const blob = await lighten(file, 8000, 0.92);
    const image_path = await storeLayer(blob, !place.revele);
    await call(
      supabase
        .from('lore_calques')
        .insert({ lieu_id: place.id, image_path, prive: !place.revele, ordre }),
    );
  }
  return files.length;
}

export async function deleteLayer(l: Layer): Promise<void> {
  await removeLayerFile(l);
  await call(supabase.from('lore_calques').delete().eq('id', l.id));
}

// Moves a layer to the public (shown) or private (hidden) storage.
async function moveLayer(l: Layer, hidden: boolean): Promise<void> {
  if (l.prive === hidden) return;
  const blob = z
    .instanceof(Blob)
    .parse(await call(supabase.storage.from(bucketOf(l)).download(l.image_path)));
  const image_path = await storeLayer(blob, hidden);
  await call(supabase.from('lore_calques').update({ image_path, prive: hidden }).eq('id', l.id));
  await removeLayerFile(l);
}

// Reveals a place (its layers move to the public storage first) or hides it again (it disappears
// for the players first, then its layers go back to the private storage).
export async function setPlaceRevealed(place: Place, revealed: boolean): Promise<void> {
  if (revealed) {
    for (const l of place.lore_calques) await moveLayer(l, false);
    await call(supabase.from('lore_lieux').update({ revele: true }).eq('id', place.id));
  } else {
    await call(supabase.from('lore_lieux').update({ revele: false }).eq('id', place.id));
    for (const l of place.lore_calques) await moveLayer(l, true);
  }
}

// The admin's preview of hidden layers: short-lived links to the private storage.
export async function privateLayerUrls(paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const signed = z
    .array(z.object({ path: z.string().nullable(), signedUrl: z.string().nullable() }))
    .parse(await call(supabase.storage.from(SECRET).createSignedUrls(paths, 3600)));
  return new Map(
    signed.flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])),
  );
}

export async function deletePlace(place: Place): Promise<void> {
  for (const l of place.lore_calques) await removeLayerFile(l);
  await call(supabase.from('lore_lieux').delete().eq('id', place.id));
}

// ── Events ──

const Option = z.object({
  id: Num,
  libelle: z.string(),
  collection_id: NumOrNull,
  image_path: z.string().nullable(),
  chance: NumOrNull, // null: hidden from the players (73-evenement-chances-cachees.sql)
  voix: Num,
  // 72-evenement-eclair.sql: its speed, and its trip to the lightning in hours (null without one)
  vitesse: Num.default(10),
  trajet_heures: NumOrNull.default(null),
  // 75-evenement-trajet-fixe.sql: a fixed trip in minutes (a faction that teleports)
  trajet_minutes: NumOrNull.default(null),
  // 76-evenement-contestation.sql: in a contest, 'non' (no contest) or 'toutes' (every collection);
  // null: a collection (collection_id; none = Basique)
  role: z.enum(['non', 'toutes']).nullable().default(null),
});
export type EventOption = z.infer<typeof Option>;

const KeyFighter = z.object({
  carte_id: Num,
  role: z.enum(['cle', 'nuisible']),
  nom: z.string(),
});

// A fighter placed in a defence: its player, the card's first image, and its role once the keys
// are shown (null otherwise, or for an ordinary fighter).
const Defender = z.object({
  pseudo: z.string(),
  nom: z.string(),
  image_path: z.string().nullable(),
  role: z.enum(['cle', 'nuisible']).nullable(),
});
export type Defender = z.infer<typeof Defender>;

const LoreEvent = z.object({
  id: Num,
  type: z.enum(['defense', 'vote', 'contestation']),
  titre: z.string(),
  texte: z.string(),
  image_path: z.string().nullable(),
  fin: z.string(),
  // 'decompte': a contest whose vote said yes, counting its points (76-evenement-contestation.sql)
  statut: z.enum(['ouvert', 'decompte', 'resolu']),
  reussi: z.boolean().nullable(),
  chance_finale: NumOrNull,
  tirage: NumOrNull,
  option_gagnante: NumOrNull,
  recompense_pct: Num,
  recompense_variante_id: NumOrNull,
  recompense_nom: z.string().nullable(),
  recompense_image: z.string().nullable(),
  // 70-evenements-boss.sql: the attacking card (a precise version) and the place it attacks
  // (a revealed place only, for the players)
  attaquant_nom: z.string().nullable().default(null),
  attaquant_image: z.string().nullable().default(null),
  lieu_id: NumOrNull.default(null),
  lieu_nom: z.string().nullable().default(null),
  // 72-evenement-eclair.sql: where the lightning fell (% of the map), and when the faction sent
  // arrives there (the end of the vote plus its trip; null without a lightning)
  eclair_x: NumOrNull.default(null),
  eclair_y: NumOrNull.default(null),
  arrivee: z.string().nullable().default(null),
  // 74-evenement-pot-manches.sql: a vote that sends its faction at seuil_votes votes, round after
  // round (manche), with no end date; the faction on its way (depart, option_envoyee); the round's
  // votes; the pot (admin only); the player's share; the attempts so far
  seuil_votes: NumOrNull.default(null),
  manche: Num.default(1),
  depart: z.string().nullable().default(null),
  option_envoyee: NumOrNull.default(null),
  votes_manche: Num.default(0),
  pot: NumOrNull.default(null),
  mon_gain: NumOrNull.default(null),
  ma_manche: NumOrNull.default(null),
  tentatives: z
    .array(z.object({ manche: Num, option_id: NumOrNull, reussi: z.boolean(), tirage: Num }))
    .default([]),
  // 76-evenement-contestation.sql: a contest of a lightning's holder (eclair_evenement_id, the
  // lightning event; defenseur_collection, its holder). After a yes, the engaged collections score a
  // point per win of their fighter in a normal combat, from decompte_debut to decompte_fin (set by the
  // admin); the best takes the lightning (gagnant_collection). A collection's key: its id, 0 = Basique.
  eclair_evenement_id: NumOrNull.default(null),
  defenseur_collection: NumOrNull.default(null),
  defenseur_nom: z.string().nullable().default(null),
  collections_engagees: z.array(Num).nullable().default(null),
  decompte_debut: z.string().nullable().default(null),
  decompte_fin: z.string().nullable().default(null),
  gagnant_collection: NumOrNull.default(null),
  gagnant_nom: z.string().nullable().default(null),
  points: z
    .array(z.object({ collection: Num, nom: z.string().nullable(), points: Num }))
    .default([]),
  base_pct: Num,
  cle_pct: Num,
  autre_pct: Num,
  nuisible_pct: Num,
  montrer_cles: z.boolean(),
  // 73-evenement-chances-cachees.sql: false, the players see no chance until the result
  montrer_chances: z.boolean().default(true),
  chance: NumOrNull,
  participants: Num,
  ma_carte: NumOrNull,
  mon_option: NumOrNull,
  ma_recompense: z.boolean().nullable(),
  vu: z.boolean(),
  combattants: z.array(KeyFighter),
  defenseurs: z.array(Defender).default([]),
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
// (A contest has no result to play out: its card shows the score.)
export const eventTodo = (list: LoreEvent[]): 'todo' | 'news' | null =>
  list.some(
    (e) =>
      e.type !== 'contestation' &&
      e.statut === 'resolu' &&
      (e.ma_carte !== null || e.mon_option !== null) &&
      !e.vu,
  )
    ? 'news'
    : list.some((e) => e.statut === 'ouvert' && e.ma_carte === null && e.mon_option === null)
      ? 'todo'
      : null;

export type OptionDraft = {
  libelle: string;
  collection_id: number | null;
  chance: number;
  vitesse: number;
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
  attaquant_variante_id: number | null;
  lieu_id: number | null;
  eclair_x: number | null;
  eclair_y: number | null;
  base_pct: number;
  cle_pct: number;
  autre_pct: number;
  nuisible_pct: number;
  montrer_cles: boolean;
  montrer_chances: boolean;
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
          attaquant_variante_id: d.attaquant_variante_id,
          lieu_id: d.lieu_id,
          eclair_x: d.type === 'vote' ? d.eclair_x : null,
          eclair_y: d.type === 'vote' ? d.eclair_y : null,
          base_pct: d.base_pct,
          cle_pct: d.cle_pct,
          autre_pct: d.autre_pct,
          nuisible_pct: d.nuisible_pct,
          montrer_cles: d.montrer_cles,
          montrer_chances: d.montrer_chances,
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
        vitesse: Math.min(100, Math.max(1, Math.round(o.vitesse))),
        image_path: await upload(o.image),
        ordre: i,
      });
    await call(supabase.from('evenements_options').insert(rows));
  }
}

// A contest's end of counting (null: not set yet). Admin only.
export async function setCountEnd(id: number, end: string | null): Promise<void> {
  const date = end ? new Date(end) : null;
  if (date && Number.isNaN(date.getTime())) throw new Error('Date invalide.');
  await call(
    supabase
      .from('evenements')
      .update({ decompte_fin: date ? date.toISOString() : null })
      .eq('id', id),
  );
}

// The collection holding each lightning: the last finished contest of it decides, otherwise the
// faction its event sent (a successful lightning event). Key: the lightning event's id; value: the
// holder's collection key (0 = Basique) and whether a contest about it is counting right now.
export function lightningHolders(
  list: LoreEvent[],
): Map<number, { collection: number; contested: boolean; titre: string }> {
  const holders = new Map<number, { collection: number; contested: boolean; titre: string }>();
  const byId = [...list].sort((a, b) => a.id - b.id);
  for (const e of byId) {
    if (e.type === 'contestation' || e.eclair_x === null) continue;
    if (e.statut !== 'resolu' || !e.reussi) continue;
    const sent = e.options.find((o) => o.id === (e.option_envoyee ?? e.option_gagnante));
    if (sent)
      holders.set(e.id, { collection: sent.collection_id ?? 0, contested: false, titre: e.titre });
  }
  for (const e of byId) {
    if (e.type !== 'contestation' || e.eclair_evenement_id === null) continue;
    const h = holders.get(e.eclair_evenement_id);
    if (!h) continue;
    if (e.statut === 'resolu' && e.gagnant_collection !== null)
      holders.set(e.eclair_evenement_id, {
        ...h,
        collection: e.gagnant_collection,
        contested: false,
      });
    else if (e.statut === 'decompte') holders.set(e.eclair_evenement_id, { ...h, contested: true });
  }
  return holders;
}

export async function endEventNow(id: number): Promise<void> {
  await call(supabase.rpc('evenement_terminer', { p_id: id }));
}

export async function deleteEvent(id: number): Promise<void> {
  await call(supabase.from('evenements').delete().eq('id', id));
}
