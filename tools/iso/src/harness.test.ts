// Tests of the iso harness itself. The engines are exercised by the iso run; here we check the
// properties the run relies on: full coverage, reproducibility, symmetry, legal decks, and the
// JSON-level comparison.

import { describe, expect, test } from 'vite-plus/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compareResults } from './compare.ts';
import { loadEngine } from './engines.ts';
import { Scramble } from './random.ts';
import { loadRealCards, makeSuite } from './suites.ts';
import type { EngineResult } from './types.ts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CARDS = join(ROOT, 'docs', 'legacy', 'cartes-2026-10-19.json');
const LEGACY = join(ROOT, 'legacy', 'moteur-combat.js');
const options = { cardsFile: CARDS, seeds: 2, count: 500 };

describe('Scramble', () => {
  test.each([1, 2, 7, 100, 1_000_003, 1_234_567])(
    'visits every index of [0, %i) exactly once',
    (total) => {
      const scramble = new Scramble(total);
      const seen = new Uint8Array(total);
      for (let k = 0; k < total; k++) seen[scramble.at(k)]! += 1;
      expect(seen.every((n) => n === 1)).toBe(true);
    },
  );
});

describe('real suite', () => {
  const suite = makeSuite('real', options);
  const cards = loadRealCards(CARDS);
  const count = (type: string) => cards.filter((c) => c.type === type).length;
  const trios = count('combattant') * count('magie') * count('piege');

  test('covers every ordered pair of trios, for every seed', () => {
    expect(suite.total).toBe(trios * trios * options.seeds);
  });

  test('an encounter is a pure function of k', () => {
    expect(suite.encounter(12345)).toEqual(suite.encounter(12345));
  });

  test('each deck is one fighter, one magic, one trap', () => {
    for (let k = 0; k < 200; k++) {
      const { a, b } = suite.encounter(k);
      for (const deck of [a.deck, b.deck])
        expect(deck.map((c) => c.type)).toEqual(['combattant', 'magie', 'piege']);
    }
  });
});

describe('real suite on a two-trio fixture (exhaustive)', () => {
  // 2 fighters x 1 magic x 1 trap = 2 trios -> 4 ordered pairs x 2 seeds = 8 encounters.
  const dir = mkdtempSync(join(tmpdir(), 'iso-fixture-'));
  const file = join(dir, 'cards.json');
  writeFileSync(
    file,
    JSON.stringify([
      { id: 1, type: 'combattant', nom: 'X', atq: 10, pv: 60, passif: null, ultime: null },
      { id: 2, type: 'combattant', nom: 'Y', atq: 12, pv: 50, passif: null, ultime: null },
      { id: 3, type: 'magie', nom: 'M', effet: { type: 'soin', val: 5 } },
      {
        id: 4,
        type: 'piege',
        nom: 'P',
        effet: {
          condition: { type: 'adv_attaque', coups: 1 },
          effet: { type: 'degats', val: 3 },
          declenchements: 1,
        },
      },
    ]),
  );
  const suite = makeSuite('real', { cardsFile: file, seeds: 2, count: 0 });
  const encounters = Array.from({ length: suite.total }, (_, k) => suite.encounter(k));
  const fighter = (p: { deck: { nom: string }[] }) => p.deck[0]?.nom;

  test('visits each (ordered pair, seed) exactly once', () => {
    const keys = encounters.map((e) => `${fighter(e.a)}>${fighter(e.b)}#${e.options.seed}`);
    expect(suite.total).toBe(8);
    expect(new Set(keys).size).toBe(8);
  });

  test('(X, Y) and (Y, X) use the same seeds', () => {
    const seedsOf = (a: string, b: string) =>
      encounters
        .filter((e) => fighter(e.a) === a && fighter(e.b) === b)
        .map((e) => e.options.seed)
        .sort((x, y) => x - y);
    expect(seedsOf('X', 'Y')).toEqual(seedsOf('Y', 'X'));
    expect(seedsOf('X', 'Y')).toHaveLength(2);
  });

  test('on the legacy oracle, swapping the players with the same seed swaps who starts', async () => {
    const engine = await loadEngine(LEGACY);
    for (const e of encounters.filter((x) => fighter(x.a) === 'X' && fighter(x.b) === 'Y')) {
      const starter = (a: typeof e.a, b: typeof e.b) => {
        const debut = engine(structuredClone(a), structuredClone(b), { seed: e.options.seed })
          .journal[0];
        const players = debut?.['joueurs'] as { carte: string }[];
        return players[debut?.['premier'] as number]?.carte;
      };
      expect(new Set([starter(e.a, e.b), starter(e.b, e.a)])).toEqual(new Set(['X', 'Y']));
    }
  });
});

