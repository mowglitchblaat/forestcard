// "Dirty" card data, as the author reports it exists in the database (2026-10-17): numbers stored
// as text ("50"), empty strings, nulls, passives stored as an array. The engine never validates its
// input, so these values flow into JavaScript coercions (`||`, `+x`, parseInt, and `+` which
// concatenates with a string). The dirty suite checks that the rewrite reproduces them exactly.

import type { Card } from './types.ts';

type Value = unknown;

// Probabilities applied to every numeric field, independently.
const AS_TEXT = 0.25;
const AS_EMPTY = 0.08;
const AS_NULL = 0.05;
// Base stats (atq, pv) are corrupted less often: as text they turn later additions into
// concatenations, which the engine must still reproduce.
const STAT_AS_TEXT = 0.1;
// A passive { briques: [...] } stored as a bare array.
const PASSIVE_AS_ARRAY = 0.15;

const NEVER_TOUCHED = new Set(['id', 'type', 'nom', 'vide']);

function corruptNumber(next: () => number, value: number): Value {
  const r = next();
  if (r < AS_TEXT) return String(value);
  if (r < AS_TEXT + AS_EMPTY) return '';
  if (r < AS_TEXT + AS_EMPTY + AS_NULL) return null;
  return value;
}

function corrupt(next: () => number, value: Value): Value {
  if (Array.isArray(value)) return value.map((item) => corrupt(next, item));
  if (value === null || typeof value !== 'object')
    return typeof value === 'number' ? corruptNumber(next, value) : value;
  const out: Record<string, Value> = {};
  for (const [key, field] of Object.entries(value))
    out[key] = NEVER_TOUCHED.has(key) ? field : corrupt(next, field);
  return out;
}

export function dirtyCard(next: () => number, card: Card): Card {
  const { atq, pv, passif, ...rest } = card;
  const dirty = corrupt(next, rest) as Card;
  if (atq !== undefined)
    dirty.atq = typeof atq === 'number' && next() < STAT_AS_TEXT ? String(atq) : atq;
  if (pv !== undefined)
    dirty.pv = typeof pv === 'number' && next() < STAT_AS_TEXT ? String(pv) : pv;
  if (passif !== undefined) {
    const p = corrupt(next, passif) as { briques?: unknown } | null;
    dirty.passif = p && Array.isArray(p.briques) && next() < PASSIVE_AS_ARRAY ? p.briques : p;
  }
  return dirty;
}
