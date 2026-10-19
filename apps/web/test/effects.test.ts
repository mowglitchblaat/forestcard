// "Des effets partout": the example card of an effect is the rarest real card that has it.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { exampleFor, opponentFor } from '../src/views/encyclopedia/effects.tsx';
import { rarityExample } from '../src/views/encyclopedia/rarities.tsx';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CARDS = JSON.parse(
  readFileSync(join(ROOT, 'docs', 'legacy', 'cartes-2026-10-19.json'), 'utf8'),
) as Parameters<typeof exampleFor>[1];

test('a fighter first, then the rarest, then by name; its lines are the effect only', () => {
  const bleed = exampleFor(
    { label: 'Saignement', types: ['saignement'], target: 'opponent' },
    CARDS,
  );
  expect(bleed?.card.nom).toBe('PLG');
  expect(bleed?.lines).toHaveLength(1);
  expect(bleed?.lines[0]).toMatch(/saign/i);
  expect(
    exampleFor({ label: 'Poison', types: ['poison', 'poison_effet'], target: 'opponent' }, CARDS)
      ?.card.nom,
  ).toBe('Esprit du serpent');
});

test('a basic attack effect counts as its passive', () => {
  const curse = exampleFor(
    { label: 'Malédiction', types: ['malediction'], target: 'opponent' },
    CARDS,
  );
  expect(curse).not.toBeNull();
});

test('an effect no card has yet: no example', () => {
  expect(
    exampleFor({ label: 'Détonation', types: ['detonation'], target: 'opponent' }, CARDS),
  ).toBeNull();
});

test("the preview's opponent: a common fighter other than the example card", () => {
  const first = opponentFor(CARDS, null);
  expect(first?.type).toBe('combattant');
  expect(first?.raretes.nom).toBe('Commune');
  expect(opponentFor(CARDS, first)?.nom).not.toBe(first?.nom);
});

test('a magic or a trap only when no fighter has the effect', () => {
  // Purification: fighters (Dieu Cerf) beat the legendary-free magics that also purify.
  expect(
    exampleFor({ label: 'Purification', types: ['purification'], target: 'self' }, CARDS)?.card
      .type,
  ).toBe('combattant');
  // Blocked attack (annule_attaque): only magics and traps have it.
  const cancel = exampleFor(
    { label: 'Annulation', types: ['annule_attaque'], target: 'opponent' },
    CARDS,
  );
  expect(cancel?.card.type === 'magie' || cancel?.card.type === 'piege').toBe(true);
});

test('a rarity example: a fighter of that rarity, the first by name', () => {
  const legendary = rarityExample('legendaire', CARDS);
  expect(legendary?.type).toBe('combattant');
  expect(legendary?.raretes.nom).toBe('Légendaire');
  expect(rarityExample('ggez', CARDS)?.raretes.nom).toBe('GGEZ');
});
