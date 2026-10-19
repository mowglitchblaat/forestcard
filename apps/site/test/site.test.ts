// The built site page (dist/index.html) against the legacy one (legacy/index.html):
//   - outside the effect description block (FX-BEGIN … FX-END) and the admin editor's lists (P, PAS,
//     ULT, MAG, CON), the page is byte-identical;
//   - the editor's lists shipped in the page are the legacy ones, key order included (the order of
//     the options);
//   - the description code shipped in the page and the legacy FX block, run in the same kind of
//     context, give the same text, or throw the same error, for every passive, effect, ultimate,
//     trap condition and card: real, synthetic and dirty.
//
// `vp run test` builds first (see package.json).

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, test } from 'vite-plus/test';
import { dirtyCard } from '../../../tools/iso/src/dirty.ts';
import { generator } from '../../../tools/iso/src/random.ts';
import { syntheticCards } from '../../../tools/iso/src/synthetic.ts';
import type { Card } from '../../../tools/iso/src/types.ts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');

const LEGACY_PAGE = read('legacy', 'index.html');
const TEMPLATE = read('apps', 'site', 'src', 'index.html');
const BUILT = read('apps', 'site', 'dist', 'index.html');
const BEGIN = '/* FX-BEGIN */';
const END = '/* FX-END */';
const BUILT_BEGIN =
  '/* FX: descriptions des effets, générées par apps/site (ne pas modifier ici) */';
const BUILT_END = 'const { nz, fxPassif, fxEffet, fxCond, fxTrigUlt, lignesCarte } = SiteDescribe;';
const EDITOR_BEGIN = 'const P={';
const EDITOR_END = '\nlet editId=';
const BUILT_EDITOR = 'const { P, PAS, ULT, MAG, CON } = SiteDescribe;';
const EDITOR_NAMES = ['P', 'PAS', 'ULT', 'MAG', 'CON'] as const;

// The legacy page cut around its two replaced regions.
function legacyParts() {
  const a = LEGACY_PAGE.indexOf(BEGIN);
  const b = LEGACY_PAGE.indexOf(END) + END.length;
  const c = LEGACY_PAGE.indexOf(EDITOR_BEGIN);
  const d = LEGACY_PAGE.indexOf(EDITOR_END, c);
  return {
    beforeFx: LEGACY_PAGE.slice(0, a),
    between: LEGACY_PAGE.slice(b, c),
    editor: LEGACY_PAGE.slice(c, d),
    after: LEGACY_PAGE.slice(d),
  };
}

// The editor's lists of the legacy page, as the page defines them.
function legacyEditor(): Record<string, unknown> {
  return runInContext(
    `(function(){\n${legacyParts().editor}\nreturn {${EDITOR_NAMES.join(',')}};})()`,
    createContext({}),
  ) as Record<string, unknown>;
}

type Api = {
  nz: (v: unknown) => number;
  fxPassif: (p: unknown) => string;
  fxEffet: (e: unknown) => string[];
  fxCond: (c: unknown) => string;
  fxTrigUlt: (u: unknown) => string;
  lignesCarte: (c: unknown) => unknown[];
};

// The legacy FX block, plus avTxt which it uses (defined elsewhere in the page).
function legacyApi(globals: object): Api {
  const a = LEGACY_PAGE.indexOf(BEGIN);
  const b = LEGACY_PAGE.indexOf(END) + END.length;
  const avStart = LEGACY_PAGE.indexOf('const avTxt=');
  const avEnd = LEGACY_PAGE.indexOf('`};', avStart) + 3;
  const block = LEGACY_PAGE.slice(a, b);
  const code = `(function(){\n${LEGACY_PAGE.slice(avStart, avEnd)}\n${block}\nreturn {nz,fxPassif,fxEffet,fxCond,fxTrigUlt,lignesCarte};})()`;
  return runInContext(code, createContext({ ...globals })) as Api;
}

// The description code as shipped in dist/index.html, and the editor's lists it carries.
function builtApi(): Api & { editor: Record<string, unknown> } {
  const a = BUILT.indexOf(BUILT_BEGIN);
  const b = BUILT.indexOf(BUILT_END) + BUILT_END.length;
  const code = `(function(){\n${BUILT.slice(a, b)}\n${BUILT_EDITOR}\nreturn {nz,fxPassif,fxEffet,fxCond,fxTrigUlt,lignesCarte,editor:{${EDITOR_NAMES.join(',')}}};})()`;
  return runInContext(code, createContext({})) as Api & { editor: Record<string, unknown> };
}

