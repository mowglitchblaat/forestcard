// The admin's reads and writes, through the same tables and functions as the legacy page's admin
// (vAdmin and its sub-views). Every request needs the admin role: the database refuses the others
// (RLS). A refusal is thrown with the database's message, already worded for the admin.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

type Response = { data: unknown; error: { message: string } | null };

// The data of a request, or its error thrown.
export async function call(request: PromiseLike<Response>): Promise<unknown> {
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return data;
}

export const adminKeys = {
  all: ['admin'] as const,
  settings: ['admin', 'settings'] as const,
  collections: ['admin', 'collections'] as const,
  rarities: ['admin', 'rarities'] as const,
  players: ['admin', 'players'] as const,
  playerCards: (id: string) => ['admin', 'playerCards', id] as const,
  backs: ['admin', 'backs'] as const,
  boosters: ['admin', 'boosters'] as const,
  boostersFull: ['admin', 'boostersFull'] as const,
  effects: ['admin', 'effects'] as const,
  variants: ['admin', 'variants'] as const,
  cards: ['admin', 'cards'] as const,
};

const Num = z.union([z.number(), z.string()]).transform(Number);
const NumOrNull = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => (v === null ? null : Number(v)));
// A player id (uuid) or a numeric id, passed back as it came.
export const Id = z.union([z.number(), z.string()]);
export type Id = z.infer<typeof Id>;

// ── Images ──

// A year in the browser's cache: an uploaded file never changes (a new image gets a new name).
const CACHE_ONE_YEAR = '31536000';

// Lighter images, as the legacy page sends them (alleger): WebP, transparency kept, at most maxHeight
// pixels high; kept as they are when not smaller (an animated GIF, a small image).
export async function lighten(file: File, maxHeight = 1200, quality = 0.86): Promise<Blob> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxHeight / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) =>
      canvas.toBlob(done, 'image/webp', quality),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

// Uploads an image to the card storage, lightened; returns its path. prefix: a folder ('dessins/').
export async function uploadImage(
  file: File,
  { maxHeight = 1200, quality = 0.86, prefix = '' } = {},
): Promise<string> {
  const light = await lighten(file, maxHeight, quality);
  const ext = light.type === 'image/webp' ? 'webp' : (file.name.split('.').pop() ?? 'png');
  const path = `${prefix}${crypto.randomUUID()}.${ext}`;
  await call(
    supabase.storage
      .from('cartes')
      .upload(path, light, { contentType: light.type || file.type, cacheControl: CACHE_ONE_YEAR }),
  );
  return path;
}

// Uploads an image already made (the composer's WebP), as it is.
export async function uploadReady(blob: Blob): Promise<string> {
  const path = `${crypto.randomUUID()}.webp`;
  await call(
    supabase.storage
      .from('cartes')
      .upload(path, blob, { contentType: 'image/webp', cacheControl: CACHE_ONE_YEAR }),
  );
  return path;
}

// ── Settings (reglages_jeu: key → text value) ──

const SettingRow = z.object({ cle: z.string(), valeur: z.string().nullable() });
export type Settings = Record<string, string>;

export async function fetchSettings(): Promise<Settings> {
  const rows = z
    .array(SettingRow)
    .parse(await call(supabase.from('reglages_jeu').select('cle,valeur')));
  return Object.fromEntries(rows.map((r) => [r.cle, r.valeur ?? '']));
}

export async function saveSettings(values: Record<string, string | number>): Promise<void> {
  await call(
    supabase
      .from('reglages_jeu')
      .upsert(Object.entries(values).map(([cle, v]) => ({ cle, valeur: String(v) }))),
  );
}

// A setting's value, or its default when the admin never set it.
export const setting = (s: Settings, key: string, fallback: string | number): string =>
  s[key] ?? String(fallback);

// The game's state, as the database reads it (etat_jeu): live, paused (played on the site) or
// closed everywhere.
const GameStateRow = z.object({
  live: z.boolean().optional(),
  ferme: z.boolean().optional(),
  prix_duel: z.union([z.number(), z.string()]).optional(),
});
export type GameState = { live: boolean; closed: boolean; duelPrice: number };

