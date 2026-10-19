// Effect texts: the keywords coloured as on the legacy page, the text itself untouched.

import { expect, test } from 'vite-plus/test';
import { keywordPieces } from '../src/lib/keywords.ts';

const kinds = (text: string) =>
  keywordPieces(text)
    .filter((p) => p.kind)
    .map((p) => `${p.text}:${p.kind}`);

test('each keyword with what it is about', () => {
  expect(kinds('Inflige 20 % de dégâts pendant 3 tours, puis soigne de 5 PV')).toEqual([
    '20 %:percent',
    'dégâts:damage',
    '3 tours:turns',
    'soigne:healing',
    '5:number',
    'PV:healing',
  ]);
  expect(kinds("Étourdit l'adversaire ; sa prochaine attaque est annulée")).toEqual([
    'Étourdit:status',
    'attaque:attack',
    'annulée:status',
  ]);
});

test('a keyword inside a word is not one', () => {
  expect(kinds('Vollée de flèches, gelée royale')).toEqual(['gelée:status']);
  expect(kinds('PVE')).toEqual([]);
});

test('joined back, the pieces give the text', () => {
  const text = "+15 % d'ATQ, rage : frappe 2 fois";
  expect(
    keywordPieces(text)
      .map((p) => p.text)
      .join(''),
  ).toBe(text);
});
