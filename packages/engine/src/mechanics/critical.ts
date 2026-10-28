// Critical hits and the updraft (rework of October 2026).
//   - Critical hit (passive critique, or attack effect atk_critique given by a magic, a trap or an
//     ultimate): X % of chances, on each strike, to add the critical power to it, a % of the
//     attacker's ATQ. The power is the same for every card (level table: critique, 50 by default);
//     only a boost such as the updraft raises it. Several sources add their chances (one draw).
//   - Headshot (mechanics/headshot.ts) is a special critical hit: it does not draw the critical
//     chance, it comes from its own chance or from a targeting mark.
//   - Updraft (courant ascendant, passive): when the card lands a critical hit, that strike deals
//     `val` % more (20 when empty), and its critical power rises by `pctcrit` points (10 when empty)
//     for `tours` of its turns (2 when empty). Crits in a row add up, `max` times at most (3 when
//     empty); each one starts the turns again.
// Both come right after the strike's power, before a shield, a block or a reduction.

import type { Attack, Strike } from '../combat/attack.ts';
import { emit, id, raw, roll, round, type Combat } from '../combat/combat.ts';
import type { Flow, StrikeFlow } from '../combat/flow.ts';
import { attackSources, mergedSource } from '../combat/sources.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData, Num } from '../model/card.ts';

export type Updraft = { stacks: number; turns: number };

// Its part of a card's status (combat/state.ts).
export type CriticalState = {
  updraft: Updraft | null;
};
export const criticalState = (): CriticalState => ({ updraft: null });

const num = (v: Num | undefined, d: number): number =>
  v == null || v === '' ? d : Math.max(0, +raw(v) || 0);

const updraftOf = (s: Side): EffectData | undefined =>
  s.passives.find((p) => p.type === 'courant_ascendant');

// The critical power of s now: the common power, and its updraft.
export function critPower(c: Combat, s: Side): number {
  const u = s.status.updraft;
  const p = updraftOf(s);
  return c.levels.critique + (u && p ? u.stacks * num(p.pctcrit, 10) : 0);
}

// A critical strike: its bonus, then the updraft. headshot: what made it critical.
export function critical(c: Combat, at: Attack, st: Strike, headshot: boolean, forced = false) {
  const { a, ia, idd } = at;
  const bonus = Math.max(0, round((a.atq * critPower(c, a)) / 100));
  st.n += bonus;
  st.crit = true;
  if (headshot) emit(c, { type: 'headshot', side: ia, target: idd, bonus, forced });
  else emit(c, { type: 'criticalHit', side: ia, target: idd, bonus });
  const p = updraftOf(a);
  if (!p) return;
  const more = round((st.n * num(p.val, 20)) / 100);
  st.n += more;
  const u = a.status.updraft ?? { stacks: 0, turns: 0 };
  u.stacks = Math.min(Math.max(1, num(p.max, 3)), u.stacks + 1);
  u.turns = Math.max(1, num(p.tours, 2));
  a.status.updraft = u;
  emit(c, {
    type: 'updraft',
    side: ia,
    amplified: more,
    stacks: u.stacks,
    power: critPower(c, a),
    turns: u.turns,
  });
}

// Each strike, after a headshot: the critical chance, when the strike is not critical already.
export function criticalStrike(c: Combat, at: Attack, st: Strike): StrikeFlow {
  if (st.crit || st.blocked || at.d.hp <= 0) return undefined;
  const g = attackSources(at.a, (q) => q.type === 'critique')[0];
  if (!g) return undefined;
  const first = g[0] as EffectData;
  const q =
    g.length === 1 ? (roll(c, num(first.chance, 0)) ? first : undefined) : mergedSource(c, g, 0);
  if (q) critical(c, at, st, false);
  return undefined;
}

// End of its turn: the updraft counts down.
export function updraftEnd(c: Combat, s: Side): Flow {
  const u = s.status.updraft;
  if (u && --u.turns <= 0) {
    s.status.updraft = null;
    emit(c, { type: 'updraftEnded', side: id(c, s) });
  }
  return undefined;
}
