// Loads an engine following the legacy calling convention: `(pA, pB, { seed, regles }) => result`.
//
// Two kinds of modules:
//   - legacy UMD / CommonJS (`.js`), exporting `simuler`. Each load copies the file to a fresh
//     temporary path before requiring it, so two loads of the same file are two independent module
//     instances: that is what makes the "legacy vs legacy" run meaningful;
//   - ES modules (`.ts`, `.mts`, `.mjs`), exporting `simuler` or `simulate`, imported in place
//     (their relative imports must resolve). The TypeScript engine is loaded this way.

import { copyFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Engine } from './types.ts';

const require = createRequire(import.meta.url);

const isEsModule = (path: string) => /\.(ts|mts|mjs)$/.test(path);

export async function loadEngine(path: string): Promise<Engine> {
  if (isEsModule(path)) return pick(await import(pathToFileURL(resolve(path)).href), path);
  const isolated = join(mkdtempSync(join(tmpdir(), 'forestcard-engine-')), basename(path));
  copyFileSync(resolve(path), isolated);
  return pick(require(isolated), path);
}

function pick(loaded: unknown, path: string): Engine {
  const module = loaded as { simuler?: unknown; simulate?: unknown } | null;
  const engine = module?.simuler ?? module?.simulate;
  if (typeof engine !== 'function')
    throw new Error(`${path} exports neither simuler() nor simulate()`);
  return engine as Engine;
}
