// Frost, in 3 levels: each frost laid on a card raises its level by one (3 at most).
//   1 Givre (rime): when it attacks, X % chance its attack is cancelled, and its dodge chance loses
//     as many points.
//   2 Gelée (frozen): the same, stronger.
//   3 Glaciation: caught in the ice, it does not attack at its next turn; then the ice shatters:
//     it takes the shatter damage and the frost is gone.
// What each level does lives in the level table (model/levels.ts, `gel` and `gelEclat`, November
// 2026), the same for every card: a card only sets its duration (`tours`) and its chance. Its old
// values (`annul`, `eclat`) are no longer read. Each frost resets the duration (counted on the frozen
// card's turns; at the end, the frost is gone, whatever its level). A solidified card cannot go past
// level 2. A fracture laid on a frozen card shatters the ice at once. A purification removes it.
// Fire and ice: a frost laid on a burning card puts the fire out (the burn is gone) and no frost is
// laid; a burn laid on a frozen card melts the ice one level down (mechanics/dot.ts).
//
// Laid by: an effect (gel), an attack (passive or attack effect gel), a breath or a missile of ice.

import type { Attack } from '../combat/attack.ts';
import { emit, id, opponent, roll, type Combat } from '../combat/combat.ts';
import { damage } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData, Num } from '../model/card.ts';
import { at } from '../model/levels.ts';
import { contaminationExtra } from './contamination.ts';
import { putOutBlaze } from './blaze.ts';
import { mistTakes } from './mist.ts';
import { livingWeaponTakes } from './living-weapon.ts';

// `boost`: % of the table's values (100; more in a swallower, mechanics/swallow.ts).
export type Frost = { level: number; boost: number; turns: number };

// Its part of a card's status (combat/state.ts): one frost at most (an array, like the other statuses).
export type FrostState = {
  frosts: Frost[];
};
export const frostState = (): FrostState => ({ frosts: [] });

// The chance a frozen card's attack is cancelled at its level, and the dodge points it loses (the
// same value; glaciation: it does not attack at all).
export const cancelAt = (c: Combat, f: Frost): number =>
  Math.min(100, Math.round((at(c.levels.gel, f.level) * f.boost) / 100));

// Damage when its ice shatters.
const shatterDamage = (c: Combat, f: Frost): number =>
  Math.round((c.levels.gelEclat * f.boost) / 100);

// Dodge points a frozen card loses (mechanics/dodge.ts).
export const frostDodgeMalus = (c: Combat, s: Side): number => {
  const f = s.status.frosts[0];
  return f ? cancelAt(c, f) : 0;
};

const num = (v: Num | undefined, d: number): number => {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

// One frost laid on d: one level more (or `levels` levels and a `boost`, for statuses moved to a
// swallower).
export function freeze(c: Combat, d: Side, turns: number, levels = 1, boost = 100): void {
  if (livingWeaponTakes(c, d, 'frost')) return;
  if (mistTakes(c, d, 'frost', (t) => freeze(c, t, turns, levels, boost))) return;
  // ice on a blaze: the blaze is put out, the ice is spent doing it (mechanics/blaze.ts)
  if (putOutBlaze(c, d, 'ice')) return;
  // ice on fire: the burn is put out, the ice is spent doing it
  if (d.status.dots.some((z) => z.kind === 'brûlure')) {
    d.status.dots = d.status.dots.filter((z) => z.kind !== 'brûlure');
    emit(c, { type: 'fireExtinguished', side: id(c, d) });
    emit(c, { type: 'statusEnded', side: id(c, d), status: 'burn' });
    return;
  }
  const now = d.status.frosts[0];
  const f: Frost = now ?? { level: 0, boost: 0, turns: 0 };
  const wanted = Math.min(3, f.level + Math.max(1, levels));
  const held = wanted >= 3 && d.status.solidTurns > 0;
  f.level = held ? Math.max(f.level, 2) : wanted;
  f.boost = Math.max(f.boost, boost);
  f.turns = Math.max(f.turns, Math.max(1, turns) + contaminationExtra(d));
  if (!now) d.status.frosts = [f];
  emit(c, {
    type: 'frozen',
    side: id(c, d),
    level: f.level,
    cancelChance: cancelAt(c, f),
    turns: f.turns,
    held,
  });
}

// Fire on ice: the frost goes one level down (gone at 0).
export function thaw(c: Combat, d: Side): void {
  const f = d.status.frosts[0];
  if (!f) return;
  f.level--;
  emit(c, { type: 'thawed', side: id(c, d), level: f.level });
  if (f.level <= 0) {
    d.status.frosts = [];
    emit(c, { type: 'statusEnded', side: id(c, d), status: 'frost' });
  }
}

// The ice shatters (glaciation, or a fracture on a frozen card): shatter damage, frost gone.
export function shatter(c: Combat, d: Side, cause: 'glaciation' | 'fracture'): void {
  const f = d.status.frosts[0];
  if (!f) return;
  d.status.frosts = [];
  emit(c, { type: 'frostShattered', side: id(c, d), cause });
  const hit = shatterDamage(c, f);
  if (hit > 0 && d.hp > 0) {
    const n = damage(c, opponent(c, d), d, hit);
    emit(c, { type: 'damaged', side: id(c, d), amount: n, cause: 'shatter' });
  }
  emit(c, { type: 'statusEnded', side: id(c, d), status: 'frost' });
}

// Can it attack: glaciation (no attack, then the ice shatters), or a chance its attack is cancelled.
export function frozen(c: Combat, { a, ia }: Attack): Flow {
  const f = a.status.frosts[0];
  if (!f) return undefined;
  if (f.level >= 3) {
    emit(c, { type: 'cannotAttack', side: ia, reason: 'glaciation' });
    shatter(c, a, 'glaciation');
    return 'stop';
  }
  if (roll(c, cancelAt(c, f))) {
    emit(c, { type: 'cannotAttack', side: ia, reason: 'frozen' });
    return 'stop';
  }
  return undefined;
}

export function frostsEnd(c: Combat, s: Side): Flow {
  s.status.frosts = s.status.frosts.filter((f) => {
    if (--f.turns > 0) return true;
    emit(c, { type: 'statusEnded', side: id(c, s), status: 'frost' });
    return false;
  });
  return undefined;
}

// Its duration: the only value a card sets (its old `annul` and `eclat` are not read).
const laid = (q: EffectData): number => num(q.tours, 1) || 1;

export function frostEffect({ c, e, statusTarget }: EffectContext): void {
  freeze(c, statusTarget(), laid(e));
}

export function frostOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) freeze(c, d, laid(q));
}

// Its effects (the registry of effects.ts).
export const effects = {
  gel: { run: frostEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
