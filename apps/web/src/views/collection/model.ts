// What the collection view computes from the data: filtering, sorting, and the counts of the stats
// band. Pure functions, tested without React.

import type { CardType, CollectionEntry, GameCard } from '@/data/cards';
import { compareEntries, rarityRank } from '@/lib/rarity';
import type { CollectionSearch, Sort } from './search';

// the cards without a collection (they drop in every booster)
export const COMMON = 'Basique';
export const collectionOf = (e: { card: { collections: { nom: string } | null } }): string =>
  e.card.collections?.nom ?? COMMON;
export const num = (v: unknown): number => Number(v) || 0;

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function filterEntries(entries: CollectionEntry[], s: CollectionSearch): CollectionEntry[] {
  const q = normalize(s.q?.trim() ?? '');
  return entries.filter(
    (e) =>
      (!q || normalize(e.card.nom).includes(q)) &&
      (!s.type || e.card.type === s.type) &&
      (!s.group || collectionOf(e) === s.group) &&
      (!s.rarity || e.card.raretes.nom === s.rarity) &&
      (!s.dup || e.quantite > 1),
  );
}

// ATQ and PV: strongest first, cards without the stat (magics, traps) last, then the default order.
const byStat = (stat: 'atq' | 'pv') => (a: CollectionEntry, b: CollectionEntry) => {
  const has = (e: CollectionEntry) => e.card.type === 'combattant' && e.card[stat] != null;
  return (
    Number(has(b)) - Number(has(a)) || num(b.card[stat]) - num(a.card[stat]) || compareEntries(a, b)
  );
};

const COMPARE: Record<Sort, (a: CollectionEntry, b: CollectionEntry) => number> = {
  rarete: compareEntries,
  nom: (a, b) => a.card.nom.localeCompare(b.card.nom, 'fr') || compareEntries(a, b),
  atq: byStat('atq'),
  pv: byStat('pv'),
};

export const sortEntries = (entries: CollectionEntry[], sort: Sort = 'rarete') =>
  [...entries].sort(COMPARE[sort]);

export type Count = { total: number; mine: number };

// Owned different cards out of the active cards of the game, by rarity (rarest first) and by
// collection (by name, the common cards last). Only counts: never the missing cards themselves.
export function progress(cards: GameCard[], owned: Set<number>) {
  const byRarity = new Map<string, Count & { color: string | null; rank: [number, number] }>();
  const byGroup = new Map<string, Count>();
  for (const c of cards) {
    const has = owned.has(c.id) ? 1 : 0;
    const rn = c.raretes?.nom ?? '?';
    const r = byRarity.get(rn) ?? {
      total: 0,
      mine: 0,
      color: c.raretes?.couleur ?? null,
      rank: rarityRank(c.raretes),
    };
    byRarity.set(rn, r);
    r.total++;
    r.mine += has;
    const gn = c.collections?.nom ?? COMMON;
    const g = byGroup.get(gn) ?? { total: 0, mine: 0 };
    byGroup.set(gn, g);
    g.total++;
    g.mine += has;
  }
  return {
    total: cards.length,
    mine: cards.filter((c) => owned.has(c.id)).length,
    byRarity: [...byRarity.entries()]
      .sort(([, a], [, b]) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1])
      .map(([name, r]) => ({ name, ...r })),
    byGroup: [...byGroup.entries()]
      .sort(([a], [b]) => Number(a === COMMON) - Number(b === COMMON) || a.localeCompare(b, 'fr'))
      .map(([name, g]) => ({ name, ...g })),
  };
}

export const TYPE_LABELS: Record<CardType, { one: string; many: string }> = {
  combattant: { one: 'Combattant', many: 'Combattants' },
  magie: { one: 'Magie', many: 'Magies' },
  piege: { one: 'Piège', many: 'Pièges' },
};

export const pct = (n: number, of: number): number => (of ? Math.round((100 * n) / of) : 0);
