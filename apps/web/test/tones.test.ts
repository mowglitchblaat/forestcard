// Colours that carry a meaning go through src/lib/tones.ts: no view writes a Tailwind palette
// colour of its own (bg-emerald-500, text-red-600…), and every tone exists in index.css, with its
// classes generated.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { TONES } from '../src/lib/tones.ts';

const SRC = resolve(import.meta.dirname, '..', 'src');
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8');

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const HARD_CODED = new RegExp(
  `\\b(?:bg|text|border|ring|stroke|fill|from|via|to|outline|decoration|shadow)-(?:${PALETTE})-\\d{2,3}\\b|--color-(?:${PALETTE})-\\d`,
  'g',
);

test('no view writes a palette colour of its own', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) files.push(relative(SRC, path).split(sep).join('/'));
    }
  };
  walk(SRC);
  const found = files
    .filter((f) => !f.startsWith('components/ui/'))
    .flatMap((f) =>
      [...readFileSync(join(SRC, f), 'utf8').matchAll(HARD_CODED)].map((m) => `${f}: ${m[0]}`),
    );
  expect(found).toEqual([]);
});

test('every tone has its variables and its classes in index.css', () => {
  const sources =
    /@source inline\("\{bg,border,ring\}-\{([^}]*)\}/.exec(CSS)?.[1]?.split(',') ?? [];
  for (const name of Object.keys(TONES)) {
    expect(CSS, name).toContain(`--color-${name}: var(--${name});`);
    expect(CSS, name).toContain(`--color-${name}-ink: var(--${name}-ink);`);
    expect(CSS.split(`  --${name}: `).length - 1, `${name}: a value per mode`).toBe(2);
    expect(sources, name).toContain(name);
  }
});
