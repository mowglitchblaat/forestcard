// The shop: the boosters on sale (table types_boosters), the player's unopened boosters
// (stock_boosters), what each booster may contain (contenu_boosters,
// db/migrations/18-communes-partout.sql), its featured cards (vedettes_boosters) and the purchase
// (acheter_booster). The SQL of the last two is missing upstream: their shape is the one the
// legacy page reads.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const Num = z.union([z.number(), z.string()]).transform((v) => Number(v) || 0);

export const BoosterType = z.object({
  id: z.number(),
  nom: z.string(),
  image_path: z.string().nullable(),
  nb_cartes: z.number().nullable(),
  // None: not for sale (only won).
  prix: z.number().nullable(),
});
export type BoosterType = z.infer<typeof BoosterType>;

export async function fetchShop(): Promise<BoosterType[]> {
  const { data, error } = await supabase
    .from('types_boosters')
    .select('id,nom,image_path,nb_cartes,prix')
    .eq('actif', true);
  if (error) throw new Error(`types_boosters: ${error.message}`);
  return z.array(BoosterType).parse(data);
}

const StockRow = z.object({
  quantite: z.number(),
  types_boosters: z.object({ nom: z.string(), image_path: z.string().nullable() }).nullable(),
});
export type StockRow = z.infer<typeof StockRow>;

// The player's boosters waiting to be opened live (!booster).
export async function fetchStock(userId: string): Promise<StockRow[]> {
  const { data, error } = await supabase
    .from('stock_boosters')
    .select('quantite,types_boosters(nom,image_path)')
    .eq('joueur_id', userId)
    .gt('quantite', 0);
  if (error) throw new Error(`stock_boosters: ${error.message}`);
  return z.array(StockRow).parse(data);
}

// Per booster, per collection and rarity, how many cards it may give (no drop rate, no card).
const ContentRow = z.object({
  type_id: Num,
  collection_id: Num.nullable(),
  collection_nom: z.string(),
  rarete_nom: z.string(),
  rarete_couleur: z.string().nullable(),
  rarete_poids: Num.nullable(),
  nb: Num,
});
export type ContentRow = z.infer<typeof ContentRow>;

export async function fetchContents(): Promise<ContentRow[]> {
  const { data, error } = await supabase.rpc('contenu_boosters');
  if (error) throw new Error(`contenu_boosters: ${error.message}`);
  return z.array(ContentRow).parse(data ?? []);
}

const Featured = z.object({
  type_id: Num,
  nom: z.string(),
  image_path: z.string().nullish(),
  couleur: z.string().nullish(),
});
export type Featured = z.infer<typeof Featured>;

export async function fetchFeatured(): Promise<Featured[]> {
  const { data, error } = await supabase.rpc('vedettes_boosters');
  if (error) throw new Error(`vedettes_boosters: ${error.message}`);
  return z.array(Featured).parse(data ?? []);
}

// The server checks the gold: not enough raises an error mentioning MONNAIE.
export async function buyBooster(typeId: number): Promise<void> {
  const { error } = await supabase.rpc('acheter_booster', { p_type_id: typeId });
  if (error)
    throw new Error(error.message.includes('MONNAIE') ? 'Pas assez de gold.' : error.message);
}

// An offer as the "seen" mark keeps it: a new booster or a new price is a new item.
export const offerKey = (b: BoosterType): string => `${b.id}:${b.prix ?? '-'}`;
export const offerKeys = (list: BoosterType[]): string[] => list.map(offerKey);

// What changed for a booster since the mark: new, or its price (with the one seen).
export type OfferChange = { kind: 'new' } | { kind: 'price'; before: number | null };
export function offerChange(stored: string | null, b: BoosterType): OfferChange | null {
  if (stored === null) return null;
  const seen = new Map(
    stored
      .split(',')
      .filter(Boolean)
      .map((item) => {
        const [id, price] = item.split(':');
        return [id, price === '-' || price === undefined ? null : Number(price)] as const;
      }),
  );
  const id = String(b.id);
  if (!seen.has(id)) return { kind: 'new' };
  const before = seen.get(id) ?? null;
  return before === b.prix ? null : { kind: 'price', before };
}

export const shopKeys = {
  offers: ['shop'] as const,
  stock: (userId: string) => ['stock', userId] as const,
  contents: ['boosterContents'] as const,
  featured: ['featuredCards'] as const,
};
// Prices and boosters change rarely: the sidebar checks hourly. The stock changes when the player
// buys (here or elsewhere) or opens one live: every 5 minutes.
export const SHOP_REFRESH = 60 * 60 * 1000;
export const STOCK_REFRESH = 5 * 60 * 1000;
