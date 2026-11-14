// La forge: which cards a filter shows, and the refusals in words.

import { expect, test } from 'vite-plus/test';
import { type ForgeCard, forgeError, forgeFilter } from '../src/data/forge.ts';

const card = (nom: string, palier: ForgeCard['palier']): ForgeCard => ({
  variante_id: nom.length,
  carte_id: nom.length,
  nom,
  variante: 'Standard',
  image: null,
  type: 'combattant',
  palier,
  couleur: null,
  alternative: false,
  prix: 600,
  possede: 0,
});

const cards = [card('Dragon noir maudit', 'legendaire'), card('Épée de foudre', 'epique')];

test('a tier and a search, accents and case aside', () => {
  expect(forgeFilter(cards, null, '')).toHaveLength(2);
  expect(forgeFilter(cards, 'epique', '').map((c) => c.nom)).toEqual(['Épée de foudre']);
  expect(forgeFilter(cards, null, 'EPEE').map((c) => c.nom)).toEqual(['Épée de foudre']);
  expect(forgeFilter(cards, 'ggez', '')).toHaveLength(0);
});

test('the refusals, in words', () => {
  expect(forgeError(new Error('FRAGMENTS_INSUFFISANTS'))).toMatch(/TAC-001/);
});
