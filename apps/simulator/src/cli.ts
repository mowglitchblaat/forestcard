// Winrate statistics from the command line, on all cores. Same numbers as the "Statistiques de
// winrate" panel of combat.html, without the animations. See apps/simulator/README.md.

import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Worker } from 'node:worker_threads';
import { loadCards } from './cards.ts';
import type { EquipmentResult, FighterResult, SimCard, WinrateConfig } from './winrate.ts';
import type { Job } from './worker.ts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

const { values } = parseArgs({
  options: {
    cards: { type: 'string', default: join(ROOT, 'docs', 'legacy', 'cartes-2026-10-19.json') },
    kind: { type: 'string', default: 'combattant' },
    test: { type: 'string', default: 'all' }, // 'all', a rarity name, or card ids separated by commas
    mode: { type: 'string', default: 'all' }, // fighters: all | rar | sel (sel: opponents = the tested cards)
    n: { type: 'string' }, // duels per opponent (fighters, default 50) or per tested card (default 500)
    mt: { type: 'string', default: 'r' }, // tested cards' magic: '' none, 'r' random, or an id
    pt: { type: 'string', default: 'r' }, // tested cards' trap
    mo: { type: 'string', default: 'r' }, // opponents' magic ('s': same as the tested cards)
    po: { type: 'string', default: 'r' }, // opponents' trap
    workers: { type: 'string', default: String(availableParallelism()) },
    json: { type: 'boolean', default: false },
  },
});

const kind = values.kind as WinrateConfig['kind'];
if (!['combattant', 'magie', 'piege'].includes(kind))
  throw new Error('--kind: combattant, magie or piege');
const mode = values.mode as WinrateConfig['mode'];
if (!['all', 'rar', 'sel'].includes(mode)) throw new Error('--mode: all, rar or sel');
const pools = loadCards(resolve(values.cards));
const list: SimCard[] =
  kind === 'combattant' ? pools.cartes : kind === 'magie' ? pools.magies : pools.pieges;
const ids = values.test.split(',').map((s) => s.trim());
const T =
  values.test === 'all'
    ? list
    : list.filter(
        (c) => ids.includes(String(c.id)) || c.rarete.toLowerCase() === values.test.toLowerCase(),
      );
if (!T.length) throw new Error(`no ${kind} matches --test ${values.test}`);
const N = Number(values.n ?? (kind === 'combattant' ? 50 : 500));
const workers = Math.max(1, Math.min(Number(values.workers), T.length));

const job: Omit<Job, 'from' | 'to'> = {
  kind,
  cartes: pools.cartes,
  M: pools.magies,
  Pg: pools.pieges,
  testedIds: T.map((c) => String(c.id)),
  mode,
  N,
  checked: new Set(mode === 'sel' ? T.map((c) => String(c.id)) : []),
  mt: values.mt,
  pt: values.pt,
  mo: values.mo,
  po: values.po,
};

const started = performance.now();
const ranges = Array.from({ length: workers }, (_, w) => [
  Math.floor((T.length * w) / workers),
  Math.floor((T.length * (w + 1)) / workers),
]);
const parts = await Promise.all(
  ranges.map(
    ([from, to]) =>
      new Promise<(Omit<FighterResult & EquipmentResult, 't'> & { id: string })[]>((ok, ko) => {
        const worker = new Worker(new URL('./worker.ts', import.meta.url), {
          workerData: { ...job, from, to },
        });
        worker.once('message', ok);
        worker.once('error', ko);
      }),
  ),
);
const results = parts
  .flat()
  .map((r) => ({ ...r, t: T.find((c) => String(c.id) === r.id) as SimCard }));
const seconds = (performance.now() - started) / 1000;

if (values.json) {
  console.log(
    JSON.stringify(
      results.map(({ t, ...r }) => ({ nom: t.nom, rarete: t.rarete, ...r })),
      null,
      2,
    ),
  );
} else {
  const pc = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
  const show = (p: number | null) => (p === null ? '—' : `${p} %`);
  const duels = results.reduce((q, r) => q + r.n, 0);
  console.log(
    `${duels.toLocaleString('fr-FR')} duels en ${seconds.toFixed(1)} s (${workers} worker(s)).`,
  );
  if (kind === 'combattant') {
    const rarities = [...new Set(pools.cartes.map((c) => c.rarete))];
    results.sort((a, b) => (pc(b.v, b.n) ?? -1) - (pc(a.v, a.n) ?? -1));
    console.log(
      [
        'Carte',
        'Rareté',
        'ATQ/PV',
        'Winrate',
        'Défaites',
        'Nuls',
        'Durée moy.',
        ...rarities.map((r) => `vs ${r}`),
      ].join('\t'),
    );
    for (const r of results)
      console.log(
        [
          r.t.nom,
          r.t.rarete,
          `${r.t.atq}/${r.t.pv}`,
          show(pc(r.v, r.n)),
          show(pc(r.d, r.n)),
          show(pc(r.x, r.n)),
          r.n ? (r.rounds / r.n).toFixed(1) : '—',
          ...rarities.map((q) => (r.par[q] ? show(pc(r.par[q].v, r.par[q].n)) : '—')),
        ].join('\t'),
      );
  } else {
    const gap = (r: (typeof results)[number]) => (pc(r.v, r.n) ?? 0) - (pc(r.v0, r.n) ?? 0);
    results.sort((a, b) => gap(b) - gap(a));
    console.log(
      ['Carte', 'Rareté', 'Winrate avec', 'Winrate sans', 'Écart', 'Nuls', 'Durée moy.'].join('\t'),
    );
    for (const r of results)
      console.log(
        [
          r.t.nom,
          r.t.rarete,
          show(pc(r.v, r.n)),
          show(pc(r.v0, r.n)),
          `${gap(r) > 0 ? '+' : ''}${gap(r)} pts`,
          show(pc(r.x, r.n)),
          (r.rounds / r.n).toFixed(1),
        ].join('\t'),
      );
  }
}
