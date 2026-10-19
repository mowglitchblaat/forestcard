// Every type the engine handles has a synthetic card in the iso harness: otherwise a new effect,
// passive, trap condition or ultimate trigger would never be exercised by the iso run. When this test fails after
// adding a type to the engine, add a template to src/synthetic.ts (docs/guides/ajouter-un-effet.md).

import { expect, test } from 'vite-plus/test';
import {
  EFFECT_TYPES,
  PASSIVE_TYPES,
  TRAP_CONDITION_TYPES,
  ULTIMATE_TRIGGER_TYPES,
} from '../../../packages/engine/src/index.ts';
import { EFFECTS, PASSIVES, TRAP_CONDITIONS, ULTIMATE_TRIGGERS } from './synthetic.ts';

const missing = (expected: readonly string[], present: Iterable<unknown>) => {
  const have = new Set([...present].map(String));
  return expected.filter((t) => !have.has(t));
};

test('every effect type has a synthetic template', () => {
  const templates = Object.values(EFFECTS)
    .flat()
    .map((e) => e['type']);
  expect(missing(EFFECT_TYPES, templates)).toEqual([]);
});

test('every passive type has a synthetic passive', () => {
  expect(
    missing(
      PASSIVE_TYPES,
      PASSIVES.map((p) => p['type']),
    ),
  ).toEqual([]);
});

test('every trap condition has a synthetic trap', () => {
  expect(
    missing(
      TRAP_CONDITION_TYPES,
      TRAP_CONDITIONS.map((c) => c['type']),
    ),
  ).toEqual([]);
});

test('every ultimate trigger has a synthetic ultimate', () => {
  expect(
    missing(ULTIMATE_TRIGGER_TYPES, ULTIMATE_TRIGGERS.map((t) => t['udecl']).filter(Boolean)),
  ).toEqual([]);
});
