// Curse: the affected card's ATQ drops at the start of its turn, BEFORE its attack; each loss comes
// back "curse duration" turns later, one by one in arrival order. One per card; reapplied, the
// amounts add up and the duration restarts. A purification gives the lost ATQ back.
//
// Laid by: an effect (malediction), an attack (passive or attack effect malediction).

import { emit, id, over, roll, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';

export type CurseReturn = { amount: number; turns: number };
export type Curse = { amount: number; turns: number; duration: number };

// Its part of a card's status (combat/state.ts).
export type CurseState = {
  atqLostToCurses: number; // given back on purification (legacy: cl)
  curseReturns: CurseReturn[];
  curses: Curse[];
};
export const curseState = (): CurseState => ({ atqLostToCurses: 0, curseReturns: [], curses: [] });

export function curse(c: Combat, dst: Side, amount: number, turns: number): void {
  let current = dst.status.curses[0];
  const stacked = !!current;
  if (current) {
    current.amount += amount;
    current.turns = Math.max(current.turns, turns);
    current.duration = Math.max(current.duration || 0, turns);
  } else {
    current = { amount, turns, duration: turns };
    dst.status.curses.push(current);
  }
  emit(c, {
    type: 'curseApplied',
    side: id(c, dst),
    stacked,
    amount: current.amount,
    turns: current.turns,
  });
}

export function tickCurse(c: Combat, s: Side, curseStatus: Curse): void {
  const loss = Math.min(curseStatus.amount, s.atq);
  s.atq -= loss;
  s.status.atqLostToCurses += loss;
  if (loss > 0) {
    s.status.curseReturns.push({ amount: loss, turns: curseStatus.duration || 1 });
    emit(c, { type: 'statChanged', side: id(c, s), stat: 'atq', delta: -loss, cause: 'curseTick' });
  }
  if (!s.status.curses.includes(curseStatus) || s.hp <= 0) return;
  if (--curseStatus.turns > 0) return;
  s.status.curses = s.status.curses.filter((z) => z !== curseStatus);
  emit(c, { type: 'statusEnded', side: id(c, s), status: 'curse' });
}

// Start of its turn: the losses due back come back.
export function curseFading(c: Combat, s: Side): Flow {
  let back = 0;
  s.status.curseReturns = s.status.curseReturns.filter((r) => {
    if (--r.turns > 0) return true;
    back += r.amount;
    return false;
  });
  back = Math.min(back, s.status.atqLostToCurses);
  if (back > 0) {
    s.atq += back;
    s.status.atqLostToCurses -= back;
    emit(c, {
      type: 'statChanged',
      side: id(c, s),
      stat: 'atq',
      delta: back,
      cause: 'curseFading',
    });
  }
  return undefined;
}

// Start of its turn: ATQ drops before the attack.
export function curseTicks(c: Combat, s: Side): Flow {
  for (const curseStatus of s.status.curses.slice()) {
    if (s.hp <= 0 || over(c)) return 'stop';
    if (!s.status.curses.includes(curseStatus)) continue;
    tickCurse(c, s, curseStatus);
  }
  if (s.hp <= 0) return 'stop';
  return undefined;
}

export function curseEffect({ c, e, statusTarget }: EffectContext): void {
  curse(c, statusTarget(), e.val || 0, e.tours || 1);
}

export function curseOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) curse(c, d, q.val || 0, q.tours || 1);
}

// Its effects (the registry of effects.ts).
export const effects = {
  malediction: { run: curseEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
