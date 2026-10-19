// Recycling duplicates: what it pays (per extra copy, gold and fragments by rarity; the prices come
// from the database, Admin > Réglages, with the legacy defaults when unavailable, as the legacy page
// does: PRIX_DEF, chargerPrix, gainDe) and the recycling itself (recycler_doublons: its SQL is
// missing upstream, the shape below is the one the legacy page reads). The server always keeps one
// copy of each card.

import { z } from 'zod';
import type { CollectionEntry } from '@/data/cards';
import { supabase } from '@/lib/supabase';
import { tierOf } from '@/lib/rarity';

type PriceTier = 'ggez' | 'legendaire' | 'epique' | 'rare' | 'commun';
type Price = { gold: number; fragments: number };
export type Prices = Record<PriceTier, Price>;

export const DEFAULT_PRICES: Prices = {
  commun: { gold: 5, fragments: 0 },
  rare: { gold: 10, fragments: 0 },
  epique: { gold: 35, fragments: 0 },
  legendaire: { gold: 80, fragments: 0 },
  ggez: { gold: 80, fragments: 0 },
};

const PriceRow = z.object({ rang: z.string(), gold: z.number(), fragments: z.number() });

export async function fetchPrices(): Promise<Prices> {
  const prices = structuredClone(DEFAULT_PRICES);
  const { data, error } = await supabase.rpc('prix_recyclage');
  if (error) return prices;
  const rows = z.array(PriceRow).safeParse(data);
  if (!rows.success) return prices;
  for (const { rang, gold, fragments } of rows.data)
    if (Object.hasOwn(prices, rang)) prices[rang as PriceTier] = { gold, fragments };
  return prices;
}

export type Gain = { copies: number; gold: number; fragments: number };

// Recycling keeps one copy: every copy above it is paid at the card's rarity price (an unknown
// rarity is paid as common).
export function gainOf(entry: CollectionEntry, prices: Prices): Gain {
  const tier = tierOf(entry.card.raretes);
  const price = prices[tier === 'autre' ? 'commun' : tier];
  const copies = Math.max(0, (entry.quantite || 1) - 1);
  return { copies, gold: copies * price.gold, fragments: copies * price.fragments };
}

export function totalGain(entries: CollectionEntry[], prices: Prices): Gain {
  return entries.reduce<Gain>(
    (sum, e) => {
      const g = gainOf(e, prices);
      return {
        copies: sum.copies + g.copies,
        gold: sum.gold + g.gold,
        fragments: sum.fragments + g.fragments,
      };
    },
    { copies: 0, gold: 0, fragments: 0 },
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

// variantId: the duplicates of one card; none: all of them.
export async function recycle(variantId?: number): Promise<RecycleResult> {
  const { data, error } = await supabase.rpc(
    'recycler_doublons',
    variantId === undefined ? {} : { p_variante: variantId },
  );
  if (error)
    throw new Error(
      error.message.includes('RIEN_A_RECYCLER') ? 'Aucun doublon à recycler.' : error.message,
    );
  return RecycleResult.parse(data ?? {});
}

export const recyclingKeys = { prices: ['recyclingPrices'] as const };
