// Contamination (Eau), Vaporisation and Weakness (rework of October 2026).
//
// Contamination is a status amplifier: on the contaminated card, every negative status lasts one
// turn more. When it arrives, the statuses already there gain a turn; while it runs, each new one is
// laid with a turn more. Laid again, it prolongs again (one more turn for those there), and its own
// duration is the longest. It does not prolong the stun, the weakness, nor itself. It is a negative
// status: purified, taken by a mist, removed by a molt.
//
// Vaporisation (Eau + Feu): as soon as a burn and a contamination are both on a card, the burn is
// spent, the contamination stays, and the card is left weak. No direct damage. A burn laid on a
// frozen card only melts the ice (mechanics/dot.ts): no vaporisation then.
//
// Weakness (faiblesse): the card takes X % more damage for X of its turns (level table: faiblesse,
// faiblesseTours). Laid again, its longest duration stays. Not purified, not prolonged by the
// contamination; a molt removes it.
//
// Laid by: an effect (contamination), an attack (passive or attack effect contamination).

import { emit, id, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { mistTakes } from './mist.ts';

export type Contamination = { turns: number };
export type Weakness = { pct: number; turns: number };

// Its part of a card's status (combat/state.ts).
export type ContaminationState = {
  contamination: Contamination | null;
  weakness: Weakness | null;
};
export const contaminationState = (): ContaminationState => ({
  contamination: null,
  weakness: null,
});

// The turn a negative status laid on s gains (1 while it is contaminated).
export const contaminationExtra = (s: Side): number => (s.status.contamination ? 1 : 0);

// Every negative status it prolongs gains one turn; returns how many were prolonged.
function prolong(s: Side): number {
  const z = s.status;
  let n = 0;
  const more = (x: { turns: number }) => {
    x.turns++;
    n++;
  };
  z.dots.forEach(more);
  z.bleeds.forEach(more);
  z.curses.forEach(more);
  z.fatigues.forEach(more);
  z.fractures.forEach(more);
  z.frosts.forEach(more);
  z.rootings.forEach(more);
  return n;
}

export function contaminate(c: Combat, d: Side, turnsIn: number): void {
  if (mistTakes(c, d, 'contamination', (t) => contaminate(c, t, turnsIn))) return;
  const turns = Math.max(1, turnsIn);
  const prolonged = prolong(d);
  const now = d.status.contamination;
  if (now) now.turns = Math.max(now.turns, turns);
  else d.status.contamination = { turns };
  emit(c, {
    type: 'contaminated',
    side: id(c, d),
    stacked: !!now,
    turns: (d.status.contamination as Contamination).turns,
    prolonged,
  });
  vaporize(c, d);
}

// A burn and a contamination on the same card: the burn is spent, the card is left weak.
export function vaporize(c: Combat, s: Side): void {
  if (!s.status.contamination || s.hp <= 0) return;
  if (!s.status.dots.some((z) => z.kind === 'brûlure')) return;
  s.status.dots = s.status.dots.filter((z) => z.kind !== 'brûlure');
  emit(c, { type: 'vaporized', side: id(c, s) });
  emit(c, { type: 'statusEnded', side: id(c, s), status: 'burn' });
  weaken(c, s);
}

export function weaken(c: Combat, s: Side): void {
  const pct = c.levels.faiblesse;
  const turns = Math.max(1, c.levels.faiblesseTours);
  const now = s.status.weakness;
  if (now) {
    now.pct = Math.max(now.pct, pct);
    now.turns = Math.max(now.turns, turns);
  } else s.status.weakness = { pct, turns };
  const w = s.status.weakness as Weakness;
  emit(c, { type: 'weakened', side: id(c, s), stacked: !!now, pct: w.pct, turns: w.turns });
}

// Damage taken by a weak card.
export const weakened = (s: Side, n: number): number =>
  s.status.weakness ? round((n * (100 + s.status.weakness.pct)) / 100) : n;

// End of its turn: the contamination and the weakness count down.
export function contaminationEnd(c: Combat, s: Side): Flow {
  const z = s.status;
  if (z.contamination && --z.contamination.turns <= 0) {
    z.contamination = null;
    emit(c, { type: 'statusEnded', side: id(c, s), status: 'contamination' });
  }
  if (z.weakness && --z.weakness.turns <= 0) {
    z.weakness = null;
    emit(c, { type: 'statusEnded', side: id(c, s), status: 'weakness' });
  }
  return undefined;
}

const turnsOf = (e: EffectData): number => +(e.tours as number) || 2;

export function contaminationEffect({ c, e, statusTarget }: EffectContext): void {
  contaminate(c, statusTarget(), turnsOf(e));
}

export function contaminationOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) contaminate(c, d, turnsOf(q));
}

// Its effects (the registry of effects.ts).
export const effects = {
  contamination: { run: contaminationEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
