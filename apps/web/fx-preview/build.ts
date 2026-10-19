// Builds dist/fx-preview.html: the combat overlay page (apps/overlay-combat/src/combat.html, the
// author's code with its engine left out: effects do not need it) plus the preview block
// (preview.css, preview.js) before </body>. Nothing of the overlay is changed (test/fx-preview.test.ts).
// Run after `vp build` (see package.json).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const HERE = import.meta.dirname;
export const OVERLAY = join(HERE, '..', '..', 'overlay-combat', 'src', 'combat.html');

export function previewBlock(): string {
  const css = readFileSync(join(HERE, 'preview.css'), 'utf8');
  const js = readFileSync(join(HERE, 'preview.js'), 'utf8');
  if (/<\/(script|style)/i.test(css + js)) throw new Error('the preview block cannot be inlined');
  return `<style>\n${css}</style>\n<script>\n${js}</script>\n`;
}

export function buildPreview(overlay: string): string {
  if (overlay.split('</body>').length !== 2) throw new Error('combat.html must have one </body>');
  return overlay.replace('</body>', () => previewBlock() + '</body>');
}

if (import.meta.main) {
  writeFileSync(
    join(HERE, '..', 'dist', 'fx-preview.html'),
    buildPreview(readFileSync(OVERLAY, 'utf8')),
  );
  console.log('dist/fx-preview.html written');
}
