// An icon means one thing (src/lib/icons.ts): no two meanings share an icon, and no view picks an
// icon on its own, outside the registry.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { ICONS } from '../src/lib/icons.ts';

const SRC = resolve(import.meta.dirname, '..', 'src');

test('no two meanings share an icon', () => {
  const byIcon = new Map<unknown, string[]>();
  for (const [meaning, icon] of Object.entries(ICONS))
    byIcon.set(icon, [...(byIcon.get(icon) ?? []), meaning]);
  const shared = [...byIcon.values()].filter((meanings) => meanings.length > 1);
  expect(shared).toEqual([]);
});

test('lucide-react is imported by the registry only (and the shadcn components)', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) files.push(relative(SRC, path).split(sep).join('/'));
    }
  };
  walk(SRC);
  const importing = files.filter(
    (f) =>
      f !== 'lib/icons.ts' &&
      !f.startsWith('components/ui/') &&
      /from ['"]lucide-react['"]/.test(readFileSync(join(SRC, f), 'utf8')),
  );
  expect(importing).toEqual([]);
});
