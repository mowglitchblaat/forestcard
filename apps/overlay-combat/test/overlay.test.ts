// The built page (dist/combat.html) against the legacy one (legacy/combat.html):
//   - outside the engine block, the page is byte-identical: same presentation (the author's
//     constraint on combat.html?test), same scripts;
//   - the engine inlined in the page, run as the browser would (a classic script defining the
//     global `Moteur`), gives the same results as the legacy engine.
//
// `vp run test` builds first (see package.json).

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vite-plus/test';
import { compareResults } from '../../../tools/iso/src/compare.ts';
import { loadEngine } from '../../../tools/iso/src/engines.ts';
import { makeSuite, type SuiteName } from '../../../tools/iso/src/suites.ts';
import type { Engine } from '../../../tools/iso/src/types.ts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');

const LEGACY_PAGE = read('legacy', 'combat.html');
const TEMPLATE = read('apps', 'overlay-combat', 'src', 'combat.html');
const BUILT = read('apps', 'overlay-combat', 'dist', 'combat.html');

// The legacy page split around its engine block (<script> with the engine copy … </script>).
function legacyAroundEngine(): { before: string; after: string } {
  const lines = LEGACY_PAGE.split('\n');
  const start = lines.findIndex((l) => l.startsWith('/* ===== Moteur de combat (copie intégrée'));
  const end = lines.findIndex((l, i) => i > start && l === '</script>');
  expect(lines[start - 1]).toBe('<script>');
  return {
    before: lines.slice(0, start - 1).join('\n') + '\n',
    after: '\n' + lines.slice(end + 1).join('\n'),
  };
}

// The built page split around its engine script.
function builtAroundEngine(): { before: string; engine: string; after: string } {
  const open = '<script>/* ===== Moteur de combat (moteur partagé';
  const start = BUILT.indexOf(open);
  const end = BUILT.indexOf('</script>', start);
  return {
    before: BUILT.slice(0, start),
    engine: BUILT.slice(start + '<script>'.length, end),
    after: BUILT.slice(end + '</script>'.length),
  };
}

describe('combat.html', () => {
  test('the template is the legacy page with its engine block replaced by the marker', () => {
    const { before, after } = legacyAroundEngine();
    expect(TEMPLATE).toBe(before + '<script>/*@@ENGINE@@*/</script>' + after);
  });

  test('the built page is byte-identical to the legacy page outside the engine block', () => {
    const legacy = legacyAroundEngine();
    const built = builtAroundEngine();
    expect(built.before).toBe(legacy.before);
    expect(built.after).toBe(legacy.after);
  });

  describe('the engine inlined in the page matches the legacy engine', async () => {
    // Run the inlined script as a classic script, then read the global it defines.
    const window: Record<string, unknown> = {};
    runInNewContext(builtAroundEngine().engine, window);
    const pageEngine = (window['Moteur'] as { simuler: Engine }).simuler;
    const legacy = await loadEngine(join(ROOT, 'legacy', 'moteur-combat.js'));
    const cards = join(ROOT, 'docs', 'legacy', 'cartes-2026-10-19.json');

    test.each<[SuiteName, number]>([
      ['real', 1500],
      ['synthetic', 1500],
      ['decks', 500],
      ['dirty', 1500],
    ])('%s suite, %i encounters', (name, count) => {
      const suite = makeSuite(name, { cardsFile: cards, seeds: 1, count });
      for (let k = 0; k < count; k++) {
        const e = suite.encounter(k);
        const run = (engine: Engine) =>
          engine(structuredClone(e.a), structuredClone(e.b), structuredClone(e.options));
        // The page engine lives in another realm: compare through JSON, the contract anyway.
        const divergence = compareResults(run(legacy), JSON.parse(JSON.stringify(run(pageEngine))));
        expect(divergence, `${e.id}`).toBeNull();
      }
    });
  });
});
