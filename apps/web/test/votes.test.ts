// Votes: what can be voted on a card, worded as the legacy page, and the results by card.

import { expect, test } from 'vite-plus/test';
import { aggregate, aspectsOf, type ResultRow } from '../src/data/votes.ts';

test('a fighter: ATQ, PV, each passive, the ultimate', () => {
  const keys = aspectsOf({
    type: 'combattant',
    atq: 12,
    pv: 30,
    passif: { briques: [{ type: 'esquive', val: 20 }, null, { type: 'blocage', val: 10 }] },
    ultime: { type: 'degats', val: 15 },
  } as never).map((a) => a.key);
  expect(keys).toEqual(['atq', 'pv', 'passif:0', 'passif:1', 'ultime']);
});

test('a fighter without passive nor ultimate: ATQ and PV, with their values', () => {
  expect(aspectsOf({ type: 'combattant', atq: 5, pv: null })).toEqual([
    { key: 'atq', label: 'ATQ (5)' },
    { key: 'pv', label: 'PV / défense (?)' },
  ]);
});

test('a magic or a trap: its effect alone', () => {
  expect(aspectsOf({ type: 'magie', effet: null })).toEqual([{ key: 'effet', label: 'Effet : —' }]);
  const [trap] = aspectsOf({ type: 'piege', effet: { declenchements: 2 } } as never);
  expect(trap?.key).toBe('effet');
  expect(trap?.label).toMatch(/^Piège : Piège caché : .*\(jusqu'à 2 fois\)$/);
});

const row = (r: Partial<ResultRow>): ResultRow => ({
  carte_id: 1,
  carte_nom: 'A',
  aspect: 'atq',
  sens: 'nerf',
  nb: 1,
  votants: 1,
  ...r,
});

test('results by card: most voters first, aspects in card order, counts by direction', () => {
  const list = aggregate([
    row({ carte_id: 1, carte_nom: 'Ours', aspect: 'ultime', sens: 'up', nb: 2, votants: 2 }),
    row({ carte_id: 1, carte_nom: 'Ours', aspect: 'atq', sens: 'nerf', nb: 1, votants: 2 }),
    row({ carte_id: 1, carte_nom: 'Ours', aspect: 'atq', sens: 'rework', nb: 1, votants: 2 }),
    row({ carte_id: 2, carte_nom: 'Loup', aspect: 'passif:1', sens: 'nerf', nb: 3, votants: 3 }),
    row({ carte_id: 2, carte_nom: 'Loup', aspect: 'passif:0', sens: 'up', nb: 1, votants: 3 }),
  ]);
  expect(list.map((c) => c.name)).toEqual(['Loup', 'Ours']);
  expect(list[0]?.aspects.map((a) => a.aspect)).toEqual(['passif:0', 'passif:1']);
  expect(list[1]?.aspects).toEqual([
    { aspect: 'atq', counts: { nerf: 1, up: 0, rework: 1 } },
    { aspect: 'ultime', counts: { nerf: 0, up: 2, rework: 0 } },
  ]);
});
