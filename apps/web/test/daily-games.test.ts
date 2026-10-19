// Daily games: when the day is over for the player, the time left until midnight in Paris, the
// chances of higher or lower, and the wording of the refusals.

import { expect, test } from 'vite-plus/test';
import {
  countdown,
  type DailyGames,
  gameError,
  gamesLeft,
  gamesOver,
  higherLowerOdds,
  minutesToMidnight,
} from '../src/data/daily-games.ts';

const all: DailyGames = {
  champignons: { joue: true },
  duel: { joue: true },
  plusmoins: { joue: true, fini: true },
  ticket: { joue: true, encaisse: true },
};

test('over when every game is: picked, played, run ended, ticket cashed', () => {
  expect(gamesOver(all)).toBe(true);
  expect(gamesOver({ ...all, champignons: { joue: false } })).toBe(false);
  expect(gamesOver({ ...all, plusmoins: { joue: true, fini: false } })).toBe(false);
  expect(gamesOver({ ...all, ticket: { joue: true, encaisse: false } })).toBe(false);
  expect(gamesOver({ ...all, ticket: { joue: false } })).toBe(false);
});

test('the games left to play today', () => {
  expect(gamesLeft(all)).toBe(0);
  expect(gamesLeft({ ...all, champignons: { joue: false }, ticket: { joue: true } })).toBe(2);
});

test('minutes until midnight in Paris, whatever the time zone of the machine', () => {
  // 20:53 UTC in October is 22:53 in Paris (summer time): 67 minutes left.
  expect(minutesToMidnight(new Date('2026-10-18T20:53:00Z'))).toBe(67);
  // 23:30 UTC in October is 01:30 in Paris, the next day: 22 h 30 left.
  expect(minutesToMidnight(new Date('2026-10-18T23:30:00Z'))).toBe(22 * 60 + 30);
  // Winter: 22:59:30 UTC in December is 23:59:30 in Paris.
  expect(minutesToMidnight(new Date('2026-12-01T22:59:30Z'))).toBe(1);
});

test('the countdown as the legacy page writes it', () => {
  expect(countdown(67)).toBe('1 h 07');
  expect(countdown(5)).toBe('0 h 05');
});

// Five fighters by id: their HP.
const fighters = new Map([
  [1, 50],
  [2, 30],
  [3, 50],
  [4, 80],
  [5, 10],
]);
const card = (id: number) => ({ id, nom: `c${id}`, pv: fighters.get(id) });

test('higher or lower: the chances among the fighters not seen yet, a tie winning both ways', () => {
  // Card 1 (50) shown: 2, 3, 4, 5 left; higher or equal 3 and 4, lower or equal 2, 3 and 5.
  expect(higherLowerOdds(fighters, { joue: true, carte: card(1), coups: [] })).toEqual({
    plus: 2 / 4,
    moins: 3 / 4,
  });
  // 1 then 4 (80) seen: 2, 3, 5 left, all lower.
  const coups = [{ avant: card(1), apres: card(4), choix: 'plus', ok: true }];
  expect(higherLowerOdds(fighters, { joue: true, carte: card(4), coups })).toEqual({
    plus: 0,
    moins: 1,
  });
});

test('higher or lower: every fighter seen, all of them count again', () => {
  const seen = [1, 2, 3, 4, 5];
  const coups = seen.slice(1).map((id, i) => ({
    avant: card(seen[i] as number),
    apres: card(id),
    choix: 'plus',
    ok: true,
  }));
  expect(higherLowerOdds(fighters, { joue: true, carte: card(5), coups })).toEqual({
    plus: 1,
    moins: 1 / 5,
  });
});

test('a refusal of the database in the words of the legacy page, another error as is', () => {
  expect(gameError(new Error('DEJA_JOUE'))).toBe(
    "Tu as déjà joué à ce jeu aujourd'hui, reviens demain !",
  );
  expect(gameError(new Error('réseau coupé'))).toBe('réseau coupé');
});
