// Runs one encounter on both engines and classifies the outcome.
//
// Each engine receives its own deep copy of the input, so neither can influence the other by
// mutating cards. An engine that throws is part of the observed behaviour: the outcome is "same"
// only if both engines throw the same message.

import { compareResults, type Divergence } from './compare.ts';
import type { Encounter, Engine, EngineResult } from './types.ts';

export type Outcome =
  | { kind: 'same' }
  | { kind: 'divergence'; encounter: Encounter; divergence: Divergence }
  | { kind: 'error'; encounter: Encounter; reference: string | null; candidate: string | null };

type Run = { result: EngineResult; error: null } | { result: null; error: string };

function run(engine: Engine, encounter: Encounter): Run {
  try {
    const result = engine(
      structuredClone(encounter.a),
      structuredClone(encounter.b),
      structuredClone(encounter.options),
    );
    return { result, error: null };
  } catch (error) {
    return {
      result: null,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

export function runEncounter(
  encounter: Encounter,
  reference: Engine,
  candidate: Engine | null,
  stats: Record<string, number> | null,
): Outcome {
  const ref = run(reference, encounter);
  if (stats && ref.result) collect(stats, ref.result);
  if (!candidate) {
    return ref.error === null
      ? { kind: 'same' }
      : { kind: 'error', encounter, reference: ref.error, candidate: null };
  }
  const cand = run(candidate, encounter);
  if (ref.result && cand.result) {
    const divergence = compareResults(ref.result, cand.result);
    return divergence ? { kind: 'divergence', encounter, divergence } : { kind: 'same' };
  }
  if (ref.error !== null && ref.error === cand.error) return { kind: 'same' };
  return { kind: 'error', encounter, reference: ref.error, candidate: cand.error };
}

// Coverage proxy: how often each journal event kind (t:k) occurs, plus outcome counters.
function collect(stats: Record<string, number>, result: EngineResult): void {
  const bump = (key: string) => {
    stats[key] = (stats[key] ?? 0) + 1;
  };
  for (const event of result.journal)
    bump(`event ${event.t}${event.k === undefined ? '' : `:${String(event.k)}`}`);
  bump(`winner ${result.gagnant === null ? 'draw' : result.gagnant}`);
}
