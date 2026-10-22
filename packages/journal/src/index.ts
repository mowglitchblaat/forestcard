// Legacy combat journal, rebuilt from the engine's domain events.
//
//   simuler(pA, pB, { seed, regles }) -> { seed, regles, gagnant, recompenses, journal }
//
// Same signature and same result as the legacy `Moteur.simuler`: the edge function, the overlay and
// the history keep consuming the journal they know.

import {
  simulate,
  simulateRelay,
  type OnEvent,
  type Player,
  type SimulateOptions,
} from '@forestcard/engine';
import { project, type JournalLine } from './project.ts';

export { project, type JournalLine } from './project.ts';

export function createJournal(): { journal: JournalLine[]; onEvent: OnEvent } {
  const journal: JournalLine[] = [];
  const onEvent: OnEvent = (event, view) => {
    const line = project(event, view);
    if (line) journal.push(line);
  };
  return { journal, onEvent };
}

export function simuler(pA: Player, pB: Player, opt: SimulateOptions = {}) {
  const { journal, onEvent } = createJournal();
  const result = simulate(pA, pB, opt, onEvent);
  return { ...result, journal };
}

// Relay combat (championship): same result and journal shape, plus `relais` lines.
export function simulerRelais(pA: Player, pB: Player, opt: SimulateOptions = {}) {
  const { journal, onEvent } = createJournal();
  const result = simulateRelay(pA, pB, opt, onEvent);
  return { ...result, journal };
}
