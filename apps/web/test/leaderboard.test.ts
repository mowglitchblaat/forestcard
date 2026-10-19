// The leaderboard ranks as the legacy page does (vClassement).

import { expect, test } from 'vite-plus/test';
import { LeaderboardRow } from '../src/data/leaderboard.ts';
import { availableSorts, ordinal, rank } from '../src/views/leaderboard/model.ts';

const row = (pseudo: string, v: number, d: number, n: number, extra = {}) =>
  LeaderboardRow.parse({
    joueur_id: pseudo,
    pseudo,
    victoires: v,
    defaites: d,
    nuls: n,
    ...extra,
  });

test('counts as text (SQL bigint) read as numbers; missing records stay unknown', () => {
  const r = LeaderboardRow.parse({
    joueur_id: 'a',
    pseudo: 'a',
    victoires: '12',
    defaites: null,
    nuls: 1,
  });
  expect([r.victoires, r.defaites, r.nuls, r.meilleure_serie]).toEqual([12, 0, 1, null]);
});

test('by the sort, then more victories, more combats, the pseudo', () => {
  const rows = [row('b', 5, 5, 0), row('a', 5, 5, 0), row('c', 5, 1, 0), row('d', 9, 20, 0)];
  expect(rank(rows, 'global', 'victoires').map((r) => r.pseudo)).toEqual(['d', 'a', 'b', 'c']);
  expect(rank(rows, 'global', 'pct').map((r) => r.pseudo)).toEqual(['c', 'a', 'b', 'd']);
});

test('a period keeps only the players who fought in it; global keeps everyone', () => {
  const rows = [row('a', 1, 0, 0), row('b', 0, 0, 0)];
  expect(rank(rows, 'semaine', 'victoires').map((r) => r.pseudo)).toEqual(['a']);
  expect(rank(rows, 'global', 'victoires')).toHaveLength(2);
});

test('the streak and the biggest hit only when the server gives them', () => {
  expect(availableSorts([row('a', 1, 0, 0)])).not.toContain('meilleure_serie');
  expect(availableSorts([row('a', 1, 0, 0, { meilleure_serie: 3 })])).toContain('meilleure_serie');
  // An unavailable sort falls back to victories.
  const rows = [row('a', 1, 0, 0), row('b', 2, 0, 0)];
  expect(rank(rows, 'global', 'plus_gros_coup').map((r) => r.pseudo)).toEqual(['b', 'a']);
});

test('ordinals', () => {
  expect([ordinal(1), ordinal(2), ordinal(11)]).toEqual(['1er', '2e', '11e']);
});
