// The built catalogue (dist/catalogue.html) against the legacy one (legacy/catalogue.html), after
// phase 4b (one wording everywhere, docs/adr/0003-le-texte-des-effets-dans-describe.md):
//   - the template is the legacy page with exactly two replacements: the description block, and the
//     sections computation of cardHTML (now one call to sectionsHTML);
//   - everywhere else the built page is byte-identical to the legacy page;
//   - every effect text and every trigger / condition line the catalogue shows is the shared text of
//     packages/describe (which the site test proves is the site's text);
//   - colours (categories) and the legend are the legacy ones.
//
// `vp run test` builds first (see package.json).

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, test } from 'vite-plus/test';
import { CATEGORY_LABELS, CATEGORY_STYLES, describeCard } from '@forestcard/describe';
import { dirtyCard } from '../../../tools/iso/src/dirty.ts';
import { generator } from '../../../tools/iso/src/random.ts';
import { syntheticCards } from '../../../tools/iso/src/synthetic.ts';
import type { Card } from '../../../tools/iso/src/types.ts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');

const LEGACY_PAGE = read('legacy', 'catalogue.html');
const TEMPLATE = read('apps', 'catalogue', 'src', 'catalogue.html');
const BUILT = read('apps', 'catalogue', 'dist', 'catalogue.html');
const BEGIN = '// ======== Description des effets (en français) ========';
const END = 'function cardHTML';
const SECS_BEGIN = " let secs='';";
const SECS_END = ' return `<div class="card';
const SECS_CALL = ' const secs=sectionsHTML(c);\n';
const BUILT_BEGIN =
  '// ======== Description des effets : générée par apps/catalogue (ne pas modifier ici) ========';
const BUILT_END = 'const { COL, esc, sectionsHTML } = CatalogueDescribe;';

// The legacy page with its sections computation replaced by the call (the page part of phase 4b).
const withSectionsCall = (page: string) =>
  page.slice(0, page.indexOf(SECS_BEGIN)) + SECS_CALL + page.slice(page.indexOf(SECS_END));

type Api = {
  COL: Record<string, string>;
  esc: (s: unknown) => string;
  sectionsHTML: (c: unknown) => string;
};

function builtApi(): Api {
  const a = BUILT.indexOf(BUILT_BEGIN);
  const b = BUILT.indexOf(BUILT_END) + BUILT_END.length;
  return runInContext(
    `(function(){\n${BUILT.slice(a, b)}\nreturn {COL,esc,sectionsHTML};})()`,
    createContext({}),
  ) as Api;
}

// Legacy legend and colour of each effect type.
function legacyLegend(): { COL: Record<string, string>; catOf: (t: unknown) => string } {
  const a = LEGACY_PAGE.indexOf(BEGIN);
  const b = LEGACY_PAGE.indexOf(END);
  return runInContext(
    `(function(){\n${LEGACY_PAGE.slice(a, b)}\nreturn {COL,catOf};})()`,
    createContext({}),
  ) as never;
}

const unescape = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

// What a reader sees in the rendered sections: trigger / condition lines, and each effect line with
// its colour category.
function rendered(html: string) {
  return {
    metas: [...html.matchAll(/<div class="cond">(.*?)<\/div>/g)].map((m) =>
      unescape(m[1] as string),
    ),
    items: [...html.matchAll(/<span class="ch c-([a-z]+)">(.*?)<\/span>/g)].map((m) => ({
      category: m[1] as string,
      text: unescape(m[2] as string),
    })),
  };
}

function cards(): Card[] {
  const real = JSON.parse(read('docs', 'legacy', 'cartes-2026-10-19.json')) as Card[];
  const all = [...real, ...syntheticCards()];
  const next = generator(0xca7a1);
  return [...all, ...[...all, ...all, ...all].map((c) => dirtyCard(next, c))];
}

describe('catalogue.html', () => {
  test('the template is the legacy page with the description block and the sections computation replaced', () => {
    const a = LEGACY_PAGE.indexOf(BEGIN);
    const b = LEGACY_PAGE.indexOf(END);
    expect(TEMPLATE).toBe(
      withSectionsCall(LEGACY_PAGE.slice(0, a) + '/*@@DESCRIBE@@*/\n' + LEGACY_PAGE.slice(b)),
    );
  });

  test('the built page is byte-identical to the legacy page everywhere else', () => {
    const a = LEGACY_PAGE.indexOf(BEGIN);
    const b = LEGACY_PAGE.indexOf(END);
    const x = BUILT.indexOf(BUILT_BEGIN);
    const y = BUILT.indexOf(BUILT_END) + BUILT_END.length;
    expect(BUILT.slice(0, x)).toBe(LEGACY_PAGE.slice(0, a));
    expect(BUILT.slice(y)).toBe('\n' + withSectionsCall(LEGACY_PAGE.slice(b)));
  });

  test('every text the catalogue shows is the shared text, with the legacy colours', () => {
    const page = builtApi();
    const legend = legacyLegend();
    const all = cards();
    let lines = 0;
    for (const card of all) {
      const shown = rendered(page.sectionsHTML(card));
      const sections = describeCard(card as never);
      const expectedItems = sections.flatMap((s) => s.items);
      expect(
        shown.items.map((i) => i.text),
        card.nom,
      ).toEqual(expectedItems.map((i) => i.text));
      expect(
        shown.items.map((i) => i.category),
        card.nom,
      ).toEqual(expectedItems.map((i) => legend.catOf(i.type)));
      expect(shown.metas, card.nom).toEqual(
        sections.flatMap((s) => (s.meta === undefined ? [] : [s.meta])),
      );
      lines += shown.items.length;
    }
    expect(lines).toBeGreaterThan(1000);
  });

  test('the legend and the HTML escaping are the legacy ones', () => {
    const page = builtApi();
    expect(JSON.parse(JSON.stringify(page.COL))).toEqual(
      JSON.parse(JSON.stringify(legacyLegend().COL)),
    );
    expect(page.esc('<b>"x"</b> & y')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; y');
  });

  test('the shared category colours are the legacy CSS ones, one per legend category', () => {
    const css = [...LEGACY_PAGE.matchAll(/\.c-([a-z]+)\{([^}]*)\}/g)].map(([, name, body]) => [
      name as string,
      Object.fromEntries(
        (body as string)
          .split(';')
          .filter(Boolean)
          .map((p) => p.split(/:(.*)/s).slice(0, 2) as [string, string]),
      ),
    ]);
    expect(CATEGORY_STYLES).toEqual(Object.fromEntries(css));
    expect(Object.keys(CATEGORY_STYLES).sort()).toEqual(Object.keys(CATEGORY_LABELS).sort());
  });
});