export async function fetchGameState(): Promise<GameState> {
  const { data, error } = await supabase.rpc('etat_jeu');
  if (error || !data) return { live: true, closed: false, duelPrice: 50 };
  const row = GameStateRow.parse(data);
  return {
    live: row.live !== false,
    closed: row.ferme === true,
    duelPrice: Math.max(0, Number.parseInt(String(row.prix_duel ?? 50), 10) || 0),
  };
}

export const gameStateKey = ['gameState'] as const;

// Whether the belts' bonuses are locked today (42-primes-verrou.sql): checks the function exists.
export async function checkTitleLock(): Promise<void> {
  await call(supabase.rpc('titre_verrouille'));
}

export async function resetDailyCombats(): Promise<void> {
  await call(supabase.rpc('admin_reset_combats_jour'));
}

// Championship tools (62-admin-ceintures-avertissements.sql): vacate a belt, and the players with
// warnings still counting or a deprivation running, whose warnings the admin can clear.
export async function vacateBelt(division: string): Promise<string> {
  const who = await call(supabase.rpc('admin_ceinture_vacante', { p_division: division }));
  return z.string().parse(who);
}

const SanctionRow = z.object({
  joueur: z.string(),
  pseudo: z.string().nullable(),
  avertissements: Num,
  prive_jusqua: z.string().nullable(),
});
export type SanctionRow = z.infer<typeof SanctionRow>;
export async function fetchTitleSanctions(): Promise<SanctionRow[]> {
  return z.array(SanctionRow).parse(await call(supabase.rpc('admin_titre_sanctions')));
}

const Cleared = z.object({ avertissements: Num, privations: Num });
export async function clearWarnings(
  player: string,
  deprivation: boolean,
): Promise<{ warnings: number; deprivations: number }> {
  const args = { p_joueur: player, p_privation: deprivation };
  const r = Cleared.parse(await call(supabase.rpc('admin_retirer_avertissements', args)));
  return { warnings: r.avertissements, deprivations: r.privations };
}

// Images of the storage used by no card (active or not), booster, back or proposal
// (20-images-inutilisees.sql). Never listed, even when that function lists them: the composed
// cards' bare drawings still in use, and the tournaments' images (cups, scarves, the trophies given
// to players). If one of those lists cannot be read, nothing is listed.
const UnusedImage = z.object({ chemin: z.string().nullable(), octets: NumOrNull });
const Path = z.string().nullable().optional();
export async function fetchUnusedImages(): Promise<{ paths: string[]; bytes: number }> {
  const [unused, drawings, tournaments, trophies, announcements, options, puzzle, ...lore] =
    await Promise.all([
      call(supabase.rpc('admin_images_inutilisees')),
      call(supabase.from('variantes_carte').select('dessin_path').not('dessin_path', 'is', null)),
      call(supabase.from('tournois').select('trophee,trophee_2,trophee_3,echarpe')),
      call(supabase.from('trophees').select('image')),
      call(supabase.from('annonces').select('image_path')),
      call(supabase.from('annonces_options').select('image_path')),
      // the puzzles' pieces and blurred backgrounds (63-puzzle-pieces-secretes.sql)
      call(supabase.from('annonces_puzzle_images').select('image_path:image')),
      ...['lore_chapitres', 'lore_carte', 'lore_lieux', 'evenements', 'evenements_options'].map(
        (t) => call(supabase.from(t).select('image_path')),
      ),
      call(supabase.from('annonces').select('image_path:puzzle_fond')),
    ]);
  const kept = new Set<string>();
  const keep = (path: string | null | undefined) => {
    if (path) kept.add(path);
  };
  for (const d of z.array(z.object({ dessin_path: Path })).parse(drawings)) keep(d.dessin_path);
  for (const t of z
    .array(z.object({ trophee: Path, trophee_2: Path, trophee_3: Path, echarpe: Path }))
    .parse(tournaments))
    [t.trophee, t.trophee_2, t.trophee_3, t.echarpe].forEach(keep);
  for (const t of z.array(z.object({ image: Path })).parse(trophies)) keep(t.image);
  for (const a of z
    .array(z.object({ image_path: Path }))
    .parse(
      [announcements, options, puzzle, ...lore].flatMap((rows) => z.array(z.unknown()).parse(rows)),
    ))
    keep(a.image_path);
  const list = z
    .array(UnusedImage)
    .parse(unused)
    .filter(
      (x): x is { chemin: string; octets: number | null } => !!x.chemin && !kept.has(x.chemin),
    );
  return {
    paths: list.map((x) => x.chemin),
    bytes: list.reduce((sum, x) => sum + (x.octets ?? 0), 0),
  };
}

