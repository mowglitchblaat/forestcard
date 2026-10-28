// Lightning skills (October 2026):
//   - Overload (surcharge): an effect. The card electrocutes itself (raw damage, a % of its max HP:
//     level table surchargeAuto, 10 by default; it cannot kill it: 1 HP at least is left), then for 2
//     of its turns (the turn it plays it counts): its strikes lose a % of its ATQ (surchargeAtq, 40),
//     its attacks chain (surchargeEnchainement % of chances, 60, up to 3 strikes) and each strike lays
//     a lightning mark, at 100 %. Played again while overloaded: its turns start again.
//   - Accumulator (accumulateur): a passive. Each lightning mark the card lays (since it came on the
//     field) gives it a charge; at accumulateurCharges charges (3), its next attack deals
//     accumulateurBonus % more (50) on each of its strikes, and the charges fall back to 0.

import type { Attack, Strike } from '../combat/attack.ts';
import { emit, id, opponent, round, type Combat } from '../combat/combat.ts';
import { damage } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';

export const OVERLOAD_TURNS = 2;
export const OVERLOAD_STRIKES = 3; // the strikes of a chained attack, at most

export type Overload = { turns: number; given: EffectData[] };

// Its part of a card's status (combat/state.ts).
export type OverloadState = {
  overload: Overload | null;
  voltCharges: number; // accumulator
  charged: boolean; // accumulator: its next attack is charged
  discharging: boolean; // accumulator: this attack is the charged one
};
export const overloadState = (): OverloadState => ({
  overload: null,
  voltCharges: 0,
  charged: false,
  discharging: false,
});

// The ATQ its strikes lose while overloaded.
export const overloadMalus = (c: Combat, a: Side): number =>
  a.status.overload ? Math.max(0, round((a.atq * c.levels.surchargeAtq) / 100)) : 0;

function endOverload(c: Combat, s: Side): void {
  const o = s.status.overload;
  if (!o) return;
  s.status.overload = null;
  s.status.attackEffects = s.status.attackEffects.filter((q) => !o.given.includes(q));
  emit(c, { type: 'overloadEnded', side: id(c, s) });
}

export function overloadEffect({ c, o, onUndo }: EffectContext): void {
  if (o.hp <= 0) return;
  const running = o.status.overload;
  if (running) running.turns = OVERLOAD_TURNS;
  else {
    const given: EffectData[] = [
      { type: 'enchainement', chance: c.levels.surchargeEnchainement, max: OVERLOAD_STRIKES - 1 },
      { type: 'foudre', chance: 100 },
    ];
    o.status.overload = { turns: OVERLOAD_TURNS, given };
    o.status.attackEffects.push(...given);
  }
  emit(c, {
    type: 'overloaded',
    side: id(c, o),
    again: !!running,
    turns: OVERLOAD_TURNS,
    atqPct: c.levels.surchargeAtq,
    chainPct: c.levels.surchargeEnchainement,
    strikes: OVERLOAD_STRIKES,
  });
  const self = Math.min(round((o.maxHp * c.levels.surchargeAuto) / 100), o.hp - 1);
  if (self > 0) {
    const n = damage(c, opponent(c, o), o, self);
    emit(c, { type: 'damaged', side: id(c, o), amount: n, cause: 'overload' });
  }
  onUndo(() => endOverload(c, o));
}

// End of its turn: the overload counts down; a charged attack is spent.
export function overloadEnd(c: Combat, s: Side): Flow {
  s.status.discharging = false;
  const o = s.status.overload;
  if (o && --o.turns <= 0) endOverload(c, s);
  return undefined;
}

// A lightning mark laid by o (mechanics/lightning.ts): the accumulator gains a charge.
export function accumulate(c: Combat, o: Side): void {
  if (o.status.charged || !o.passives.some((p) => p.type === 'accumulateur')) return;
  const need = Math.max(1, Math.floor(c.levels.accumulateurCharges));
  o.status.voltCharges++;
  const full = o.status.voltCharges >= need;
  emit(c, { type: 'voltCharged', side: id(c, o), charges: o.status.voltCharges, need, full });
  if (full) {
    o.status.voltCharges = 0;
    o.status.charged = true;
  }
}

// Once the attack is announced: a charged accumulator lets go.
export function discharge(c: Combat, { a, ia }: Attack): Flow {
  if (!a.status.charged) return undefined;
  a.status.charged = false;
  a.status.discharging = true;
  emit(c, { type: 'discharged', side: ia, pct: c.levels.accumulateurBonus });
  return undefined;
}

// Each strike of the charged attack: its power grows.
export function dischargeStrike(c: Combat, { a }: Attack, st: Strike): undefined {
  if (a.status.discharging && st.n > 0) st.n += round((st.n * c.levels.accumulateurBonus) / 100);
  return undefined;
}

// Its effects (the registry of effects.ts).
export const effects = {
  surcharge: { run: overloadEffect },
} satisfies EffectRules;
