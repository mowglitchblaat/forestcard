// Worker thread of the iso run: runs a range of encounters on the reference and candidate engines
// and reports the first divergence. Each worker owns its own engine instances.

import { parentPort, workerData } from 'node:worker_threads';
import { runEncounter, type Outcome } from './encounter.ts';
import { loadEngine } from './engines.ts';
import { makeSuite, type SuiteName, type SuiteOptions } from './suites.ts';
import type { Engine } from './types.ts';

export type WorkerConfig = {
  suite: SuiteName;
  suiteOptions: SuiteOptions;
  referencePath: string;
  candidatePath: string | null; // null: benchmark, the reference runs alone
  collectStats: boolean;
};

export type ChunkRequest = { start: number; end: number };

export type ChunkReply = {
  start: number;
  end: number;
  checked: number;
  failure: { k: number; outcome: Outcome } | null;
  stats: Record<string, number> | null;
};

const config = workerData as WorkerConfig;
const suite = makeSuite(config.suite, config.suiteOptions);
const reference: Engine = await loadEngine(config.referencePath);
const candidate: Engine | null =
  config.candidatePath === null ? null : await loadEngine(config.candidatePath);

parentPort?.on('message', ({ start, end }: ChunkRequest) => {
  const stats: Record<string, number> | null = config.collectStats ? {} : null;
  let checked = 0;
  for (let k = start; k < end; k++) {
    const outcome = runEncounter(suite.encounter(k), reference, candidate, stats);
    checked += 1;
    if (outcome.kind !== 'same') {
      parentPort?.postMessage({
        start,
        end,
        checked,
        failure: { k, outcome },
        stats,
      } satisfies ChunkReply);
      return;
    }
  }
  parentPort?.postMessage({ start, end, checked, failure: null, stats } satisfies ChunkReply);
});
