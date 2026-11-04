// Recycling duplicates: what it pays (per extra copy, gold and fragments by rarity; the prices come
// from the database, Admin > Réglages, with the legacy defaults when unavailable, as the legacy page
// does: PRIX_DEF, chargerPrix, gainDe) and the recycling itself (recycler_doublons: its SQL is
// missing upstream, the shape below is the one the legacy page reads). The server always keeps one
// copy of each card.

import { z } from 'zod';
import type { CollectionEntry } from '@/data/cards';
import { supabase } from '@/lib/supabase';
import { tierOf } from '@/lib/rarity';

export type PriceTier = 'ggez' | 'legendaire' | 'epique' | 'rare' | 'commun';
// gold, and the fragments paid with it (usually 0); alt: the fragments paid instead of the gold,
// when the player picks fragments (28-echanges.sql), 0 when that choice is not installed.
type Price = { gold: number; fragments: number; alt: number };
export type Prices = Record<PriceTier, Price>;

export const DEFAULT_PRICES: Prices = {
  commun: { gold: 5, fragments: 0, alt: 0 },
  rare: { gold: 10, fragments: 0, alt: 0 },
  epique: { gold: 35, fragments: 0, alt: 0 },
  legendaire: { gold: 80, fragments: 0, alt: 0 },
  ggez: { gold: 80, fragments: 0, alt: 0 },
};

export const TIER_LABELS: Record<PriceTier, string> = {
  ggez: 'GGEZ',
  legendaire: 'Légendaire',
  epique: 'Épique',
  rare: 'Rare',
  commun: 'Commune',
};

const PriceRow = z.object({ rang: z.string(), gold: z.number(), fragments: z.number() });

export async function fetchPrices(): Promise<Prices> {
  const prices = structuredClone(DEFAULT_PRICES);
  const { data, error } = await supabase.rpc('prix_recyclage');
  if (error) return prices;
  const rows = z.array(PriceRow).safeParse(data);
  if (!rows.success) return prices;
  for (const { rang, gold, fragments } of rows.data)
    if (Object.hasOwn(prices, rang)) prices[rang as PriceTier] = { gold, fragments, alt: 0 };
  // The fragments instead of the gold.
  const alt = await supabase.rpc('prix_fragments_recyclage');
  if (!alt.error && alt.data) {
    const values = z.record(z.string(), z.union([z.number(), z.string()])).safeParse(alt.data);
    if (values.success)
      for (const [rang, n] of Object.entries(values.data))
        if (Object.hasOwn(prices, rang)) prices[rang as PriceTier].alt = Number(n) || 0;
  }
  return prices;
}

export const fragmentsOffered = (prices: Prices): boolean =>
  Object.values(prices).some((p) => p.alt > 0);

export const tierOfEntry = (entry: CollectionEntry): PriceTier => {
  const tier = tierOf(entry.card.raretes);
  return tier === 'autre' ? 'commun' : tier;
};

export type Gain = { copies: number; gold: number; fragments: number; alt?: number };

// Recycling keeps one copy: every copy above it is paid at the card's rarity price (an unknown
// rarity is paid as common).
export function gainOf(entry: CollectionEntry, prices: Prices): Gain {
  const price = prices[tierOfEntry(entry)];
  const copies = Math.max(0, (entry.quantite || 1) - 1);
  return {
    copies,
    gold: copies * price.gold,
    fragments: copies * price.fragments,
    alt: copies * price.alt,
  };
}

export function totalGain(entries: CollectionEntry[], prices: Prices): Gain {
  return entries.reduce<Gain>(
    (sum, e) => {
      const g = gainOf(e, prices);
      return {
        copies: sum.copies + g.copies,
        gold: sum.gold + g.gold,
        fragments: sum.fragments + g.fragments,
        alt: (sum.alt ?? 0) + (g.alt ?? 0),
      };
    },
    { copies: 0, gold: 0, fragments: 0, alt: 0 },
  );
}

// What a recycling did: cards recycled, gold and fragments received.
const RecycleResult = z.object({
  cartes: z.number(),
  gold: z.number(),
  fragments: z
    .number()
    .nullish()
    .transform((n) => n ?? 0),
});
export type RecycleResult = z.infer<typeof RecycleResult>;

export type RecycleMode = 'gold' | 'fragments';
const recycleFunction = (mode: RecycleMode) =>
  mode === 'fragments' ? 'recycler_doublons_fragments' : 'recycler_doublons';

// variantId: the duplicates of one card; none: all of them. mode: paid in gold, or in fragments.
export async function recycle(
  variantId?: number,
  mode: RecycleMode = 'gold',
): Promise<RecycleResult> {
  const { data, error } = await supabase.rpc(
    recycleFunction(mode),
    variantId === undefined ? {} : { p_variante: variantId },
  );
  if (error)
    throw new Error(
      error.message.includes('RIEN_A_RECYCLER') ? 'Aucun doublon à recycler.' : error.message,
    );
  return RecycleResult.parse(data ?? {});
}

// The duplicates of several cards (a selection by rarity): one card after the other, as the
// server recycles card by card, then one result.
export async function recycleMany(variantIds: number[], mode: RecycleMode): Promise<RecycleResult> {
  const total: RecycleResult = { cartes: 0, gold: 0, fragments: 0 };
  let failure: string | null = null;
  for (const id of variantIds) {
    const { data, error } = await supabase.rpc(recycleFunction(mode), { p_variante: id });
    if (error) {
      if (!error.message.includes('RIEN_A_RECYCLER')) failure = error.message;
      continue;
    }
    const r = RecycleResult.parse(data ?? {});
    total.cartes += r.cartes;
    total.gold += r.gold;
    total.fragments += r.fragments;
  }
  if (!total.cartes) throw new Error(failure ?? 'Aucun doublon à recycler.');
  return total;
}

export const recyclingKeys = { prices: ['recyclingPrices'] as const };
