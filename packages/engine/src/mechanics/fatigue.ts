// Fatigue: the affected card's ATQ drops right away, given back when it ends or is purified. One per
// card: reapplied, its DURATION adds up but its intensity does not (the strongest stays). It counts
// the affected card's turns. A rage ends in a fatigue (rage.ts).
//
// Laid by: an effect (fatigue), an attack (passive or attack effect fatigue), the end of a rage.

import { emit, id, raw, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData, Num } from '../model/card.ts';

// lost: attack actually removed, given back when the fatigue ends or is purified.
export type Fatigue = { amount: number; lost: number; turns: number };

// Its part of a card's status (combat/state.ts).
export type FatigueState = {
  fatigues: Fatigue[];
};
export const fatigueState = (): FatigueState => ({ fatigues: [] });

export function fatigue(
  c: Combat,
  d: Side,
  value: Num,
  unit: string | undefined,
  turnsIn: Num,
  afterRage?: boolean,
): void {
  const v = Math.max(0, unit === 'pct' ? round((d.atq * raw(value)) / 100) : +raw(value) || 0);
  const turns = Math.max(1, parseInt(String(turnsIn), 10) || 1);
  let current = d.status.fatigues[0];
  const stacked = !!current;
  let lost = 0;
  if (current) {
    current.turns += turns;
    if (v > current.amount) {
      lost = Math.min(v - current.amount, d.atq);
      current.amount = v;
      current.lost += lost;
    }
  } else {
    lost = Math.min(v, d.atq);
    current = { amount: v, lost, turns };
    d.status.fatigues.push(current);
  }
  d.atq -= lost;
  emit(c, {
    type: 'fatigueApplied',
    side: id(c, d),
    stacked,
    amount: current.amount,
    turns: current.turns,
    afterRage: !!afterRage,
  });
  if (lost > 0)
    emit(c, { type: 'statChanged', side: id(c, d), stat: 'atq', delta: -lost, cause: 'fatigue' });
}

// End of its turn: the ATQ comes back when the fatigue ends. Before the rage: the fatigue following
// a rage starts on the next turn.
export function fatiguesEnd(c: Combat, s: Side): Flow {
  s.status.fatigues = s.status.fatigues.filter((f) => {
    if (--f.turns > 0) return true;
    emit(c, { type: 'statusEnded', side: id(c, s), status: 'fatigue' });
    if (f.lost > 0) {
      s.atq += f.lost;
      emit(c, {
        type: 'statChanged',
        side: id(c, s),
        stat: 'atq',
        delta: f.lost,
        cause: 'fatigueEnded',
      });
    }
    return false;
  });
  return undefined;
}

// A magic's fatigue: undone with what it took, back to the fatigue that was there before.
export function fatigueEffect({ c, e, statusTarget, onUndo, statusEnds }: EffectContext): void {
  const M = statusTarget();
  const before = M.status.fatigues[0] && { ...M.status.fatigues[0] };
  const atqBefore = M.atq;
  fatigue(c, M, e.fatval || 0, e.u, e.fattours || 1);
  const lost = atqBefore - M.atq;
  onUndo(() => {
    const f = M.status.fatigues[0];
    if (!f) return;
    const back = Math.min(lost, f.lost);
    M.atq += back;
    if (back > 0)
      emit(c, {
        type: 'statChanged',
        side: id(c, M),
        stat: 'atq',
        delta: back,
        cause: 'fatigueRemoved',
      });
    if (!before) {
      M.status.fatigues = [];
      statusEnds(M, 'fatigue');
    } else {
      f.amount = before.amount;
      f.turns = before.turns;
      f.lost = Math.max(0, f.lost - lost);
    }
  });
}

export function fatigueOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) fatigue(c, d, q.fatval || 0, q.u, q.fattours || 1);
}

// Its effects (the registry of effects.ts).
export const effects = {
  fatigue: { run: fatigueEffect },
} satisfies EffectRules;
