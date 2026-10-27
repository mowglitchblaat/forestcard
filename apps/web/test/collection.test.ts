// The collection view's model: address parameters, filters, sorts, recycling gains.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import { Card, type CollectionEntry } from '../src/data/cards.ts';
import { DEFAULT_PRICES, gainOf, totalGain } from '../src/data/recycling.ts';
import { filterEntries, sortEntries } from '../src/views/collection/model.ts';
import { CollectionSearch } from '../src/views/collection/search.ts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const BASE = (
  JSON.parse(
    readFileSync(join(ROOT, 'docs', 'legacy', 'cartes-2026-10-19.json'), 'utf8'),
  ) as object[]
)[0] as object;

let id = 0;
const entry = (fields: Partial<Card>, quantite = 1): CollectionEntry => {
  id++;
  return {
    quantite,
    variant: { id, nom: null, image_path: null },
    card: Card.parse({
      ...BASE,
      id,
      raretes: { nom: 'Commun', couleur: '#aaaaaa', poids: 50 },
      collections: null,
      ...fields,
    }),
  };
};

const cerf = entry({
  nom: 'Dieu Cerf',
  type: 'combattant',
  atq: 35,
  pv: 71,
  raretes: { nom: 'Légendaire', couleur: '#f59e0b', poids: 0.5 },
});
const ours = entry({ nom: 'Ours', type: 'combattant', atq: '40', pv: 50 }, 3);
const elan = entry({
  nom: 'Élan',
  type: 'combattant',
  atq: 20,
  pv: 90,
  collections: { nom: 'Forêt' },
});
const sort = entry({ nom: 'Brume', type: 'magie', atq: null, pv: null }, 2);
const all = [cerf, ours, elan, sort];
const names = (list: CollectionEntry[]) => list.map((e) => e.card.nom);

describe('address parameters', () => {
  test('missing or invalid parameters are dropped, valid ones kept', () => {
    expect(CollectionSearch.parse({})).toEqual({});
    expect(CollectionSearch.parse({ type: 'magie', sort: 'pv', card: 12, dup: true })).toEqual({
      type: 'magie',
      sort: 'pv',
      card: 12,
      dup: true,
    });
    expect(CollectionSearch.parse({ type: 'sort', sort: 'prix', card: 'x' })).toEqual({});
  });
});

describe('filters', () => {
  test('search ignores accents and case', () => {
    expect(names(filterEntries(all, { q: 'elan' }))).toEqual(['Élan']);
    expect(names(filterEntries(all, { q: 'CERF' }))).toEqual(['Dieu Cerf']);
  });

  test('type, collection, rarity and duplicates combine', () => {
    expect(names(filterEntries(all, { type: 'magie' }))).toEqual(['Brume']);
    expect(names(filterEntries(all, { group: 'Basique', type: 'combattant' }))).toEqual([
      'Dieu Cerf',
      'Ours',
    ]);
    expect(names(filterEntries(all, { rarity: 'Légendaire' }))).toEqual(['Dieu Cerf']);
    expect(names(filterEntries(all, { dup: true }))).toEqual(['Ours', 'Brume']);
  });
});

describe('sorts', () => {
  test('rarity by default, then type, then name', () => {
    expect(names(sortEntries(all))).toEqual(['Dieu Cerf', 'Élan', 'Ours', 'Brume']);
  });

  test('by name', () => {
    expect(names(sortEntries(all, 'nom'))).toEqual(['Brume', 'Dieu Cerf', 'Élan', 'Ours']);
  });

  test('by ATQ or PV: strongest first (text numbers included), cards without the stat last', () => {
    expect(names(sortEntries(all, 'atq'))).toEqual(['Ours', 'Dieu Cerf', 'Élan', 'Brume']);
    expect(names(sortEntries(all, 'pv'))).toEqual(['Élan', 'Dieu Cerf', 'Ours', 'Brume']);
  });
});

describe('recycling gains', () => {
  test('every copy above the first, at the rarity price', () => {
    expect(gainOf(ours, DEFAULT_PRICES)).toEqual({ copies: 2, gold: 10, fragments: 0 });
    expect(gainOf(cerf, DEFAULT_PRICES)).toEqual({ copies: 0, gold: 0, fragments: 0 });
    expect(totalGain(all, DEFAULT_PRICES)).toEqual({ copies: 3, gold: 15, fragments: 0 });
  });

  test('an unknown rarity is paid as common', () => {
    const odd = entry({ raretes: { nom: 'Mythique', couleur: null, poids: 1 } }, 2);
    expect(gainOf(odd, DEFAULT_PRICES).gold).toBe(DEFAULT_PRICES.commun.gold);
  });
});