export async function removeImages(paths: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 50) {
    const done = z
      .array(z.unknown())
      .parse(await call(supabase.storage.from('cartes').remove(paths.slice(i, i + 50))));
    removed += done.length;
  }
  return removed;
}

// ── Collections ──

const CollectionRow = z.object({ id: Num, nom: z.string() });
export type CollectionRow = z.infer<typeof CollectionRow>;

export async function fetchCollections(): Promise<{
  list: CollectionRow[];
  count: Map<number, number>;
}> {
  const [list, cards] = await Promise.all([
    call(supabase.from('collections').select('id,nom').order('id')),
    call(supabase.from('cartes').select('collection_id')),
  ]);
  const count = new Map<number, number>();
  for (const c of z.array(z.object({ collection_id: NumOrNull })).parse(cards))
    if (c.collection_id !== null) count.set(c.collection_id, (count.get(c.collection_id) ?? 0) + 1);
  return { list: z.array(CollectionRow).parse(list), count };
}

export async function saveCollection(id: number | null, nom: string): Promise<void> {
  await call(
    id === null
      ? supabase.from('collections').insert({ nom })
      : supabase.from('collections').update({ nom }).eq('id', id),
  );
}

export async function deleteCollection(id: number): Promise<void> {
  await call(supabase.from('collections').delete().eq('id', id));
}

// ── Rarities ──

const RarityRow = z.object({
  id: Num,
  nom: z.string(),
  couleur: z.string().nullable(),
  poids: Num,
  ordre: Num,
});
export type RarityRow = z.infer<typeof RarityRow>;

export async function fetchRarities(): Promise<RarityRow[]> {
  return z.array(RarityRow).parse(await call(supabase.from('raretes').select('*').order('ordre')));
}

export async function saveRarity(
  id: number | null,
  row: { nom: string; couleur: string; poids: number; ordre: number },
): Promise<void> {
  await call(
    id === null
      ? supabase.from('raretes').insert(row)
      : supabase.from('raretes').update(row).eq('id', id),
  );
}

// ── Players ──

const PlayerRow = z.object({ id: z.string(), pseudo: z.string().nullable(), monnaie: NumOrNull });
export type PlayerRow = z.infer<typeof PlayerRow>;

export async function fetchPlayers(): Promise<PlayerRow[]> {
  return z
    .array(PlayerRow)
    .parse(await call(supabase.from('joueurs').select('id,pseudo,monnaie').order('pseudo')));
}

const OwnedRow = z.object({
  variante_id: Id,
  carte: z.string(),
  type: z.string(),
  variante: z.string().nullable(),
  quantite: Num,
});
export type OwnedRow = z.infer<typeof OwnedRow>;

export async function fetchPlayerCards(player: string): Promise<OwnedRow[]> {
  return z
    .array(OwnedRow)
    .parse(await call(supabase.rpc('admin_collection', { p_joueur: player })));
}

// quantity: null removes every copy.
export async function removePlayerCard(
  player: string,
  variant: Id,
  quantity: number | null,
): Promise<void> {
  await call(
    supabase.rpc('admin_retirer_carte', {
      p_joueur: player,
      p_variante: variant,
      p_quantite: quantity,
    }),
  );
}

