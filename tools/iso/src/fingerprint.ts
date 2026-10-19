// A fingerprint of everything an iso result depends on: the reference engine, the candidate (engine
// and journal sources), the card snapshot and the harness that builds the encounters. Checkpoints
// carry it in their name, so a run never resumes from a checkpoint written by other code or other
// cards: after any change, the run starts over.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const SOURCES = ['packages/engine/src', 'packages/journal/src', 'tools/iso/src'];

const filesUnder = (dir: string): string[] =>
  readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? filesUnder(path) : [path];
    })
    .filter((path) => /\.(ts|js)$/.test(path) && !path.endsWith('.test.ts'));

export function fingerprint(...extraFiles: string[]): string {
  const hash = createHash('sha256');
  const files = [
    ...SOURCES.flatMap((dir) => filesUnder(join(ROOT, dir))).sort(),
    ...extraFiles.map((f) => resolve(f)),
  ];
  for (const file of files) {
    hash.update(file.slice(ROOT.length).replace(/\\/g, '/'));
    hash.update(readFileSync(file));
  }
  return hash.digest('hex').slice(0, 12);
}
