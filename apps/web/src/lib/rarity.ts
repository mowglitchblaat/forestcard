// Rarity order and card sorting, as the legacy page does them (rangRar, cmpColl, TIER).

import type { CardType, CollectionEntry, Rarity } from '@/data/cards';

// From the highest to the lowest. GGEZ is above legendary.
const RANKS = ['ggez', 'legendaire', 'epique', 'rare', 'commun'] as const;
export type Tier = (typeof RANKS)[number] | 'autre';

// The rarity name decides the rank (accents and case ignored); an unknown name comes after, ordered
// by its drop weight.
export function rarityRank(r: Pick<Rarity, 'nom' | 'poids'> | null): [number, number] {
  const n = (r?.nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const i = RANKS.findIndex((k) => n.includes(k));
  return [i < 0 ? 9 : i, Number(r?.poids) || 0];
}

export const tierOf = (r: Rarity | null): Tier => RANKS[rarityRank(r)[0]] ?? 'autre';

const TYPE_ORDER: Record<CardType, number> = { combattant: 0, magie: 1, piege: 2 };

// Legendary first, then epic, rare, common; then fighters, magics, traps; then by name, then by
// variant name.
export function compareEntries(a: CollectionEntry, b: CollectionEntry): number {
  const [ra, wa] = rarityRank(a.card.raretes);
  const [rb, wb] = rarityRank(b.card.raretes);
  return (
    ra - rb ||
    wa - wb ||
    TYPE_ORDER[a.card.type] - TYPE_ORDER[b.card.type] ||
    a.card.nom.localeCompare(b.card.nom, 'fr') ||
    (a.variant.nom ?? '').localeCompare(b.variant.nom ?? '', 'fr')
  );
}

// Text colour readable on a rarity colour (legacy txOn).
export function textOn(hex: string | null): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return '#111';
  const n = parseInt(m[1] as string, 16);
  const luminance = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.6 ? '#111' : '#fff';
}
