// Proposals: the frame tried for each type and rarity, as the legacy page (cadresAEssayer), and the
// rarity tier read from its name.

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vite-plus/test';
import {
  framesToTry,
  PLAQUES,
  plaqueFor,
  RARITY_TIERS,
  tierOfName,
} from '../src/views/proposals/render.ts';

const ASSETS = resolve(import.meta.dirname, '..', '..', '..', 'assets');

test('the tier of a rarity name, accents and case ignored; common by default', () => {
  expect(tierOfName('Légendaire')).toBe('legendaire');
  expect(tierOfName('ÉPIQUE')).toBe('epique');
  expect(tierOfName('GGEZ')).toBe('ggez');
  expect(tierOfName('Mythique')).toBe('commun');
});

test('frames: the type at the rarity, then the rarities below, then the fighter for magic and trap', () => {
  expect(framesToTry('piege', 'ggez')).toEqual([
    'cadres/piege-ggez.png',
    'cadres/piege-legendaire.png',
    'cadres/piege-epique.png',
    'cadres/piege-rare.png',
    'cadres/piege-commun.png',
    'cadres/combattant-ggez.png',
  ]);
  expect(framesToTry('combattant', 'rare')).toEqual([
    'cadres/combattant-rare.png',
    'cadres/combattant-commun.png',
  ]);
});

test('every type and rarity ends on a frame that exists', () => {
  for (const type of ['combattant', 'magie', 'piege'] as const)
    for (const tier of RARITY_TIERS)
      expect(framesToTry(type, tier).some((f) => existsSync(join(ASSETS, f)))).toBe(true);
});

test('every plaque has its image', () => {
  for (const tier of Object.keys(PLAQUES) as (keyof typeof PLAQUES)[])
    expect(existsSync(join(ASSETS, plaqueFor(tier)))).toBe(true);
});
