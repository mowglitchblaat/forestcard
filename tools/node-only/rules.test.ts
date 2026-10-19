// The author's rule tests (moteur.test.js), run against the TypeScript engine with Node alone:
//
//   node --test tools/node-only/rules.test.ts
//
// The same bridge as packages/engine/test/legacy-rules.test.ts, which runs them under Vitest when
// the workspace is installed: the file is executed unchanged, with a `require` that maps the legacy
// engine to the engine + journal projection (simuler()), and node:test as it is.
//
// Skipped: "les 3 copies du moteur sont identiques". It checks the layout of the legacy files, not a
// game rule, and the TypeScript engine replaces those copies.
//
// Needs the workspace links once (node tools/node-only/link.ts): the journal imports
// '@forestcard/engine'.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { compileFunction } from 'node:vm';
import { DEFAULT_RULES } from '../../packages/engine/src/index.ts';
import { simuler } from '../../packages/journal/src/index.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
// Before the cutover in legacy/tests, after it next to the engine's tests (docs/guides/basculement.md).
const LEGACY_TESTS = [
  path.join(ROOT, 'legacy', 'tests', 'moteur.test.js'),
  path.join(ROOT, 'packages', 'engine', 'test', 'moteur.test.js'),
].find((file) => fs.existsSync(file));
if (!LEGACY_TESTS)
  throw new Error('moteur.test.js not found (legacy/tests or packages/engine/test)');

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
  if (!(id in modules)) throw new Error(`the rule tests require an unmapped module: ${id}`);
  return modules[id];
};

const run = compileFunction(fs.readFileSync(LEGACY_TESTS, 'utf8'), ['require', '__dirname'], {
  filename: LEGACY_TESTS,
});
run(requireShim, path.dirname(LEGACY_TESTS));
