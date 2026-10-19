// What the encyclopedia computes from the active cards. Pure functions, tested without React.

import type { CollectionEntry, GameCardFull } from '@/data/cards';
import { type Tier, tierOf } from '@/lib/rarity';
import { COMMON } from '@/views/collection/model';

export type CollectionCounts = {
  name: string;
  byTier: Partial<Record<Tier, number>>;
  total: number;
};

// How many active cards each collection has, by rarity: collections by name, the common cards
// (no collection) last.
export function countsByCollection(cards: GameCardFull[]): CollectionCounts[] {
  const groups = new Map<string, CollectionCounts>();
  for (const card of cards) {
    const name = card.collections?.nom ?? COMMON;
    const group = groups.get(name) ?? { name, byTier: {}, total: 0 };
    groups.set(name, group);
    const tier = tierOf(card.raretes);
    group.byTier[tier] = (group.byTier[tier] ?? 0) + 1;
    group.total++;
  }
  return [...groups.values()].sort(
    (a, b) =>
      Number(a.name === COMMON) - Number(b.name === COMMON) || a.name.localeCompare(b.name, 'fr'),
  );
}

// The catalogue: every active card once, with its first variant (the lowest id: the original
// visual, the alternative versions come after it). A card without any variant is skipped.
// quantite 1: the catalogue has no copies, so no duplicates and nothing to recycle.
export function catalogueEntries(cards: GameCardFull[]): CollectionEntry[] {
  const entries: CollectionEntry[] = [];
  for (const { variantes_carte: variants, ...card } of cards) {
    const first = [...variants].sort((a, b) => a.id - b.id)[0];
    if (first) entries.push({ quantite: 1, variant: first, card });
  }
  return entries;
}
