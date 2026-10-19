// The deck's rules (legacy dkCompte, dkValide, dkRefus) and the "Deck de combat" mark.

import { expect, test } from 'vite-plus/test';
import type { CardType } from '../src/data/cards.ts';
import { SavedDeck } from '../src/data/decks.ts';
import { combatDeckId, compose, nameProblem, refusal, sameCards } from '../src/views/deck/model.ts';

// Cards 1-5 fighters, 11-15 magics, 21-25 traps.
const typeOf = (id: number): CardType => (id < 10 ? 'combattant' : id < 20 ? 'magie' : 'piege');
const full = [1, 2, 3, 11, 12, 13, 21, 22, 23, 4];

test('complete: 10 cards, at least 3 of each type, the tenth free', () => {
  expect(compose(full, typeOf)).toMatchObject({ size: 10, free: 1, complete: true });
  expect(compose(full.slice(0, 9), typeOf).complete).toBe(false);
  expect(compose([1, 2, 3, 4, 11, 12, 13, 21, 22, 5], typeOf).complete).toBe(false);
});

test('a card joins while its type has room or the free slot is open', () => {
  const nine = [1, 2, 3, 11, 12, 13, 21, 22, 23];
  expect(refusal(nine, 4, typeOf)).toBeNull();
  const freeTaken = [1, 2, 3, 4, 11, 12, 13, 21, 22];
  expect(refusal(freeTaken, 5, typeOf)).toMatch(/Plus de place pour un combattant/);
  expect(refusal(freeTaken, 23, typeOf)).toBeNull();
  expect(refusal(full, 24, typeOf)).toMatch(/Deck complet/);
  // A card in the deck can always leave.
  expect(refusal(full, 1, typeOf)).toBeNull();
});

test('the "Deck de combat" mark: the saved deck with the combat deck’s cards, by name if several', () => {
  const decks = [
    SavedDeck.parse({ id: 2, nom: 'Zeta', cartes: [...full].reverse() }),
    SavedDeck.parse({ id: 1, nom: 'Alpha', cartes: full }),
    SavedDeck.parse({ id: 3, nom: 'Autre', cartes: [1] }),
  ];
  expect(combatDeckId(decks, full)).toBe('1');
  expect(combatDeckId(decks, [5])).toBeNull();
  expect(combatDeckId(decks, [])).toBeNull();
  expect(sameCards([1, 2], [2, 1])).toBe(true);
});

test('a name: 1 to 30 characters, not another deck’s (that would overwrite it)', () => {
  const decks = [SavedDeck.parse({ id: 1, nom: 'Feu', cartes: [] })];
  expect(nameProblem('  ', decks)).toMatch(/nom/);
  expect(nameProblem('x'.repeat(31), decks)).toMatch(/30/);
  expect(nameProblem('feu ', decks)).toMatch(/déjà/);
  expect(nameProblem('Feu', decks, '1')).toBeNull();
  expect(nameProblem('Eau', decks)).toBeNull();
});
