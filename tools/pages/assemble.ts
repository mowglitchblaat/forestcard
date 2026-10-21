// Assembles the GitHub Pages site into _site/, with the same URLs as the upstream site served from
// its repository root: the OBS sources, the image mirror (MIROIR_URL) and the page links keep
// working unchanged.
//
//   vp run -r build && node tools/pages/assemble.ts
//
// Fails if a served file is missing (a page not built, a folder moved), instead of publishing a
// site with a hole in it. Run by .github/workflows/pages.yml.

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const OUT = join(ROOT, '_site');

// Served URL (relative to the site root) → source in the repository.
const FILES: [url: string, source: string][] = [
  ['index.html', 'apps/site/dist/index.html'],
  ['combat.html', 'apps/overlay-combat/dist/combat.html'],
  ['catalogue.html', 'apps/catalogue/dist/catalogue.html'],
  ['overlay.html', 'apps/overlay-boosters/src/overlay.html'],
  // The card workshop: the admin's card composer, for testing a card without the admin.
  ['atelier.html', 'apps/site/dist/atelier.html'],
  ['patchnotes.json', 'apps/site/public/patchnotes.json'],
  ['cadres', 'assets/cadres'],
  // The edge function's single file, to paste in the Supabase dashboard (apps/edge/README.md): built
  // and tested by the workflow, so a change made without any install (tools/node-only) still ends
  // as a file ready to paste. It holds no secret: everything comes from Deno.env.
  ['edge/swift-responder.ts', 'apps/edge/dist/swift-responder.ts'],
  // The React site (apps/web), on trial next to the author's page until it replaces it: at the root,
  // so its relative URLs (img/, cadres/, patchnotes.json, catalogue.html) reach the same files.
  ['nouveau.html', 'apps/web/dist/index.html'],
  ['assets', 'apps/web/dist/assets'],
  ['fx-preview.html', 'apps/web/dist/fx-preview.html'],
  ['favicon.svg', 'apps/web/dist/favicon.svg'],
];
// Written by the nightly image copy (.github/workflows/images.yml): absent from a fresh clone of
// this repository, so optional here.
const OPTIONAL: [url: string, source: string][] = [['img', 'assets/img']];

const missing = FILES.filter(([, source]) => !existsSync(join(ROOT, source)));
if (missing.length)
  throw new Error(
    `cannot assemble the site, missing: ${missing.map(([, s]) => s).join(', ')} (build first)`,
  );

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const [url, source] of [...FILES, ...OPTIONAL]) {
  if (!existsSync(join(ROOT, source))) {
    console.log(`skipped ${url} (no ${source})`);
    continue;
  }
  cpSync(join(ROOT, source), join(OUT, url), { recursive: true });
  console.log(`${url} <- ${source}`);
}
