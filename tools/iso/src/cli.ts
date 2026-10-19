// Iso run command line. See tools/iso/README.md for usage.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { runEncounter } from './encounter.ts';
import { loadEngine } from './engines.ts';
import { fingerprint } from './fingerprint.ts';
import { runIso, type IsoConfig, type IsoReport } from './iso.ts';
import { makeSuite, type SuiteName, type SuiteOptions } from './suites.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = join(ROOT, 'tools', 'iso', '.out');
const LEGACY_ENGINE = join(ROOT, 'legacy', 'moteur-combat.js');
const DEFAULT_CARDS = join(ROOT, 'docs', 'legacy', 'cartes-2026-10-19.json');

const { values } = parseArgs({
  options: {
    suite: { type: 'string', default: 'real' },
    candidate: { type: 'string' },
    reference: { type: 'string', default: LEGACY_ENGINE },
    cards: { type: 'string', default: DEFAULT_CARDS },
    seeds: { type: 'string', default: '1' },
    count: { type: 'string', default: '1000000' },
    from: { type: 'string' },
    limit: { type: 'string' },
    workers: { type: 'string', default: String(availableParallelism()) },
    chunk: { type: 'string', default: '2000' },
    bench: { type: 'boolean', default: false },
    stats: { type: 'boolean', default: false },
    resume: { type: 'boolean', default: false },
    replay: { type: 'string' },
  },
});

const int = (name: string, raw: string | undefined): number => {
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error(`--${name} must be a non-negative integer, got ${raw}`);
  return n;
};

const suiteName = values.suite as SuiteName;
if (!['real', 'synthetic', 'decks', 'dirty'].includes(suiteName))
  throw new Error(`unknown suite ${suiteName}`);
const suiteOptions: SuiteOptions = {
  cardsFile: resolve(values.cards),
  seeds: int('seeds', values.seeds),
  count: int('count', values.count),
};
const referencePath = resolve(values.reference);
const candidatePath = values.bench ? null : resolve(values.candidate ?? LEGACY_ENGINE);
const suite = makeSuite(suiteName, suiteOptions);

// Identifies a run configuration, so a checkpoint is never resumed with other settings.
const runKey = [
  suiteName,
  suiteOptions.seeds,
  suiteOptions.count,
  referencePath,
  candidatePath ?? 'bench',
  fingerprint(referencePath, suiteOptions.cardsFile),
]
  .join('|')
  .replace(/[^a-zA-Z0-9]+/g, '_')
  .slice(-120);
const checkpointFile = join(OUT, `checkpoint-${runKey}.json`);

if (values.replay !== undefined) {
  await replay(int('replay', values.replay));
} else {
  await main();
}

async function main(): Promise<void> {
  let from = values.from === undefined ? 0 : int('from', values.from);
  if (values.resume && existsSync(checkpointFile)) {
    from = (JSON.parse(readFileSync(checkpointFile, 'utf8')) as { watermark: number }).watermark;
    console.log(`Resuming from checkpoint: k = ${from}`);
  }
  const to =
    values.limit === undefined
      ? suite.total
      : Math.min(suite.total, from + int('limit', values.limit));
  const config: IsoConfig = {
    suite: suiteName,
    suiteOptions,
    referencePath,
    candidatePath,
    collectStats: values.stats,
    from,
    to,
    workers: int('workers', values.workers),
    chunkSize: Math.max(1, int('chunk', values.chunk)),
  };
  console.log(`Suite ${suiteName}: encounters [${from}, ${to}) of ${suite.total}`);
  console.log(`Reference ${referencePath}`);
  console.log(candidatePath ? `Candidate ${candidatePath}` : 'Benchmark: reference only');
  console.log(`Workers ${config.workers}, chunk ${config.chunkSize}`);

  mkdirSync(OUT, { recursive: true });
  const report = await runIso(config, ({ checked, watermark, elapsedSeconds }) => {
    const rate = checked / elapsedSeconds;
    const eta = (to - from - checked) / rate;
    console.log(
      `  ${checked.toLocaleString('en-US')} checked, ${Math.round(rate).toLocaleString('en-US')} enc/s, ETA ${formatDuration(eta)}`,
    );
    writeFileSync(checkpointFile, JSON.stringify({ watermark }));
  });
  writeFileSync(checkpointFile, JSON.stringify({ watermark: report.watermark }));
  summarize(report, from, to);
}

function summarize(report: IsoReport, from: number, to: number): void {
  const rate = report.checked / report.seconds;
  const combatsPerEncounter = candidatePath ? 2 : 1;
  console.log(
    `\nChecked ${report.checked.toLocaleString('en-US')} encounters in ${formatDuration(report.seconds)}`,
  );
  console.log(
    `  ${Math.round(rate).toLocaleString('en-US')} encounters/s, ${Math.round(rate * combatsPerEncounter).toLocaleString('en-US')} combats/s`,
  );
  if (report.stats) {
    const lines = Object.entries(report.stats).sort(([a], [b]) => a.localeCompare(b));
    console.log('\nStats (reference engine):');
    for (const [key, n] of lines) console.log(`  ${key.padEnd(40)} ${n}`);
  }
  if (!report.failure) {
    console.log(
      report.watermark >= to
        ? `\nNO DIVERGENCE on [${from}, ${to}).`
        : `\nStopped at ${report.watermark}.`,
    );
    return;
  }
  const file = join(OUT, `failure-${suiteName}-${report.failure.k}.json`);
  writeFileSync(file, JSON.stringify(report.failure, null, 2));
  const { outcome } = report.failure;
  console.log(`\n${outcome.kind.toUpperCase()} at ${suiteName}:${report.failure.k}`);
  if (outcome.kind === 'divergence') {
    console.log(
      `  first differing event: ${outcome.divergence.eventIndex ?? '(outside the journal)'}`,
    );
    console.log(`  reference: ${JSON.stringify(outcome.divergence.reference)}`);
    console.log(`  candidate: ${JSON.stringify(outcome.divergence.candidate)}`);
  } else if (outcome.kind === 'error') {
    console.log(`  reference: ${outcome.reference ?? 'ok'}`);
    console.log(`  candidate: ${outcome.candidate ?? 'ok'}`);
  }
  console.log(`  details: ${file}`);
  console.log(
    `  replay:  vp run iso --suite ${suiteName} --replay ${report.failure.k} (same --seeds/--count/--candidate)`,
  );
  process.exitCode = 1;
}

// Runs one encounter in this process and writes both full results, for debugging a divergence.
async function replay(k: number): Promise<void> {
  const encounter = suite.encounter(k);
  const reference = await loadEngine(referencePath);
  const candidate = await loadEngine(candidatePath ?? referencePath);
  const outcome = runEncounter(encounter, reference, candidate, null);
  const results = {
    encounter,
    outcome: outcome.kind,
    reference: reference(
      structuredClone(encounter.a),
      structuredClone(encounter.b),
      structuredClone(encounter.options),
    ),
    candidate: candidate(
      structuredClone(encounter.a),
      structuredClone(encounter.b),
      structuredClone(encounter.options),
    ),
  };
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `replay-${suiteName}-${k}.json`);
  writeFileSync(file, JSON.stringify(results, null, 2));
  console.log(`${encounter.id}: ${outcome.kind}. Full results: ${file}`);
  if (outcome.kind !== 'same') process.exitCode = 1;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '?';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0
    ? `${h}h${String(m).padStart(2, '0')}`
    : m > 0
      ? `${m}m${String(s % 60).padStart(2, '0')}s`
      : `${s}s`;
}
