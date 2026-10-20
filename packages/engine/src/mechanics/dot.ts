// Burn and poison (damage over time). Ticks at the end of the affected card's turn, right after its
// attack: "t turns" = t ticks in total, counted on its turns. One of each kind per card, same
// intensity on every tick; reapplied, intensities add up and the duration restarts.
//
// Laid by: an effect (poison_effet, brulure_effet), an attack (passive or attack effect brulure,
// poison).

import { damage } from '../combat/damage.ts';
import { emit, id, opponent, over, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { statusDamageMarks } from './execution.ts';

// kind is the legacy label, printed as is in the journal: 'poison' or 'brûlure'.
export type DamageOverTime = { kind: string; amount: number; turns: number };

// Its part of a card's status (combat/state.ts).
export type DotState = {
  dots: DamageOverTime[]; // burn and poison
};
export const dotState = (): DotState => ({ dots: [] });

// kind: 'poison' or 'brûlure' (the legacy label, kept as is).
export function damageOverTime(
  c: Combat,
  M: Side,
  kind: string,
  amount: number,
  turns: number,
): void {
  let current = M.status.dots.find((z) => z.kind === kind);
  const stacked = !!current;
  if (current) {
    current.amount += amount;
    current.turns = Math.max(current.turns, turns);
  } else {
    current = { kind, amount, turns };
    M.status.dots.push(current);
  }
  emit(c, {
    type: 'dotApplied',
    side: id(c, M),
    kind: kind === 'poison' ? 'poison' : 'burn',
    stacked,
  });
}

export function tickDot(c: Combat, s: Side, dot: DamageOverTime): void {
  const n = damage(c, opponent(c, s), s, dot.amount);
  emit(c, {
    type: 'damaged',
    side: id(c, s),
    amount: n,
    cause: dot.kind === 'poison' ? 'poison' : 'burn',
  });
  statusDamageMarks(c, s, dot.kind === 'poison' ? 'poison' : 'brulure');
  if (!s.status.dots.includes(dot) || s.hp <= 0) return; // purified or dead during the tick: nothing more
  if (--dot.turns > 0) return;
  s.status.dots = s.status.dots.filter((z) => z !== dot);
  emit(c, {
    type: 'statusEnded',
    side: id(c, s),
    status: dot.kind === 'poison' ? 'poison' : 'burn',
  });
}

// End of its turn: burn and poison in application order.
export function dotTicks(c: Combat, s: Side): Flow {
  for (const dot of s.status.dots.slice()) {
    if (s.hp <= 0 || over(c)) return 'stop';
    if (!s.status.dots.includes(dot)) continue;
    tickDot(c, s, dot);
  }
  return undefined;
}

export function poisonEffect({ c, e, statusTarget }: EffectContext): void {
  damageOverTime(c, statusTarget(), 'poison', e.degtour || 0, e.tours || 1);
}

export function burnEffect({ c, e, statusTarget }: EffectContext): void {
  const M = statusTarget();
  damageOverTime(c, M, 'brûlure', round((M.maxHp * (e.pctpv || 0)) / 100), e.tours || 1);
}

export function burnOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance))
    damageOverTime(c, d, 'brûlure', round((d.maxHp * (q.pctpv || 0)) / 100), q.tours || 1);
}

export function poisonOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) damageOverTime(c, d, 'poison', q.degtour || 0, q.tours || 1);
}

// Its effects (the registry of effects.ts).
export const effects = {
  poison_effet: { run: poisonEffect, undoesStatuses: 'target' },
  brulure_effet: { run: burnEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
