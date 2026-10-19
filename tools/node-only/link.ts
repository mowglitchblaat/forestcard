// Without any install (no npm registry), Node can still run the engine, the journal, the iso run and
// the author's rule tests: they are plain TypeScript Node strips (erasable syntax, no external
// dependency). The only thing missing is the workspace link that pnpm would make: the journal
// imports '@forestcard/engine'. This creates node_modules/@forestcard/<package> links to
// packages/<package>, a junction on Windows (no admin rights needed), a symlink elsewhere.
//
//   node tools/node-only/link.ts
//
// An existing entry is left alone (a real pnpm install keeps working). See tools/node-only/README.md.

import { existsSync, lstatSync, mkdirSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGES = ['engine', 'journal', 'describe'];

const scope = join(ROOT, 'node_modules', '@forestcard');
mkdirSync(scope, { recursive: true });
for (const name of PACKAGES) {
  const link = join(scope, name);
  const exists =
    existsSync(link) ||
    (() => {
      try {
        return lstatSync(link).isSymbolicLink();
      } catch {
        return false;
      }
    })();
  if (exists) {
    console.log(`@forestcard/${name}: already there, left as is`);
    continue;
  }
  symlinkSync(
    join(ROOT, 'packages', name),
    link,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  console.log(`@forestcard/${name} -> packages/${name}`);
}
