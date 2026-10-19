// The four encounter suites of the iso run (tools/iso/README.md, "La preuve").
//
//   real       every real trio against every real trio, in ordered pairs, `seeds` seeds per pair.
//              Exhaustive. Both orders of a pair share their seeds, and the first player depends
//              on the seed only, so each trio of a pair gets to start.
//   synthetic  random trios mixing real and synthetic cards, for the engine branches no real card
//              reaches.
//   decks      random legal 10-card decks (3 fighters, 3 magics, 3 traps + 1), so overtimes draw
//              never-played cards; every other encounter uses maxTours 2 to force overtimes.
//   dirty      the synthetic encounters with corrupted data, as found in the database: numbers as
//              text, empty strings, nulls, passives as arrays (src/dirty.ts).
//
// Every encounter is a pure function of (suite, k): a run can stop and resume at any k.

import { readFileSync } from 'node:fs';
import type { Card, CardType, Encounter, Player, Rules } from './types.ts';
import { generator, hash2, pick, Scramble, toCombatSeed } from './random.ts';
import { dirtyCard } from './dirty.ts';
import { syntheticCards } from './synthetic.ts';

export type SuiteName = 'real' | 'synthetic' | 'decks' | 'dirty';

export type Suite = {
  name: SuiteName;
  total: number;
  encounter(k: number): Encounter;
};

export type SuiteOptions = {
  cardsFile: string;
  seeds: number; // real suite: seeds per ordered pair
  count: number; // synthetic, decks and dirty suites: number of encounters
};

type Pools = Record<CardType, Card[]>;

const SUITE_SALT: Record<SuiteName, number> = {
  real: 0x5eed0001,
  synthetic: 0x5eed0002,
  decks: 0x5eed0003,
  dirty: 0x5eed0004,
};

export function loadRealCards(cardsFile: string): Card[] {
  const cards = JSON.parse(readFileSync(cardsFile, 'utf8')) as Card[];
  return [...cards].sort((a, b) => Number(a.id) - Number(b.id));
}

function pools(cards: Card[]): Pools {
  const by = (type: CardType) => cards.filter((c) => c.type === type);
  return { combattant: by('combattant'), magie: by('magie'), piege: by('piege') };
}

const player = (pseudo: string, deck: Card[]): Player => ({ pseudo, deck });

export function makeSuite(name: SuiteName, options: SuiteOptions): Suite {
  const real = pools(loadRealCards(options.cardsFile));
  if (name === 'real') return realSuite(real, options.seeds);
  const synthetic = pools(syntheticCards());
  const mixed: Pools = {
    combattant: [...real.combattant, ...synthetic.combattant],
    magie: [...real.magie, ...synthetic.magie],
    piege: [...real.piege, ...synthetic.piege],
  };
  if (name === 'synthetic') return syntheticSuite(real, synthetic, options.count);
  if (name === 'decks') return decksSuite(mixed, options.count);
  return dirtySuite(syntheticSuite(real, synthetic, options.count));
}

function dirtySuite(clean: Suite): Suite {
  return {
    name: 'dirty',
    total: clean.total,
    encounter(k) {
      const { a, b, options } = clean.encounter(k);
      const next = generator(hash2(SUITE_SALT.dirty, k));
      const corrupt = (p: Player) =>
        player(
          p.pseudo,
          p.deck.map((card) => dirtyCard(next, card)),
        );
      return { id: `dirty:${k}`, a: corrupt(a), b: corrupt(b), options };
    },
  };
}

function realSuite(real: Pools, seeds: number): Suite {
  const { combattant: c, magie: m, piege: p } = real;
  const trios = c.length * m.length * p.length;
  const trio = (t: number): Card[] => {
    const fighter = c[t % c.length];
    const magic = m[Math.floor(t / c.length) % m.length];
    const trap = p[Math.floor(t / (c.length * m.length))];
    if (!fighter || !magic || !trap) throw new Error(`trio ${t} out of range`);
    return [fighter, magic, trap];
  };
  const scramble = new Scramble(trios * trios * seeds);
  return {
    name: 'real',
    total: scramble.total,
    encounter(k) {
      const q = scramble.at(k);
      const s = q % seeds;
      const pair = Math.floor(q / seeds);
      const i = Math.floor(pair / trios);
      const j = pair % trios;
      // Same seed for (i, j) and (j, i): together they cover both starting players.
      const seed = toCombatSeed(hash2(hash2(Math.min(i, j), Math.max(i, j)), s));
      return {
        id: `real:${k}`,
        a: player('A', trio(i)),
        b: player('B', trio(j)),
        options: { seed },
      };
    },
  };
}

function syntheticSuite(real: Pools, synthetic: Pools, count: number): Suite {
  // Each slot takes a synthetic card half of the time, so synthetic cards meet real ones too.
  // 5 % of decks lack their magic or their trap: the engine's "no card" path (test modes use it).
  const slot = (next: () => number, type: CardType): Card =>
    pick(next, next() < 0.5 ? synthetic[type] : real[type]);
  const deck = (next: () => number): Card[] => {
    const cards = [slot(next, 'combattant')];
    if (next() >= 0.05) cards.push(slot(next, 'magie'));
    if (next() >= 0.05) cards.push(slot(next, 'piege'));
    return cards;
  };
  return {
    name: 'synthetic',
    total: count,
    encounter(k) {
      const next = generator(hash2(SUITE_SALT.synthetic, k));
      const a = deck(next);
      const b = deck(next);
      const seed = toCombatSeed(hash2(SUITE_SALT.synthetic ^ 0xffff, k));
      return { id: `synthetic:${k}`, a: player('A', a), b: player('B', b), options: { seed } };
    },
  };
}

function decksSuite(mixed: Pools, count: number): Suite {
  const all = [...mixed.combattant, ...mixed.magie, ...mixed.piege];
  // A legal deck as the edge function accepts it: 10 distinct cards, at least 3 of each type.
  const deck = (next: () => number): Card[] => {
    const chosen = new Set<Card>();
    const take = (from: Card[], n: number) => {
      while ([...chosen].filter((c) => from.includes(c)).length < n) chosen.add(pick(next, from));
    };
    take(mixed.combattant, 3);
    take(mixed.magie, 3);
    take(mixed.piege, 3);
    while (chosen.size < 10) chosen.add(pick(next, all));
    // Card order matters (the engine draws by index): shuffle it.
    const cards = [...chosen];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [cards[i], cards[j]] = [cards[j] as Card, cards[i] as Card];
    }
    return cards;
  };
  return {
    name: 'decks',
    total: count,
    encounter(k) {
      const next = generator(hash2(SUITE_SALT.decks, k));
      const a = deck(next);
      const b = deck(next);
      const regles: Rules | undefined = k % 2 === 0 ? undefined : { maxTours: 2 };
      const seed = toCombatSeed(hash2(SUITE_SALT.decks ^ 0xffff, k));
      return {
        id: `decks:${k}`,
        a: player('A', a),
        b: player('B', b),
        options: regles ? { seed, regles } : { seed },
      };
    },
  };
}
