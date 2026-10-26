// Reactions: what a card does when something happens to it, read as the events are emitted
// (combat/combat.ts, emit). Only cards holding a reacting passive (mutation, mue, reaction) look.
//   - reaction passive: when the card takes damage (`quand` 'degats', the default) or a negative
//     status ('statut'), one stat grows (`stat`: atq, pv, esquive, blocage, reduc) by `val` (unit
//     `u` for ATQ and HP; percent points for the others), up to `plafond` in all (empty or 0: no
//     cap);
//   - insect mutation and molt (mechanics/insect.ts).
// And the defenses these gains feed, on each strike after the block and the reductions: a block
// chance (75 % at most) and a damage reduction (90 % at most).

import type { Attack, Strike } from '../combat/attack.ts';
import { emit, id, raw, roll, round, type Combat } from '../combat/combat.ts';
import type { StrikeFlow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { DomainEvent } from '../events.ts';
import type { EffectData } from '../model/card.ts';
import { mutationOnStatus } from './insect.ts';
import { triggerFact } from './triggers.ts';

// Its part of a card's status (combat/state.ts).
export type ReactionState = {
  reacts: boolean; // holds a reacting passive: emit() asks it
  reactionGains: number[]; // per passive index: what the reaction passive gave so far
  armorPct: number; // damage reduction gained, %
  blockChance: number; // block chance gained, %
};
export const reactionState = (passives: EffectData[]): ReactionState => ({
  reacts: passives.some((p) => p.type === 'reaction' || p.type === 'mutation' || p.type === 'mue'),
  reactionGains: [],
  armorPct: 0,
  blockChance: 0,
});

// A gain in points: percent of `base` ('pct') or points.
export const gainOf = (v: unknown, unit: unknown, base: number): number => {
  const n = +(v as number) || 0;
  return unit === 'pct' ? round((base * n) / 100) : n;
};

// Grows one stat of s by d (d > 0).
export function grow(c: Combat, s: Side, stat: string, d: number, cause: 'reaction' | 'mutation') {
  if (d <= 0 || s.hp <= 0) return;
  if (stat === 'atq') {
    s.atq += d;
    emit(c, { type: 'statChanged', side: id(c, s), stat: 'atq', delta: d, cause });
  } else if (stat === 'pv') {
    s.maxHp += d;
    s.hp += d;
    emit(c, { type: 'statChanged', side: id(c, s), stat: 'max', delta: d, cause });
  } else if (stat === 'esquive') {
    s.status.dodgeBonus += d;
    emit(c, { type: 'dodgeChanged', side: id(c, s), delta: d });
  } else if (stat === 'blocage') {
    s.status.blockChance += d;
    emit(c, { type: 'defenseChanged', side: id(c, s), kind: 'block', delta: d });
  } else if (stat === 'reduc') {
    s.status.armorPct += d;
    emit(c, { type: 'defenseChanged', side: id(c, s), kind: 'reduce', delta: d });
  }
}

function reactionPassives(c: Combat, s: Side, when: 'degats' | 'statut'): void {
  s.passives.forEach((p, pi) => {
    if (!(p.type === 'reaction') || (p.quand || 'degats') !== when || s.hp <= 0) return;
    const stat = String(p.stat || 'atq');
    const base = stat === 'atq' ? s.atq : stat === 'pv' ? s.maxHp : 0;
    let d = stat === 'atq' || stat === 'pv' ? gainOf(p.val, p.u, base) : +raw(p.val) || 0;
    const cap = +raw(p.plafond) || 0;
    const so = s.status.reactionGains[pi] || 0;
    if (cap > 0) d = Math.min(d, cap - so);
    if (d <= 0) return;
    s.status.reactionGains[pi] = so + d;
    grow(c, s, stat, d, 'reaction');
  });
}

// Called by emit() for every event.
export function reactToEvent(c: Combat, e: DomainEvent): void {
  if (!('side' in e)) return;
  const s = c.sides[e.side];
  if (!s || !s.status.reacts || s.hp <= 0) return;
  if (e.type === 'damaged') {
    if (e.amount > 0) reactionPassives(c, s, 'degats');
    return;
  }
  const f = triggerFact(e);
  if (f && f.kind === 'status' && f.who === e.side) {
    mutationOnStatus(c, s);
    reactionPassives(c, s, 'statut');
  }
}

// Each strike, after the block and the reductions: the defenses gained.
export function gainedDefenses(c: Combat, { d, ia, idd }: Attack, st: Strike): StrikeFlow {
  if (st.n <= 0 || d.hp <= 0) return undefined;
  const block = Math.min(75, d.status.blockChance);
  if (block > 0 && roll(c, block)) {
    st.n = 0;
    st.blocked = true;
    emit(c, { type: 'attackBlocked', side: ia, defender: idd });
    return undefined;
  }
  const reduce = Math.min(90, d.status.armorPct);
  if (reduce > 0) {
    st.n = Math.max(0, round((st.n * (100 - reduce)) / 100));
    emit(c, { type: 'damageReduced', side: idd });
    if (st.n <= 0) st.blocked = true;
  }
  return undefined;
}
