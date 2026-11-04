// Votes: what can be proposed on a card, worded as the legacy page, and the order of the proposals.

import { expect, test } from 'vite-plus/test';
import { aspectLabel, aspectsOf, byVotes, mostBacked, type Proposal } from '../src/data/votes.ts';

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

const proposal = (p: Partial<Proposal>): Proposal => ({
  id: 1,
  carte_id: 1,
  carte_nom: 'A',
  sens: 'nerf',
  aspect: null,
  commentaire: null,
  oui: 1,
  non: 0,
  mon_avis: null,
  a_moi: false,
  cree_le: '2026-11-02T10:00:00Z',
  ...p,
});

test('players see the most voted proposals first, then the newest', () => {
  const list = byVotes([
    proposal({ id: 1, oui: 1, non: 0 }),
    proposal({ id: 2, oui: 2, non: 3 }),
    proposal({ id: 3, oui: 1, non: 0, cree_le: '2026-11-03T10:00:00Z' }),
  ]);
  expect(list.map((p) => p.id)).toEqual([2, 3, 1]);
});

test('the admin sees the most backed: the most yes, then the fewest no', () => {
  const list = mostBacked([
    proposal({ id: 1, oui: 3, non: 4 }),
    proposal({ id: 2, oui: 3, non: 1 }),
    proposal({ id: 3, oui: 5, non: 9 }),
  ]);
  expect(list.map((p) => p.id)).toEqual([3, 2, 1]);
});

test('an aspect: the whole card, its label on the card, or its name', () => {
  expect(aspectLabel(undefined, null)).toBe('Toute la carte');
  expect(aspectLabel({ type: 'combattant', atq: 5, pv: 9 }, 'atq')).toBe('ATQ (5)');
  expect(aspectLabel(undefined, 'passif:1')).toBe('Passif');
});
