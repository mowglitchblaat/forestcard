// Builds dist/catalogue.html: the page template (src/catalogue.html) with the effect descriptions
// inlined in place of the legacy description block, then the names the rest of the page uses,
// declared at the same spot. Run after `vp pack` (see package.json).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = import.meta.dirname;
const MARKER = '/*@@DESCRIBE@@*/';
// Names declared by the legacy description block and used by the rest of the page.
const EXPORTED = ['COL', 'esc', 'sectionsHTML'];

const bundleDir = join(HERE, 'dist', '.describe');
const bundles = readdirSync(bundleDir).filter((f) => f.endsWith('.js'));
if (bundles.length !== 1)
  throw new Error(`expected one bundle in ${bundleDir}, found: ${bundles.join(', ')}`);
const bundle = readFileSync(join(bundleDir, bundles[0] as string), 'utf8');
if (/<\/script/i.test(bundle))
  throw new Error('the bundle contains "</script": it cannot be inlined');

const template = readFileSync(join(HERE, 'src', 'catalogue.html'), 'utf8');
if (template.split(MARKER).length !== 2)
  throw new Error(`src/catalogue.html must contain ${MARKER} exactly once`);

const block = [
  '// ======== Description des effets : générée par apps/catalogue (ne pas modifier ici) ========',
  bundle.trimEnd(),
  `const { ${EXPORTED.join(', ')} } = CatalogueDescribe;`,
].join('\n');
writeFileSync(
  join(HERE, 'dist', 'catalogue.html'),
  template.replace(MARKER, () => block),
);
console.log('dist/catalogue.html written');
