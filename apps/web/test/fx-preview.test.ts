// The effect preview page is the combat overlay page, untouched, plus the preview block before
// </body>; every animation the rules page asks for exists in the preview.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { buildPreview, HERE, OVERLAY, previewBlock } from '../fx-preview/build.ts';
import { RULE_EFFECTS } from '../src/views/encyclopedia/content.ts';

const overlay = readFileSync(OVERLAY, 'utf8');

test('the overlay page is kept byte for byte, the preview block added before </body>', () => {
  const page = buildPreview(overlay);
  expect(page.replace(previewBlock(), '')).toBe(overlay);
  expect(page.indexOf(previewBlock())).toBe(overlay.indexOf('</body>'));
});

test('every preview the rules page uses is an animation of the preview', () => {
  const js = readFileSync(join(HERE, 'preview.js'), 'utf8');
  const available = new Set([...js.matchAll(/^ {4}([a-z_]+): \{/gm)].map((m) => m[1]));
  const used = RULE_EFFECTS.flatMap((e) => (e.preview ? [e.preview] : []));
  expect(used.length).toBeGreaterThan(15);
  expect(used.filter((k) => !available.has(k))).toEqual([]);
});

test('where an effect lands is the same in the rules and in the animation', () => {
  const js = readFileSync(join(HERE, 'preview.js'), 'utf8');
  const on = Object.fromEntries(
    [...js.matchAll(/^ {4}([a-z_]+): \{\s*on: '([a-z]+)'/gm)].map((m) => [m[1], m[2]]),
  );
  for (const e of RULE_EFFECTS.filter((x) => x.preview))
    expect(on[e.preview as string], e.label).toBe(e.target);
});
