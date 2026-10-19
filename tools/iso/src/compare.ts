// Iso comparison of two engine results.
//
// Equality is decided on the JSON form, because JSON is the contract: the edge function sends the
// result as JSON, the overlay receives JSON, and the history stores JSON. Consequences, all
// intended:
//   - key order inside an object does not matter;
//   - a property set to `undefined` is the same as an absent property;
//   - -0 and 0 are equal (JSON.stringify(-0) === '0').
// Everything else (types, values, array order, event order) must match exactly.

import { isDeepStrictEqual } from 'node:util';
import type { EngineResult, JournalEvent } from './types.ts';

export type Divergence = {
  // Index of the first differing journal event, or null when the journals match and the
  // difference is elsewhere in the result (winner, rewards, seed, rules).
  eventIndex: number | null;
  reference: unknown;
  candidate: unknown;
};

const toJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

export function compareResults(
  reference: EngineResult,
  candidate: EngineResult,
): Divergence | null {
  // Fast path: the serialized forms are usually identical byte for byte.
  const ref = JSON.stringify(reference);
  const cand = JSON.stringify(candidate);
  if (ref === cand) return null;
  const refJson = JSON.parse(ref) as unknown;
  const candJson = JSON.parse(cand) as unknown;
  if (isDeepStrictEqual(refJson, candJson)) return null;
  return locate(reference, candidate);
}

function locate(reference: EngineResult, candidate: EngineResult): Divergence {
  const refJournal: JournalEvent[] = reference.journal ?? [];
  const candJournal: JournalEvent[] = candidate.journal ?? [];
  const length = Math.max(refJournal.length, candJournal.length);
  for (let i = 0; i < length; i++) {
    const r = toJson(refJournal[i] ?? null);
    const c = toJson(candJournal[i] ?? null);
    if (!isDeepStrictEqual(r, c)) return { eventIndex: i, reference: r, candidate: c };
  }
  const { journal: _r, ...refRest } = reference;
  const { journal: _c, ...candRest } = candidate;
  return { eventIndex: null, reference: toJson(refRest), candidate: toJson(candRest) };
}
