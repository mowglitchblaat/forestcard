// The type lists (model/types.ts) must match what the engine code actually handles: the pages check
// their texts against these lists, so a type the engine handles but the list misses would escape
// that check. The engine sources (combat/ and mechanics/) are scanned for the types they test.

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { LAID_ON_HIT } from '../src/combat/attack.ts';
import { rules } from '../src/combat/effects.ts';
import { EVERY_TURN_PASSIVES } from '../src/combat/turn.ts';
import { EFFECT_TYPES, PASSIVE_TYPES, TRAP_CONDITION_TYPES } from '../src/index.ts';

const SRC = resolve(import.meta.dirname, '..', 'src');
const source = (file: string) => readFileSync(join(SRC, 'combat', file), 'utf8');
const all = ['combat', 'mechanics']
  .flatMap((dir) =>
    readdirSync(join(SRC, dir))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(join(SRC, dir, f), 'utf8')),
  )
  .join('\n');
const sorted = (list: Iterable<string>) => [...new Set(list)].sort();

// The compiler checks every type has a rule; this checks no rule is there for a type the list lacks
// (a typo in a mechanic's table).
test('EFFECT_TYPES = the rules of the effect registry', () => {
  expect(sorted(EFFECT_TYPES)).toEqual(sorted(Object.keys(rules())));
});

test('PASSIVE_TYPES = the passive types the combat code tests', () => {
  // Passives are read as `p.type === '…'` on s.passives / a.passives / d.passives, and attack effects
  // given by magics share the same `q.type` checks.
  const tested = [...all.matchAll(/\b[pq]\.type === '([a-z_]+)'/g)].map((m) => m[1] as string);
  // Plus the passives read through helpers: avoid-death at card creation, revive sources.
  const read = [
    ...all.matchAll(/passives\.(?:some|filter|find)\(\(\w+\) => \w+\.type === '([a-z_]+)'\)/g),
  ].map((m) => m[1] as string);
  // Plus the passives dispatched by type: the statuses an attack lays, the "every turn" ones.
  const laid = [...Object.keys(LAID_ON_HIT), ...Object.keys(EVERY_TURN_PASSIVES)];
  // (`typeof x.type === 'string'` is a type check, not a passive.)
  const fromState = [...source('state.ts').matchAll(/(typeof )?\w+\.type === '([a-z_]+)'/g)]
    .filter((m) => !m[1])
    .map((m) => m[2] as string);
  expect(sorted(PASSIVE_TYPES)).toEqual(sorted([...tested, ...read, ...laid, ...fromState]));
});

test('TRAP_CONDITION_TYPES = the conditions scan() knows', () => {
  const block = source('traps.ts').split('const conditions')[1]?.split('};')[0] ?? '';
  const keys = [...block.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1] as string);
  expect(sorted(TRAP_CONDITION_TYPES)).toEqual(sorted(keys));
});
