// The engine classes domain events into trigger facts (packages/engine/src/mechanics/triggers.ts,
// TRIGGER_FACT); the legacy engine classes journal lines (trig, in L()). The classification is copied
// knowledge, so it is checked here directly: for every event of every encounter, the engine's fact
// equals the legacy classifier applied to the line the event projects to. The iso run would only see
// a wrong entry when a deck reacts to it; this test points at the event itself.

import { resolve, join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { simulate } from '../../../packages/engine/src/index.ts';
import type { Player as EnginePlayer } from '../../../packages/engine/src/index.ts';
import { triggerFact, type TriggerFact } from '../../../packages/engine/src/mechanics/triggers.ts';
import { project } from '../../../packages/journal/src/project.ts';
import { makeSuite, type SuiteName } from './suites.ts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CARDS = join(ROOT, 'docs', 'legacy', 'cartes-2026-10-19.json');

type LegacyFact = { t: string; who: unknown; n?: number };

// legacy/moteur-combat.js, trig(), as is: the line → fact part.
const NEGK = new Set([
  'brulure',
  'poison',
  'saignement',
  'malediction',
  'gel',
  'fatigue',
  'etourdi',
  'fracture',
]);
function legacyTrig(t: string, o: Record<string, unknown>, txt: string): LegacyFact | null {
  let ev: LegacyFact | null = null;
  if (t === 'statut' && NEGK.has(o['k'] as string)) ev = { t: 'st', who: o['c'] };
  else if (t === 'esquive') ev = { t: 'esq', who: o['c'] };
  else if (
    t === 'degats' &&
    (o['n'] as number) > 0 &&
    !['brûlure', 'brulure', 'poison', 'saignement'].includes(o['k'] as string)
  )
    ev = { t: 'coup', who: o['c'], n: o['n'] as number };
  else if (t === 'piege' && !o['k']) ev = { t: 'piege', who: o['c'] };
  else if (t === 'tour')
    ev = { t: 'tour', who: o['c'], n: parseInt(String(txt).replace(/\D+/g, ''), 10) || 0 };
  else if (t === 'bloque') ev = { t: 'bloque', who: o['c'] };
  else if (t === 'soin') ev = { t: 'soin2', who: o['c'] };
  else if (t === 'ultime') ev = { t: 'ult', who: o['c'] };
  else if (t === 'attaque' && !o['k']) ev = { t: 'atk', who: o['c'] };
  return ev;
}

const LEGACY_NAME: Record<TriggerFact['kind'], string> = {
  status: 'st',
  dodge: 'esq',
  hit: 'coup',
  trap: 'piege',
  turn: 'tour',
  block: 'bloque',
  heal: 'soin2',
  ultimate: 'ult',
  attack: 'atk',
};
const asLegacy = (f: TriggerFact | null): LegacyFact | null =>
  !f
    ? null
    : f.kind === 'hit'
      ? { t: 'coup', who: f.who, n: f.amount }
      : f.kind === 'turn'
        ? { t: 'tour', who: f.who, n: f.turn }
        : { t: LEGACY_NAME[f.kind], who: f.who };

const SUITES: [SuiteName, number][] = [
  ['real', 1500],
  ['synthetic', 3000],
  ['decks', 1000],
  ['dirty', 1500],
];

test.each(SUITES)('%s suite: TRIGGER_FACT = the legacy trig, event by event', (name, count) => {
  const suite = makeSuite(name, { cardsFile: CARDS, seeds: 1, count });
  const seen = new Set<string>();
  let mismatches: string[] = [];
  for (let k = 0; k < Math.min(count, suite.total); k++) {
    const { a, b, options } = suite.encounter(k);
    try {
      simulate(a as EnginePlayer, b as EnginePlayer, options, (event, view) => {
        const line = project(event, view);
        const expected = line ? legacyTrig(line.t, line, line.txt) : null;
        const actual = asLegacy(triggerFact(event));
        if (expected) seen.add(expected.t);
        if (JSON.stringify(actual) !== JSON.stringify(expected))
          mismatches.push(`${event.type}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
      });
    } catch {
      // Dirty inputs may throw (same error as the legacy engine): no events to check after that.
    }
    if (mismatches.length > 20) break;
  }
  mismatches = [...new Set(mismatches)];
  expect(mismatches).toEqual([]);
  // The suite produced facts of every kind it can: guards against a run that checks nothing.
  expect(seen.size).toBeGreaterThan(5);
});
