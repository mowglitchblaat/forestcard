// The command line winrates against the page's own computation: the `wrCalc` function of
// legacy/combat.html (between `// wr:begin` and `// wr:end`) runs on the legacy engine, the port on
// the TypeScript engine, with the same configuration. Every counter must match.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compileFunction } from 'node:vm';
import { describe, expect, test } from 'vite-plus/test';
import { loadEngine } from '../../../tools/iso/src/engines.ts';
import { loadCards } from '../src/cards.ts';
import { winrates, type WinrateConfig, type WinrateResult } from '../src/winrate.ts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const PAGE = readFileSync(join(ROOT, 'legacy', 'combat.html'), 'utf8').replace(/\r\n/g, '\n');
const pools = loadCards(join(ROOT, 'docs', 'legacy', 'cartes-2026-10-19.json'));

type PageWrCalc = (cfg: WinrateConfig) => Promise<WinrateResult[]>;

async function pageWrCalc(): Promise<PageWrCalc> {
  const start = PAGE.indexOf('// wr:begin');
  const end = PAGE.indexOf('// wr:end');
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const legacy = await loadEngine(join(ROOT, 'legacy', 'moteur-combat.js'));
  // The page code as is, with the legacy engine as its global `Moteur`.
  const factory = compileFunction(`${PAGE.slice(start, end)}\nreturn wrCalc;`, ['Moteur']);
  return factory({ simuler: legacy }) as PageWrCalc;
}

// Results as plain data: the tested card by id.
const plain = (results: WinrateResult[]) =>
  results.map(({ t, ...counters }) => ({ id: t.id, ...counters }));

const base = (over: Partial<WinrateConfig>): WinrateConfig => ({
  kind: 'combattant',
  cartes: pools.cartes,
  M: pools.magies,
  Pg: pools.pieges,
  T: pools.cartes.slice(0, 2),
  mode: 'all',
  N: 4,
  checked: new Set(),
  mt: 'r',
  pt: 'r',
  mo: 'r',
  po: 'r',
  ...over,
});

const firstMagic = String(pools.magies[0]?.id);
const firstTrap = String(pools.pieges[0]?.id);

const CONFIGS: [string, WinrateConfig][] = [
  ['fighters, random equipment, all opponents', base({})],
  [
    'fighters, no equipment, same rarity',
    base({ mode: 'rar', mt: '', pt: '', mo: '', po: '', T: pools.cartes.slice(5, 8) }),
  ],
  [
    'fighters, chosen equipment, checked opponents',
    base({
      mode: 'sel',
      checked: new Set(pools.cartes.slice(0, 6).map((c) => String(c.id))),
      mt: firstMagic,
      pt: firstTrap,
      mo: 's',
      po: '',
    }),
  ],
  ['magics', base({ kind: 'magie', T: pools.magies.slice(0, 4), N: 12 })],
  ['traps', base({ kind: 'piege', T: pools.pieges.slice(0, 4), N: 12, mt: '', mo: 's', po: 'r' })],
];

describe('winrates match the page (combat.html wrCalc)', async () => {
  const page = await pageWrCalc();

  test.each(CONFIGS)('%s', async (_, cfg) => {
    expect(plain(winrates(cfg))).toEqual(plain(await page(cfg)));
  });

  test('a range of tested cards gives the same numbers as the whole run (parallel workers)', () => {
    const cfg = base({ T: pools.cartes.slice(0, 3), N: 2 });
    const whole = plain(winrates(cfg));
    const split = [...winrates(cfg, 0, 1), ...winrates(cfg, 1, 3)];
    expect(plain(split)).toEqual(whole);
  });
});
