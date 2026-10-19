// Runs the legacy rule tests (legacy/tests/moteur.test.js, written by the author) against the
// TypeScript engine, unchanged: the file is executed with a `require` that maps the legacy engine to
// the engine + journal projection (packages/journal simuler()) and node:test to Vitest. A resync of
// legacy/ brings the new rule tests along.
//
// Skipped: "les 3 copies du moteur sont identiques". It checks the layout of the legacy files, not a
// game rule, and the TypeScript engine replaces those copies.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compileFunction } from 'node:vm';
import { test } from 'vite-plus/test';
import { simuler } from '../../journal/src/index.ts';
import { DEFAULT_RULES } from '../src/index.ts';

const LEGACY_TESTS = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'legacy',
  'tests',
  'moteur.test.js',
);
const SKIPPED = new Set([
  'les 3 copies du moteur sont identiques (moteur-combat.js, combat.html, swift-responder.ts)',
]);

const modules: Record<string, unknown> = {
  'node:test': (name: string, fn: () => void) =>
    SKIPPED.has(name) ? test.skip(name, fn) : test(name, fn),
  'node:assert/strict': assert,
  fs,
  path,
  '../moteur-combat.js': { simuler, REG: DEFAULT_RULES },
};

const requireShim = (id: string): unknown => {
  if (!(id in modules)) throw new Error(`legacy test requires an unmapped module: ${id}`);
  return modules[id];
};

const run = compileFunction(fs.readFileSync(LEGACY_TESTS, 'utf8'), ['require', '__dirname'], {
  filename: LEGACY_TESTS,
});
run(requireShim, path.dirname(LEGACY_TESTS));