// player: null for every player. gold: null keeps it.
export async function emptyPlayer(
  player: string | null,
  boosters: boolean,
  gold: number | null,
): Promise<void> {
  await call(
    supabase.rpc('admin_vider_joueur', { p_joueur: player, p_boosters: boosters, p_monnaie: gold }),
  );
}

// Returns the database's summary of what was reset.
export async function resetStats(player: string | null): Promise<string> {
  const data = await call(
    supabase.rpc('admin_reset_stats', { p_joueur: player, p_historique: true }),
  );
  return typeof data === 'string' ? data : '';
}

// ── Gifts ──

const BoosterName = z.object({ id: Num, nom: z.string() });
export type BoosterName = z.infer<typeof BoosterName>;

export async function fetchBoosterNames(): Promise<BoosterName[]> {
  return z
    .array(BoosterName)
    .parse(await call(supabase.from('types_boosters').select('id,nom').order('id')));
}

const VariantRow = z.object({
  id: Num,
  nom: z.string().nullable(),
  image_path: z.string().nullable(),
  cartes: z
    .object({
      nom: z.string(),
      type: z.string(),
      raretes: z.object({ nom: z.string(), poids: NumOrNull }).nullable(),
    })
    .nullable(),
});
export type VariantRow = z.infer<typeof VariantRow> & {
  cartes: NonNullable<z.infer<typeof VariantRow>['cartes']>;
};

// Every version of every card, the rarest first (as the tournaments' rewards).
export async function fetchVariants(): Promise<VariantRow[]> {
  const rows = z
    .array(VariantRow)
    .parse(
      await call(
        supabase
          .from('variantes_carte')
          .select('id,nom,image_path,cartes(nom,type,raretes(nom,poids))'),
      ),
    );
  const weight = (v: VariantRow) => v.cartes.raretes?.poids ?? 1e9;
  return rows
    .filter((v): v is VariantRow => v.cartes !== null)
    .sort(
      (a, b) =>
        weight(a) - weight(b) ||
        a.cartes.nom.localeCompare(b.cartes.nom) ||
        String(a.nom).localeCompare(String(b.nom)),
    );
}

export const variantLabel = (v: VariantRow): string =>
  `${v.cartes.nom}${v.nom ? ` · ${v.nom}` : ''}${v.cartes.raretes ? ` (${v.cartes.raretes.nom})` : ''}`;

// player: null for every player.
export async function giveBoosters(
  player: string | null,
  type: number,
  quantity: number,
  message: string,
): Promise<string> {
  await call(
    supabase.rpc('offrir_boosters', { p_joueur: player, p_type_id: type, p_quantite: quantity }),
  );
  if (!message.trim()) return 'Boosters offerts !';
  const { error } = await supabase.rpc('cadeau_message', {
    p_joueur: player,
    p_message: message,
    p_type_id: type,
    p_quantite: quantity,
  });
  if (error) throw new Error(`Boosters offerts, mais le mot n'est pas parti : ${error.message}`);
  return 'Boosters offerts, avec ton mot !';
}

export async function giveCard(
  player: string | null,
  variant: number,
  quantity: number,
  message: string,
): Promise<string> {
  const players = Number(
    await call(
      supabase.rpc('offrir_carte', {
        p_joueur: player,
        p_variante_id: variant,
        p_quantite: quantity,
      }),
    ),
  );
  if (message.trim()) {
    const { error } = await supabase.rpc('cadeau_message_carte', {
      p_joueur: player,
      p_message: message,
      p_variante_id: variant,
      p_quantite: quantity,
    });
    if (error) throw new Error(`Carte offerte, mais le mot n'est pas parti : ${error.message}`);
  }
  return `Carte offerte à ${players} joueur${players > 1 ? 's' : ''}${message.trim() ? ', avec ton mot' : ''} !`;
}

// ── Card backs ──

const BackRow = z.object({
  id: Id,
  nom: z.string(),
  image: z.string().nullable(),
  par_defaut: z.boolean().nullable(),
});
export type BackRow = z.infer<typeof BackRow>;
const BackOwner = z.object({ joueur_id: z.string(), dos_id: Id });

