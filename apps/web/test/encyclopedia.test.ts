// The encyclopedia: effect ids are unique (they are the address), collections are counted from the
// real cards, the catalogue shows each card once with its original visual.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vite-plus/test';
import type { GameCardFull } from '../src/data/cards.ts';
import { effectId, RULE_EFFECTS } from '../src/views/encyclopedia/content.ts';
import { catalogueEntries, countsByCollection } from '../src/views/encyclopedia/model.ts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CARDS = JSON.parse(
  readFileSync(join(ROOT, 'docs', 'legacy', 'cartes-2026-10-19.json'), 'utf8'),
) as GameCardFull[];

test('each effect has its own id', () => {
  const ids = RULE_EFFECTS.map(effectId);
  expect(new Set(ids).size).toBe(ids.length);
});

test('collections by name, the common cards last, every card counted once', () => {
  const rows = countsByCollection(CARDS);
  expect(rows.map((r) => r.name)).toEqual([
    'Fondateurs',
    'Horreurs & Chasseurs',
    'Mythe et Fantastique',
    'Stream et Animals',
    'Basique',
  ]);
  expect(rows.reduce((n, r) => n + r.total, 0)).toBe(CARDS.length);
  for (const r of rows)
    expect(Object.values(r.byTier).reduce((n, k) => n + (k ?? 0), 0)).toBe(r.total);
});

test('the catalogue: one entry per card, its lowest variant, a card without variant skipped', () => {
  const card = CARDS[0];
  if (!card) throw new Error('no card in the snapshot');
  const entries = catalogueEntries([
    {
      ...card,
      variantes_carte: [
        { id: 9, nom: 'Full art', image_path: 'b.webp' },
        { id: 3, nom: 'Standard', image_path: 'a.webp' },
      ],
    },
    { ...card, id: -1, variantes_carte: [] },
  ]);
  expect(entries).toHaveLength(1);
  expect(entries[0]?.variant).toEqual({ id: 3, nom: 'Standard', image_path: 'a.webp' });
  expect(entries[0]?.quantite).toBe(1);
  expect(entries[0]?.card).not.toHaveProperty('variantes_carte');
});
