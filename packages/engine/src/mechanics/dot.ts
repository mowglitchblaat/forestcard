// Burn and poison (damage over time). Ticks at the end of the affected card's turn, right after its
// attack: "t turns" = t ticks in total, counted on its turns. One of each kind per card, same
// intensity on every tick; reapplied, intensities add up and the duration restarts.
// Burn calcinates: each burn tick also takes max HP, for good (a purification stops the burn, not
// the scars): as many as its damage, or the share set by the card (calcine, % of the damage; 100
// when empty, 0 = none). Stacked burns add up their calcination too. Fire on ice: a burn laid on a frozen card melts the ice one level down
// (mechanics/frost.ts) and deals one tick at once (thermal shock).
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
import { thaw } from './frost.ts';

// kind is the legacy label, printed as is in the journal: 'poison' or 'brûlure'.
// calc: max HP a full tick calcinates (burn only; amount × calcine %, summed over stacked burns).
export type DamageOverTime = { kind: string; amount: number; turns: number; calc: number };

// The calcination share of a burn: 100 % when the field is empty.
export const calcinePct = (v: unknown): number =>
  v === undefined || v === null || v === '' ? 100 : Math.max(0, +(v as number) || 0);

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
  calcPct = 100,
): void {
  const calc = kind === 'poison' ? 0 : (amount * calcPct) / 100;
  if (kind === 'brûlure' && M.status.frosts.length) {
    thaw(c, M);
    const n = damage(c, opponent(c, M), M, amount);
    emit(c, { type: 'damaged', side: id(c, M), amount: n, cause: 'thermalShock' });
    if (M.hp <= 0) return;
  }
  let current = M.status.dots.find((z) => z.kind === kind);
  const stacked = !!current;
  if (current) {
    current.amount += amount;
    current.calc += calc;
    current.turns = Math.max(current.turns, turns);
  } else {
    current = { kind, amount, turns, calc };
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
  if (dot.kind !== 'poison' && n > 0 && s.hp > 0 && dot.amount > 0)
    calcinate(c, s, round((n * dot.calc) / dot.amount));
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

// A burn tick takes n max HP (1 at least left).
function calcinate(c: Combat, s: Side, n: number): void {
  const lost = Math.min(n, s.maxHp - 1);
  if (lost <= 0) return;
  s.maxHp -= lost;
  s.hp = Math.min(s.hp, s.maxHp);
  emit(c, { type: 'statChanged', side: id(c, s), stat: 'max', delta: -lost, cause: 'calcination' });
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
  damageOverTime(
    c,
    M,
    'brûlure',
    round((M.maxHp * (e.pctpv || 0)) / 100),
    e.tours || 1,
    calcinePct(e.calcine),
  );
}

export function burnOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance))
    damageOverTime(
      c,
      d,
      'brûlure',
      round((d.maxHp * (q.pctpv || 0)) / 100),
      q.tours || 1,
      calcinePct(q.calcine),
    );
}

export function poisonOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) damageOverTime(c, d, 'poison', q.degtour || 0, q.tours || 1);
}

// Its effects (the registry of effects.ts).
export const effects = {
  poison_effet: { run: poisonEffect, undoesStatuses: 'target' },
  brulure_effet: { run: burnEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
