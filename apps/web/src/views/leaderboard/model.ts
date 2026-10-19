// What the leaderboard computes, as the legacy page does (vClassement). Pure functions, tested
// without React.

import type { LeaderboardRow, Period } from '@/data/leaderboard';
import type { Sort } from './search';

export const combats = (r: LeaderboardRow): number => r.victoires + r.defaites + r.nuls;
// No combat: below every rate.
export const winRatio = (r: LeaderboardRow): number => (combats(r) ? r.victoires / combats(r) : -1);
export const winRate = (r: LeaderboardRow): number | null =>
  combats(r) ? Math.round((100 * r.victoires) / combats(r)) : null;

const VALUE: Record<Sort, (r: LeaderboardRow) => number> = {
  victoires: (r) => r.victoires,
  pct: winRatio,
  combats,
  defaites: (r) => r.defaites,
  nuls: (r) => r.nuls,
  meilleure_serie: (r) => r.meilleure_serie ?? 0,
  plus_gros_coup: (r) => r.plus_gros_coup ?? 0,
};

// The sorts the rows allow: the counts always, the streak and the biggest hit only if the server
// gives them.
export function availableSorts(rows: LeaderboardRow[]): Sort[] {
  return (Object.keys(VALUE) as Sort[]).filter(
    (s) => (s !== 'meilleure_serie' && s !== 'plus_gros_coup') || rows.some((r) => r[s] !== null),
  );
}

// The ranked rows: a period keeps the players who fought in it; the top 100, by the sort, then more
// victories, then more combats, then the pseudo.
export function rank(rows: LeaderboardRow[], period: Period, sort: Sort): LeaderboardRow[] {
  const value = VALUE[availableSorts(rows).includes(sort) ? sort : 'victoires'];
  return rows
    .filter((r) => period === 'global' || combats(r) > 0)
    .sort(
      (a, b) =>
        value(b) - value(a) ||
        b.victoires - a.victoires ||
        combats(b) - combats(a) ||
        a.pseudo.localeCompare(b.pseudo, 'fr'),
    )
    .slice(0, 100);
}

// "1er", "2e"…
export const ordinal = (n: number): string => (n === 1 ? '1er' : `${n}e`);