export async function fetchBacksAdmin(): Promise<{
  backs: BackRow[];
  owners: z.infer<typeof BackOwner>[];
}> {
  const [backs, owners] = await Promise.all([
    call(supabase.from('dos_cartes').select('*').order('cree_le')),
    call(supabase.from('dos_joueur').select('joueur_id,dos_id')),
  ]);
  return { backs: z.array(BackRow).parse(backs), owners: z.array(BackOwner).parse(owners) };
}

export async function addBack(nom: string, file: File, base: boolean): Promise<void> {
  const image = await uploadImage(file);
  if (base)
    await call(supabase.from('dos_cartes').update({ par_defaut: false }).eq('par_defaut', true));
  await call(supabase.from('dos_cartes').insert({ nom, image, par_defaut: base }));
}

// player: null for every player. Returns how many received it.
export async function giveBack(back: Id, player: string | null): Promise<number> {
  return Number(await call(supabase.rpc('admin_offrir_dos', { p_dos: back, p_joueur: player })));
}

export async function setBaseBack(back: Id, base: boolean): Promise<void> {
  await call(supabase.from('dos_cartes').update({ par_defaut: false }).eq('par_defaut', true));
  if (base) await call(supabase.from('dos_cartes').update({ par_defaut: true }).eq('id', back));
}

export async function deleteBack(back: Id): Promise<void> {
  await call(supabase.from('dos_cartes').delete().eq('id', back));
}

export async function takeBack(back: Id, player: string): Promise<void> {
  await call(supabase.rpc('admin_retirer_dos', { p_dos: back, p_joueur: player }));
}

// ── Custom effects (effets_perso: a text shown, the engine does not run them) ──

const CustomEffect = z.object({
  id: Num,
  categorie: z.string(),
  cle: z.string(),
  libelle: z.string(),
  params: z.array(z.string()).nullable(),
});
export type CustomEffect = z.infer<typeof CustomEffect>;

export async function fetchCustomEffects(): Promise<CustomEffect[]> {
  return z
    .array(CustomEffect)
    .parse(await call(supabase.from('effets_perso').select('*').order('id')));
}

export async function addCustomEffect(
  categorie: string,
  libelle: string,
  params: string[],
): Promise<void> {
  const cle =
    'perso_' +
    libelle
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  await call(
    supabase.from('effets_perso').insert({ categorie, cle, libelle: libelle.trim(), params }),
  );
}

export async function deleteCustomEffect(id: number): Promise<void> {
  await call(supabase.from('effets_perso').delete().eq('id', id));
}

// ── Boosters ──

const BoosterRow = z.object({
  id: Num,
  nom: z.string(),
  prix: NumOrNull,
  nb_cartes: NumOrNull,
  actif: z.boolean().nullable(),
  quotidien: z.boolean().nullable().optional(),
  image_path: z.string().nullable().optional(),
});
export type BoosterRow = z.infer<typeof BoosterRow>;
const BoosterCollection = z.object({ type_id: Num, collection_id: Num });
const BoosterModifier = z.object({ type_id: Num, rarete_id: Num, modif: Num });
const Featured = z.object({ type_id: Num, carte_id: Num, poids: Num });
const FeaturedCard = z.object({
  id: Num,
  nom: z.string(),
  raretes: z.object({ nom: z.string(), poids: NumOrNull }).nullable(),
  collections: z.object({ nom: z.string() }).nullable(),
});
export type FeaturedCard = z.infer<typeof FeaturedCard>;

