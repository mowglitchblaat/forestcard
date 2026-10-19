// Worker thread: computes the winrates of a range of tested cards.

import { parentPort, workerData } from 'node:worker_threads';
import { winrates, type SimCard, type WinrateConfig } from './winrate.ts';

export type Job = Omit<WinrateConfig, 'T'> & { testedIds: string[]; from: number; to: number };

const job = workerData as Job;
// Tested cards must be the very objects of the pools: the computation compares cards by identity.
const pool: SimCard[] =
  job.kind === 'combattant' ? job.cartes : job.kind === 'magie' ? job.M : job.Pg;
const T = job.testedIds.map((id) => pool.find((c) => String(c.id) === id) as SimCard);
const results = winrates({ ...job, T }, job.from, job.to);
parentPort?.postMessage(results.map(({ t, ...counters }) => ({ id: String(t.id), ...counters })));
