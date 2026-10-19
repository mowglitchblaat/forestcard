// Upstream files we keep as is, but in our own layout: same files, same bytes as their legacy/
// mirror. A file added or changed upstream fails this test until it is copied again (the
// destination's README says how). Retired at cutover, when legacy/ leaves the repository.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

// legacy/ path (file, or folder with a file filter) → our path.
const COPIES: { from: string; to: string; files?: RegExp }[] = [
  { from: 'legacy', to: 'db/migrations', files: /^\d{2}-.*\.sql$/ },
  { from: 'legacy/cadres', to: 'assets/cadres' },
  { from: 'legacy/overlay.html', to: 'apps/overlay-boosters/src/overlay.html' },
  { from: 'legacy/patchnotes.json', to: 'apps/site/public/patchnotes.json' },
  { from: 'legacy/outils/copier-images.mjs', to: 'tools/copier-images/copier-images.mjs' },
];

const isDir = (path: string) => statSync(join(ROOT, path)).isDirectory();
const list = (dir: string, files: RegExp | undefined) =>
  readdirSync(join(ROOT, dir), { recursive: true })
    .map(String)
    .filter((f) => !statSync(join(ROOT, dir, f)).isDirectory())
    .map((f) => relative('.', f).split(sep).join('/'))
    .filter((f) => !files || files.test(f))
    .sort();

describe.each(COPIES)('$from → $to', ({ from, to, files }) => {
  const pairs = isDir(from)
    ? list(from, files).map((f) => [join(from, f), join(to, f)] as const)
    : [[from, to] as const];

  if (isDir(from))
    test('same files', () => {
      expect(list(to, files)).toEqual(list(from, files));
    });

  test('same bytes', () => {
    for (const [a, b] of pairs)
      expect(readFileSync(join(ROOT, b)).equals(readFileSync(join(ROOT, a))), b).toBe(true);
  });
});