// Every input worth describing: cards and their parts.
function inputs(): { label: string; call: (api: Api) => unknown }[] {
  const real = JSON.parse(read('docs', 'legacy', 'cartes-2026-10-19.json')) as Card[];
  const synthetic = syntheticCards();
  const next = generator(0x5174e);
  const cards = [...real, ...synthetic];
  const dirty = [...cards, ...cards, ...cards].map((c) => dirtyCard(next, c));
  const all = [...cards, ...dirty];
  const list: { label: string; call: (api: Api) => unknown }[] = [];
  const bricks = (x: unknown): unknown[] => {
    const v = x as { briques?: unknown[] } | null;
    return !v
      ? []
      : Array.isArray(v.briques)
        ? v.briques
        : Array.isArray(x)
          ? (x as unknown[])
          : [x];
  };
  all.forEach((card, i) => {
    const tag = `${i}:${card.nom}`;
    list.push({ label: `lignesCarte ${tag}`, call: (api) => api.lignesCarte(card) });
    for (const p of bricks(card['passif']))
      list.push({ label: `fxPassif ${tag}`, call: (api) => api.fxPassif(p) });
    const u = card['ultime'];
    if (u) {
      list.push({ label: `fxEffet ultime ${tag}`, call: (api) => api.fxEffet(u) });
      list.push({ label: `fxTrigUlt ${tag}`, call: (api) => api.fxTrigUlt(u) });
    }
    const e = card['effet'] as { condition?: unknown; effet?: unknown } | null | undefined;
    if (e) {
      list.push({ label: `fxEffet ${tag}`, call: (api) => api.fxEffet(e) });
      if (card.type === 'piege') {
        list.push({ label: `fxCond ${tag}`, call: (api) => api.fxCond(e.condition) });
        list.push({ label: `fxEffet payload ${tag}`, call: (api) => api.fxEffet(e.effet) });
      }
    }
  });
  for (const v of [0, 1, -3, '7', '', null, undefined, 'abc', '4.5', true])
    list.push({ label: `nz ${String(v)}`, call: (api) => api.nz(v) });
  // Effects and conditions no card carries: unknown types, admin texts, empty values.
  const extra: unknown[] = [
    null,
    {},
    { type: 'perso_bouclier_magique' },
    { type: 'perso_cri_de_guerre', val: 3 },
    { type: 'perso_gagne_x_pv_quand_il_attaque', val: 3 },
    { type: 'atk_inconnu', chance: 40 },
    { type: 'type_inconnu' },
    { briques: [null, { type: 'degats', val: 5 }] },
    // Keys of the other kind: their text comes from the editor's lists.
    { type: 'esquive', chance: 20 },
    { type: 'atq_mod', val: 10 },
    { type: 'equiper', carte: 'magie' },
    { type: 'constructor' },
  ];
  extra.forEach((x, i) => {
    list.push({ label: `fxEffet extra ${i}`, call: (api) => api.fxEffet(x) });
    if (x) list.push({ label: `fxPassif extra ${i}`, call: (api) => api.fxPassif(x) });
  });
  for (const c of [
    null,
    {},
    { type: 'perso_condition' },
    { type: 'inconnue' },
    { type: 'constructor' },
    { type: 'adv_attaque', coups: '3' },
  ])
    list.push({ label: `fxCond ${JSON.stringify(c)}`, call: (api) => api.fxCond(c) });
  return list;
}

// Outcome as JSON: the two implementations live in other realms.
function outcome(call: () => unknown): unknown {
  try {
    return { ok: JSON.parse(JSON.stringify(call() ?? null)) };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

describe('index.html', () => {
  test('the template is the legacy page with its FX block and editor lists replaced by markers', () => {
    const p = legacyParts();
    expect(TEMPLATE).toBe(p.beforeFx + '/*@@DESCRIBE@@*/' + p.between + '/*@@EDITOR@@*/' + p.after);
  });

  test('the built page is byte-identical to the legacy page outside the two regions', () => {
    const p = legacyParts();
    const x = BUILT.indexOf(BUILT_BEGIN);
    const y = BUILT.indexOf(BUILT_END) + BUILT_END.length;
    const z = BUILT.indexOf(BUILT_EDITOR, y);
    expect(z).toBeGreaterThan(y);
    expect(BUILT.slice(0, x)).toBe(p.beforeFx);
    expect(BUILT.slice(y, z)).toBe(p.between);
    expect(BUILT.slice(z + BUILT_EDITOR.length)).toBe(p.after);
  });

  test("the editor's lists are the legacy ones, key order included", () => {
    const legacy = legacyEditor();
    const built = builtApi().editor;
    for (const name of EDITOR_NAMES)
      expect(JSON.stringify(built[name]), name).toBe(JSON.stringify(legacy[name]));
  });

  // In the page the fallback reads the editor's lists, which always exist: the legacy block runs with
  // the legacy page's own lists.
  describe('descriptions match the legacy FX block', () => {
    const globals = legacyEditor();
    const legacy = legacyApi(globals);
    const built = builtApi();
    const cases = inputs();

    test(`${cases.length} inputs: same text or same error as the legacy block`, () => {
      for (const { label, call } of cases)
        expect(
          outcome(() => call(built)),
          label,
        ).toEqual(outcome(() => call(legacy)));
    });
  });
});
