// Validates the iso run itself: a harness that cannot see a broken engine would validate a broken
// rewrite. Each mutant is the legacy engine with one deliberate change; the run must catch every
// behavioural mutant, and must stay silent on the control mutant whose change is invisible in JSON.
//
//   node tools/iso/src/mutants.ts [--budget 200000]

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runIso } from './iso.ts';
import type { SuiteName } from './suites.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LEGACY_ENGINE = join(ROOT, 'legacy', 'moteur-combat.js');
const CARDS = join(ROOT, 'docs', 'legacy', 'cartes-2026-10-19.json');

type Mutant = {
  name: string;
  why: string;
  find: string;
  replace: string;
  expect: 'caught' | 'silent';
};

const MUTANTS: Mutant[] = [
  {
    name: 'rng-short-circuit',
    why: 'dodge roll evaluated before its guard: one extra RNG draw whenever dodge is 0',
    find: 'if(ech>0&&roll(ech))',
    replace: 'if(roll(ech)&&ech>0)',
    expect: 'caught',
  },
  {
    name: 'over-without-flush',
    why: 'over() stops flushing pending revives and deferred effects',
    find: 'const over=()=>{flush();return S.some(s=>s.pv<=0)};',
    replace: 'const over=()=>{return S.some(s=>s.pv<=0)};',
    expect: 'caught',
  },
  {
    name: 'text',
    why: 'one word changed in the direct damage line',
    find: 'subit ${n} dégâts directs',
    replace: 'subit ${n} dégât directs',
    expect: 'caught',
  },
  {
    name: 'overtime-count',
    // Mutates the loop, not the setting: `reg.maxProlong??3` is dead code (reg always holds
    // REG.maxProlong), and changing REG would be caught through result.regles, not through the
    // combat itself.
    why: 'two overtimes instead of three: only visible in long combats',
    find: 'if(over()||manche>=MAXP)break;',
    replace: 'if(over()||manche>=MAXP-1)break;',
    expect: 'caught',
  },
  {
    name: 'trap-chain-depth',
    why: 'trap chains limited to 4 instead of 3: only visible when traps trigger each other',
    find: 'if(PCH>=3)return;',
    replace: 'if(PCH>=4)return;',
    expect: 'caught',
  },
  {
    name: 'text-coercion',
    why: 'dodge chances summed as numbers: differs only when a chance is stored as text',
    // The attack's dodge (esquiver(), for breaths and missiles, sums the same way: its own line).
    find: 'reduce((q,p)=>q+(p.chance||0),0)+d.st.esqb);if(ech>0',
    replace: 'reduce((q,p)=>q+(+p.chance||0),0)+d.st.esqb);if(ech>0',
    expect: 'caught',
  },
  {
    name: 'control-key-order',
    why: 'same journal events with a different key order: identical JSON contract',
    find: 'J.push({t,txt,...o,tour,pv:S.map(s=>s.pv)',
    replace: 'J.push({tour,t,txt,...o,pv:S.map(s=>s.pv)',
    expect: 'silent',
  },
];

const SUITES: SuiteName[] = ['real', 'synthetic', 'decks', 'dirty'];

const { values } = parseArgs({ options: { budget: { type: 'string', default: '200000' } } });
const budget = Number(values.budget);

const source = readFileSync(LEGACY_ENGINE, 'utf8');
const workDir = mkdtempSync(join(tmpdir(), 'forestcard-mutants-'));
let failures = 0;

for (const mutant of MUTANTS) {
  const occurrences = source.split(mutant.find).length - 1;
  if (occurrences !== 1)
    throw new Error(`mutant ${mutant.name}: pattern found ${occurrences} times, expected once`);
  const path = join(workDir, `${mutant.name}.js`);
  writeFileSync(path, source.replace(mutant.find, mutant.replace));

  let caughtBy: string | null = null;
  for (const suite of SUITES) {
    const report = await runIso({
      suite,
      suiteOptions: { cardsFile: CARDS, seeds: 1, count: budget },
      referencePath: LEGACY_ENGINE,
      candidatePath: path,
      collectStats: false,
      from: 0,
      to: budget,
      workers: availableParallelism(),
      chunkSize: 1000,
    });
    if (report.failure) {
      caughtBy = `${suite}:${report.failure.k} (${report.failure.outcome.kind})`;
      break;
    }
  }
  const ok = mutant.expect === 'caught' ? caughtBy !== null : caughtBy === null;
  if (!ok) failures += 1;
  const verdict = caughtBy
    ? `caught by ${caughtBy}`
    : `not caught in ${budget} encounters per suite`;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${mutant.name.padEnd(20)} expected ${mutant.expect.padEnd(6)} -> ${verdict}`,
  );
  console.log(`      ${mutant.why}`);
}

console.log(
  failures === 0
    ? '\nHarness validated: every mutant behaved as expected.'
    : `\n${failures} mutant(s) did not behave as expected.`,
);
process.exitCode = failures === 0 ? 0 : 1;
