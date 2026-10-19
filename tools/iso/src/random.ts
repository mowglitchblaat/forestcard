// Deterministic helpers for the harness itself (choosing decks, seeds, visiting order).
// They never touch the engines' own RNG: each engine receives only an integer seed.

// Integer hash of two 32-bit values (murmur3-style finalizer). Same inputs, same output, on any
// machine, which is what makes every encounter reproducible from its id alone.
export function hash2(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Combat seeds live in [0, 1e9), the range the edge function draws from.
export const toCombatSeed = (h: number): number => h % 1_000_000_000;

// Small seeded generator (mulberry32) for building synthetic decks.
export function generator(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(next: () => number, items: readonly T[]): T => {
  const item = items[Math.floor(next() * items.length)];
  if (item === undefined) throw new Error('pick() on an empty list');
  return item;
};

// Bijective scramble of [0, total): visiting k = 0, 1, 2… touches every index exactly once, in an
// order spread over the whole space. A divergence that only some trios trigger then shows up early
// instead of after hours of visiting the same first trio.
// Safe while multiplier * total < 2^53: the constructor checks it.
export class Scramble {
  readonly total: number;
  readonly #multiplier: number;
  readonly #offset: number;

  constructor(total: number) {
    if (!Number.isSafeInteger(total) || total <= 0) throw new Error(`invalid total ${total}`);
    let multiplier = 1_000_003;
    while (gcd(multiplier, total) !== 1) multiplier += 2;
    if (multiplier * total > Number.MAX_SAFE_INTEGER)
      throw new Error(`total ${total} too large to scramble`);
    this.total = total;
    this.#multiplier = multiplier;
    this.#offset = Math.floor(total / 3);
  }

  at(k: number): number {
    return (this.#multiplier * k + this.#offset) % this.total;
  }
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}
