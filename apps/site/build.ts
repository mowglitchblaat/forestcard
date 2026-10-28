// Builds dist/index.html: the page template (src/index.html) with the effect descriptions inlined in
// place of the legacy FX block, then the names the rest of the page uses, declared at the same spot.
// The admin editor's lists are declared again where the legacy page declared them.
// Run after `vp pack` (see package.json).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = import.meta.dirname;
const MARKER = '/*@@DESCRIBE@@*/';
const EDITOR_MARKER = '/*@@EDITOR@@*/';
// The card composer (src/composeur.js), shared by the admin and the workshop page (atelier.html).
const COMPOSER_MARKER = '/*@@COMPOSEUR@@*/';
// Names declared by the legacy FX block and used by the rest of the page.
const EXPORTED = [
  'nz',
  'fxPassif',
  'fxEffet',
  'fxCond',
  'fxTrigUlt',
  'lignesCarte',
  'lignesEcriteau',
  'COULEURS_CAT',
  'LIBELLES_CAT',
  'NIVEAUX_DEFAUT',
];
// Names of the admin editor's lists in the legacy page.
const EDITOR = ['P', 'PAS', 'ULT', 'MAG', 'CON'];

const bundleDir = join(HERE, 'dist', '.describe');
const bundles = readdirSync(bundleDir).filter((f) => f.endsWith('.js'));
if (bundles.length !== 1)
  throw new Error(`expected one bundle in ${bundleDir}, found: ${bundles.join(', ')}`);
const bundle = readFileSync(join(bundleDir, bundles[0] as string), 'utf8');
if (/<\/script/i.test(bundle))
  throw new Error('the bundle contains "</script": it cannot be inlined');

const template = readFileSync(join(HERE, 'src', 'index.html'), 'utf8');
for (const marker of [MARKER, EDITOR_MARKER, COMPOSER_MARKER])
  if (template.split(marker).length !== 2)
    throw new Error(`src/index.html must contain ${marker} exactly once`);
const composer = readFileSync(join(HERE, 'src', 'composeur.js'), 'utf8');
if (/<\/script/i.test(composer))
  throw new Error('composeur.js contains "</script": it cannot be inlined');

const block = [
  '/* FX: descriptions des effets, générées par apps/site (ne pas modifier ici) */',
  bundle.trimEnd(),
  `const { ${EXPORTED.join(', ')} } = SiteDescribe;`,
].join('\n');
writeFileSync(
  join(HERE, 'dist', 'index.html'),
  template
    .replace(MARKER, () => block)
    .replace(EDITOR_MARKER, () => `const { ${EDITOR.join(', ')} } = SiteDescribe;`)
    .replace(COMPOSER_MARKER, () => composer),
);
console.log('dist/index.html written');

// The workshop page: the same composer, for testing a card without the admin.
const workshop = readFileSync(join(HERE, 'src', 'atelier.html'), 'utf8');
for (const marker of [MARKER, COMPOSER_MARKER])
  if (workshop.split(marker).length !== 2)
    throw new Error(`src/atelier.html must contain ${marker} exactly once`);
writeFileSync(
  join(HERE, 'dist', 'atelier.html'),
  workshop.replace(MARKER, () => block).replace(COMPOSER_MARKER, () => composer),
);
console.log('dist/atelier.html written');
