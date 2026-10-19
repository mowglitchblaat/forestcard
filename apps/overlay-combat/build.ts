// Builds dist/combat.html: the page template (src/combat.html) with the shared engine inlined in
// place of the legacy engine copy, so the page still works alone, as one file.
// Run after `vp pack` (see package.json), which builds the engine as a classic script.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = import.meta.dirname;
const MARKER = '/*@@ENGINE@@*/';

const engineDir = join(HERE, 'dist', '.engine');
const bundles = readdirSync(engineDir).filter((f) => f.endsWith('.js'));
if (bundles.length !== 1)
  throw new Error(`expected one engine bundle in ${engineDir}, found: ${bundles.join(', ')}`);
const engine = readFileSync(join(engineDir, bundles[0] as string), 'utf8');
// Inlined inside <script>…</script>: the bundle must not close the tag itself.
if (/<\/script/i.test(engine))
  throw new Error('the engine bundle contains "</script": it cannot be inlined');

const template = readFileSync(join(HERE, 'src', 'combat.html'), 'utf8');
if (template.split(MARKER).length !== 2)
  throw new Error(`src/combat.html must contain ${MARKER} exactly once`);

const banner =
  '/* ===== Moteur de combat (moteur partagé, généré par apps/overlay-combat : ne pas modifier ici) ===== */\n';
writeFileSync(
  join(HERE, 'dist', 'combat.html'),
  template.replace(MARKER, () => banner + engine),
);
console.log('dist/combat.html written');
