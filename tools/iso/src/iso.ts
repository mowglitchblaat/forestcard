// Orchestrates an iso run over one suite: a pool of workers pulls chunks of encounter indexes, the
// first divergence stops everything, and a checkpoint records how far the run got.
//
// The checkpoint is the contiguous prefix [from, watermark) of completed indexes: chunks finish out
// of order, so the watermark only advances over chunks whose predecessors are all done.

import { Worker } from 'node:worker_threads';
import type { Outcome } from './encounter.ts';
import type { ChunkReply, ChunkRequest, WorkerConfig } from './worker.ts';

export type IsoConfig = WorkerConfig & {
  from: number;
  to: number; // exclusive
  workers: number;
  chunkSize: number;
};

export type IsoReport = {
  checked: number;
  watermark: number; // every index in [from, watermark) was checked and matched
  failure: { k: number; outcome: Outcome } | null;
  stats: Record<string, number> | null;
  seconds: number;
};

export type Progress = { checked: number; watermark: number; elapsedSeconds: number };

export function runIso(config: IsoConfig, onProgress?: (p: Progress) => void): Promise<IsoReport> {
  const { from, to, chunkSize } = config;
  const startedAt = performance.now();
  const workerConfig: WorkerConfig = {
    suite: config.suite,
    suiteOptions: config.suiteOptions,
    referencePath: config.referencePath,
    candidatePath: config.candidatePath,
    collectStats: config.collectStats,
  };

  let nextStart = from;
  let checked = 0;
  let watermark = from;
  const finished = new Map<number, number>(); // chunk start -> chunk end, waiting for the watermark
  const stats: Record<string, number> | null = config.collectStats ? {} : null;
  let failure: IsoReport['failure'] = null;

  const workerCount = Math.max(1, Math.min(config.workers, Math.ceil((to - from) / chunkSize)));
  const pool: Worker[] = [];

  return new Promise<IsoReport>((resolvePromise, rejectPromise) => {
    let settled = false;
    let active = 0;
    const timer = onProgress
      ? setInterval(
          () =>
            onProgress({
              checked,
              watermark,
              elapsedSeconds: (performance.now() - startedAt) / 1000,
            }),
          5000,
        )
      : null;

    const settle = (error: Error | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearInterval(timer);
      for (const worker of pool) void worker.terminate();
      if (error) rejectPromise(error);
      else
        resolvePromise({
          checked,
          watermark,
          failure,
          stats,
          seconds: (performance.now() - startedAt) / 1000,
        });
    };

    const dispatch = (worker: Worker) => {
      if (failure || nextStart >= to) {
        active -= 1;
        if (active === 0) settle(null);
        return;
      }
      const request: ChunkRequest = { start: nextStart, end: Math.min(to, nextStart + chunkSize) };
      nextStart = request.end;
      worker.postMessage(request);
    };

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(new URL('./worker.ts', import.meta.url), {
        workerData: workerConfig,
      });
      pool.push(worker);
      active += 1;
      worker.on('error', (error) => settle(error));
      worker.on('message', (reply: ChunkReply) => {
        checked += reply.checked;
        if (stats && reply.stats)
          for (const [key, n] of Object.entries(reply.stats)) stats[key] = (stats[key] ?? 0) + n;
        if (reply.failure) {
          // Keep the smallest failing index: it is the one a re-run from `from` hits first.
          if (!failure || reply.failure.k < failure.k) failure = reply.failure;
        } else {
          finished.set(reply.start, reply.end);
          let end = finished.get(watermark);
          while (end !== undefined) {
            finished.delete(watermark);
            watermark = end;
            end = finished.get(watermark);
          }
        }
        dispatch(worker);
      });
      dispatch(worker);
    }
  });
}
