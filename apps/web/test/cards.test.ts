// The card schema against the real cards (docs/legacy snapshot of the database), and the collection
// helpers ported from the legacy page (sorting, rarity order, progress, text colour).

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import { Card, type CollectionEntry, toEntries } from '../src/data/cards.ts';
import { compareEntries, rarityRank, textOn, tierOf } from '../src/lib/rarity.ts';
import { progress } from '../src/views/collection/model.ts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const SNAPSHOT = JSON.parse(
  readFileSync(join(ROOT, 'docs', 'legacy', 'cartes-2026-10-19.json'), 'utf8'),
) as unknown[];

describe('Card', () => {
  test('accepts every real card of the snapshot', () => {
    const cards = SNAPSHOT.map((c) => Card.parse(c));
    expect(cards).toHaveLength(93);
  });

  test('accepts numbers stored as text, rejects an unknown card type', () => {
    const real = SNAPSHOT[0] as Record<string, unknown>;
    expect(Card.parse({ ...real, atq: '35', pv: '' }).atq).toBe('35');
    expect(() => Card.parse({ ...real, type: 'sort' })).toThrow(/type/);
  });
});

const card = (
  nom: string,
  rarity: string,
  poids: number,
  type: Card['type'] = 'combattant',
): Card =>
  Card.parse({
    ...(SNAPSHOT[0] as object),
    nom,
    type,
    raretes: { nom: rarity, couleur: '#ffffff', poids },
  });
const entry = (c: Card, variant: string | null = null): CollectionEntry => ({
  quantite: 1,
  variant: { id: 1, nom: variant, image_path: null },
  card: c,
});

describe('collection helpers', () => {
  test('rows whose card is no longer visible are skipped', () => {
    const c = Card.parse(SNAPSHOT[0]);
    const rows = [
      { quantite: 2, variantes_carte: { id: 1, nom: null, image_path: null, cartes: c } },
      { quantite: 1, variantes_carte: { id: 2, nom: null, image_path: null, cartes: null } },
      { quantite: 1, variantes_carte: null },
    ];
    expect(toEntries(rows).map((e) => e.variant.id)).toEqual([1]);
  });

  test('rarity rank: accents and case ignored, ggez above legendary, unknown last', () => {
    expect(rarityRank({ nom: 'Légendaire', poids: 0.5 })).toEqual([1, 0.5]);
    expect(rarityRank({ nom: 'GGEZ', poids: null })[0]).toBe(0);
    expect(rarityRank({ nom: 'Mythique', poids: 2 })).toEqual([9, 2]);
    expect(tierOf({ nom: 'Épique', couleur: null, poids: 1 })).toBe('epique');
  });

  test('sort: rarity, then type, then name, then variant', () => {
    const list = [
      entry(card('Zèbre', 'Commun', 50)),
      entry(card('Arbre', 'Commun', 50, 'magie')),
      entry(card('Dieu Cerf', 'Légendaire', 0.5)),
      entry(card('Ours', 'Rare', 10), 'Doré'),
      entry(card('Ours', 'Rare', 10), 'Argent'),
    ];
    expect(list.sort(compareEntries).map((e) => `${e.card.nom}/${e.variant.nom ?? ''}`)).toEqual([
      'Dieu Cerf/',
      'Ours/Argent',
      'Ours/Doré',
      'Zèbre/',
      'Arbre/',
    ]);
  });

  test('progress: collections by name with the common cards last, rarest first', () => {
    const cards = [
      { id: 1, collections: null, raretes: { nom: 'Commun', couleur: null, poids: 50 } },
      {
        id: 2,
        collections: { nom: 'Forêt' },
        raretes: { nom: 'Commun', couleur: null, poids: 50 },
      },
      { id: 3, collections: { nom: 'Forêt' }, raretes: { nom: 'Rare', couleur: null, poids: 10 } },
      {
        id: 4,
        collections: { nom: 'Abysses' },
        raretes: { nom: 'Rare', couleur: null, poids: 10 },
      },
    ];
    const p = progress(cards, new Set([2, 3]));
    expect(p.byGroup.map((g) => `${g.name} ${g.mine}/${g.total}`)).toEqual([
      'Abysses 0/1',
      'Forêt 2/2',
      'Communes 0/1',
    ]);
    expect(p.byRarity.map((r) => `${r.name} ${r.mine}/${r.total}`)).toEqual([
      'Rare 1/2',
      'Commun 1/2',
    ]);
    expect([p.mine, p.total]).toEqual([2, 4]);
  });

  test('text colour on a rarity colour', () => {
    expect(textOn('#f59e0b')).toBe('#111');
    expect(textOn('#1e3a8a')).toBe('#fff');
    expect(textOn(null)).toBe('#111');
  });
});
