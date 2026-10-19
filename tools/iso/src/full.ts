// The full iso run, the proof that closes phase 2 (tools/iso/README.md, "La preuve"): the four
// suites one after the other, against the TypeScript engine + journal projection.
//
//   vp run iso:full                     all cores
//   vp run iso:full --workers 1         one core (about 34 h for the real suite)
//
// Always resumable: each suite records how far it got in tools/iso/.out/full-<suite>-seeds<S>-<code>.json,
// and a new run starts from there. <code> fingerprints the engines, the harness and the cards: after
// any change, the run starts over. Stop it any time (Ctrl+C, reboot) and run the same command again. The first
// divergence stops the run; the report is tools/iso/.out/full-report.md.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fingerprint } from './fingerprint.ts';
import { runIso } from './iso.ts';
import { makeSuite, type SuiteName, type SuiteOptions } from './suites.ts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const OUT = join(ROOT, 'tools', 'iso', '.out');
const CARDS = join(ROOT, 'docs', 'legacy', 'cartes-2026-10-19.json');
const REFERENCE = join(ROOT, 'legacy', 'moteur-combat.js');
const CANDIDATE = join(ROOT, 'packages', 'journal', 'src', 'index.ts');

const { values } = parseArgs({
  options: {
    workers: { type: 'string', default: String(availableParallelism()) },
    seeds: { type: 'string', default: '1' },
  },
});
const workers = Math.max(1, Number(values.workers));
const seeds = Math.max(1, Number(values.seeds));

// Order: the cheap suites first, so a divergence in a rare branch shows up within the hour.
const PLAN: { suite: SuiteName; count: number }[] = [
  { suite: 'synthetic', count: 5_000_000 },
  { suite: 'dirty', count: 5_000_000 },
  { suite: 'decks', count: 2_000_000 },
  { suite: 'real', count: 0 },
];

type Result = {
  suite: SuiteName;
  total: number;
  status: 'passed' | 'diverged';
  seconds: number;
  detail?: string;
};

mkdirSync(OUT, { recursive: true });
// Checkpoints are only resumed by the same code and cards (fingerprint.ts).
const code = fingerprint(REFERENCE, CARDS);
const results: Result[] = [];
const started = new Date();
const hours = (s: number) => `${(s / 3600).toFixed(2)} h`;

for (const { suite, count } of PLAN) {
  const suiteOptions: SuiteOptions = { cardsFile: CARDS, seeds, count };
  const total = makeSuite(suite, suiteOptions).total;
  const checkpoint = join(OUT, `full-${suite}-seeds${seeds}-${code}.json`);
  const saved = existsSync(checkpoint)
    ? (JSON.parse(readFileSync(checkpoint, 'utf8')) as { watermark: number; seconds: number })
    : null;
  const from = saved?.watermark ?? 0;
  const secondsBefore = saved?.seconds ?? 0;
  console.log(
    `\n== ${suite}: ${total.toLocaleString('en-US')} encounters, resuming at ${from.toLocaleString('en-US')}, ${workers} worker(s)`,
  );
  if (from >= total) {
    results.push({ suite, total, status: 'passed', seconds: secondsBefore });
    console.log('   already passed');
    continue;
  }
  const report = await runIso(
    {
      suite,
      suiteOptions,
      referencePath: REFERENCE,
      candidatePath: CANDIDATE,
      collectStats: false,
      from,
      to: total,
      workers,
      chunkSize: 2000,
    },
    ({ checked, watermark, elapsedSeconds }) => {
      writeFileSync(
        checkpoint,
        JSON.stringify({ watermark, seconds: secondsBefore + elapsedSeconds }),
      );
      const rate = checked / elapsedSeconds;
      const eta = (total - from - checked) / rate;
      console.log(
        `   ${watermark.toLocaleString('en-US')} / ${total.toLocaleString('en-US')}  ${Math.round(rate).toLocaleString('en-US')} enc/s  ETA ${hours(eta)}`,
      );
    },
  );
  writeFileSync(
    checkpoint,
    JSON.stringify({ watermark: report.watermark, seconds: secondsBefore + report.seconds }),
  );
  if (report.failure) {
    const detail = JSON.stringify(report.failure, null, 2);
    writeFileSync(join(OUT, `full-failure-${suite}-${report.failure.k}.json`), detail);
    results.push({
      suite,
      total,
      status: 'diverged',
      seconds: secondsBefore + report.seconds,
      detail: `${suite}:${report.failure.k}`,
    });
    console.log(`   DIVERGENCE at ${suite}:${report.failure.k}`);
    break;
  }
  results.push({ suite, total, status: 'passed', seconds: secondsBefore + report.seconds });
  console.log(`   passed`);
}

const passed = results.length === PLAN.length && results.every((r) => r.status === 'passed');
const lines = [
  "# Run d'iso complet",
  '',
  `Candidat : \`packages/journal\` (moteur TS + projection du journal). Référence : \`legacy/moteur-combat.js\`. Seeds par rencontre réelle : ${seeds}. Workers : ${workers}. Empreinte du code et des cartes : \`${code}\`. Dernière exécution commencée le ${started.toISOString()}.`,
  '',
  '| Suite | Rencontres | Résultat | Durée cumulée |',
  '|---|---|---|---|',
  ...results.map(
    (r) =>
      `| ${r.suite} | ${r.total.toLocaleString('fr-FR')} | ${r.status === 'passed' ? '0 divergence' : `divergence (${r.detail})`} | ${hours(r.seconds)} |`,
  ),
  '',
  passed
    ? '**Iso prouvée : aucune divergence sur les quatre suites.**'
    : results.some((r) => r.status === 'diverged')
      ? '**Divergence : voir le fichier full-failure-*.json et rejouer avec `vp run iso --replay`.**'
      : 'Run incomplet.',
  '',
];
writeFileSync(join(OUT, 'full-report.md'), lines.join('\n'));
console.log(`\n${passed ? 'ISO PROVEN' : 'NOT PROVEN'}: tools/iso/.out/full-report.md`);
process.exitCode = passed ? 0 : 1;