describe('decks suite', () => {
  const suite = makeSuite('decks', options);

  test('decks are legal: 10 distinct cards, at least 3 of each type', () => {
    for (let k = 0; k < 300; k++) {
      for (const { deck } of [suite.encounter(k).a, suite.encounter(k).b]) {
        expect(new Set(deck.map((c) => c.id)).size).toBe(10);
        for (const type of ['combattant', 'magie', 'piege'])
          expect(deck.filter((c) => c.type === type).length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test('every other encounter forces overtimes with maxTours 2', () => {
    expect(suite.encounter(0).options.regles).toBeUndefined();
    expect(suite.encounter(1).options.regles).toEqual({ maxTours: 2 });
  });
});

describe('dirty suite', () => {
  const suite = makeSuite('dirty', options);
  const clean = makeSuite('synthetic', options);

  test('an encounter is a pure function of k', () => {
    expect(suite.encounter(77)).toEqual(suite.encounter(77));
  });

  test('keeps the synthetic decks, seeds and card identities', () => {
    for (let k = 0; k < 100; k++) {
      const d = suite.encounter(k);
      const c = clean.encounter(k);
      expect(d.options).toEqual(c.options);
      expect(d.a.deck.map((x) => [x.id, x.type, x.nom])).toEqual(
        c.a.deck.map((x) => [x.id, x.type, x.nom]),
      );
    }
  });

  test('actually corrupts data: text numbers, empty strings and nulls all occur', () => {
    const seen = new Set<string>();
    const walk = (v: unknown): void => {
      if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) seen.add('text-number');
      if (v === '') seen.add('empty');
      if (v === null) seen.add('null');
      if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    for (let k = 0; k < 200; k++) walk(suite.encounter(k));
    expect([...seen].sort()).toEqual(['empty', 'null', 'text-number']);
  });
});

describe('compareResults (JSON contract)', () => {
  const result = (
    journal: EngineResult['journal'],
    extra: Record<string, unknown> = {},
  ): EngineResult => ({
    seed: 1,
    gagnant: 0,
    recompenses: [50, 10],
    journal,
    ...extra,
  });

  test('key order, undefined properties and -0 are not differences', () => {
    const ref = result([{ t: 'degats', n: 0, k: undefined }]);
    const cand = result([{ n: -0, t: 'degats' }]);
    expect(compareResults(ref, cand)).toBeNull();
  });

  test('locates the first differing event', () => {
    const ref = result([{ t: 'debut' }, { t: 'degats', n: 5 }, { t: 'fin' }]);
    const cand = result([{ t: 'debut' }, { t: 'degats', n: 6 }, { t: 'fin' }]);
    expect(compareResults(ref, cand)).toEqual({
      eventIndex: 1,
      reference: { t: 'degats', n: 5 },
      candidate: { t: 'degats', n: 6 },
    });
  });

  test('a missing trailing event is a difference', () => {
    expect(
      compareResults(result([{ t: 'debut' }, { t: 'fin' }]), result([{ t: 'debut' }]))?.eventIndex,
    ).toBe(1);
  });

  test('a difference outside the journal is reported without an event index', () => {
    const divergence = compareResults(result([], { gagnant: 0 }), result([], { gagnant: 1 }));
    expect(divergence?.eventIndex).toBeNull();
  });
});