// Where a rarity stands, the highest first (GGEZ above Légendaire), from its name: the legacy
// page's rangRar. An unknown name comes after, the rarest (by drop weight) first.
const RANKS = ['ggez', 'legendaire', 'epique', 'rare', 'commun'];
export function rarityRank(r: { nom: string; poids: number | null } | null): [number, number] {
  const n = (r?.nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const i = RANKS.findIndex((k) => n.includes(k));
  return [i < 0 ? 9 : i, r?.poids ?? 0];
}

export type BoostersData = {
  boosters: BoosterRow[];
  collections: CollectionRow[];
  rarities: RarityRow[];
  links: z.infer<typeof BoosterCollection>[];
  modifiers: z.infer<typeof BoosterModifier>[];
  featured: z.infer<typeof Featured>[] | null;
  featuredError: string;
  cards: FeaturedCard[];
};

export async function fetchBoostersAdmin(): Promise<BoostersData> {
  const [boosters, collections, rarities, links, modifiers] = await Promise.all([
    call(supabase.from('types_boosters').select('*').order('id')),
    call(supabase.from('collections').select('id,nom').order('nom')),
    call(supabase.from('raretes').select('*').order('ordre')),
    call(supabase.from('boosters_collections').select('*')),
    call(supabase.from('boosters_modifs').select('*')),
  ]);
  const featured = await supabase.from('boosters_vedettes').select('*');
  let cards: FeaturedCard[] = [];
  if (!featured.error) {
    cards = z
      .array(FeaturedCard)
      .parse(
        await call(
          supabase
            .from('cartes')
            .select('id,nom,raretes(nom,poids),collections(nom)')
            .eq('actif', true),
        ),
      )
      .sort((a, b) => {
        const x = rarityRank(a.raretes);
        const y = rarityRank(b.raretes);
        return x[0] - y[0] || x[1] - y[1] || a.nom.localeCompare(b.nom, 'fr');
      });
  }
  return {
    boosters: z.array(BoosterRow).parse(boosters),
    collections: z.array(CollectionRow).parse(collections),
    rarities: z.array(RarityRow).parse(rarities),
    links: z.array(BoosterCollection).parse(links),
    modifiers: z.array(BoosterModifier).parse(modifiers),
    featured: featured.error ? null : z.array(Featured).parse(featured.data),
    featuredError: featured.error?.message ?? '',
    cards,
  };
}

export type BoosterForm = {
  nom: string;
  prix: number;
  nb_cartes: number;
  actif: boolean;
  quotidien: boolean;
  image: File | null;
  collections: number[];
  modifiers: Record<number, number>;
  // Up to two featured cards, null when the table is missing.
  featured: { carte_id: number; poids: number }[] | null;
};

// Creates (id null) or updates a booster with its collections, drop modifiers and featured cards.
export async function saveBooster(id: number | null, f: BoosterForm): Promise<number> {
  const row: Record<string, unknown> = {
    nom: f.nom,
    prix: f.prix,
    nb_cartes: f.nb_cartes,
    actif: f.actif,
    quotidien: f.quotidien,
  };
  if (f.image) row.image_path = await uploadImage(f.image);
  let booster = id;
  if (booster === null) {
    const created = z
      .object({ id: Num })
      .parse(await call(supabase.from('types_boosters').insert(row).select('id').single()));
    booster = created.id;
  } else await call(supabase.from('types_boosters').update(row).eq('id', booster));
  await call(supabase.from('boosters_collections').delete().eq('type_id', booster));
  if (f.collections.length)
    await call(
      supabase
        .from('boosters_collections')
        .insert(f.collections.map((c) => ({ type_id: booster, collection_id: c }))),
    );
  await call(
    supabase.from('boosters_modifs').upsert(
      Object.entries(f.modifiers).map(([rarete, modif]) => ({
        type_id: booster,
        rarete_id: Number(rarete),
        modif,
      })),
    ),
  );
  if (f.featured) {
    await call(supabase.from('boosters_vedettes').delete().eq('type_id', booster));
    const unique = f.featured.filter(
      (v, i, all) => v.carte_id && all.findIndex((w) => w.carte_id === v.carte_id) === i,
    );
    if (unique.length)
      await call(
        supabase.from('boosters_vedettes').insert(
          unique.map((v) => ({
            type_id: booster,
            carte_id: v.carte_id,
            poids: Math.max(0.01, v.poids || 3),
          })),
        ),
      );
  }
  return booster;
}

export async function deleteBooster(id: number): Promise<void> {
  await call(supabase.from('types_boosters').delete().eq('id', id));
}
