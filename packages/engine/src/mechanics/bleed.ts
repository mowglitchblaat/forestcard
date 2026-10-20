// Bleed: a share of max HP at the end of the affected card's turn (after burn and poison), and its
// heals reduced while it runs. One per card; reapplied, the share and the reduction add up (100 %
// at most) and the duration restarts.
//
// Laid by: an effect (saignement), an attack (passive or attack effect saignement).

import { damage } from '../combat/damage.ts';
import { emit, id, opponent, over, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { statusDamageMarks } from './execution.ts';

export type Bleed = { pct: number; healReduction: number; turns: number };

// Its part of a card's status (combat/state.ts).
export type BleedState = {
  bleeds: Bleed[];
};
export const bleedState = (): BleedState => ({ bleeds: [] });

export function bleed(
  c: Combat,
  dst: Side,
  pct: number,
  healReduction: number,
  turns: number,
): void {
  let current = dst.status.bleeds[0];
  const stacked = !!current;
  if (current) {
    current.pct += pct;
    current.healReduction = Math.min(100, current.healReduction + healReduction);
    current.turns = Math.max(current.turns, turns);
  } else {
    current = { pct, healReduction, turns };
    dst.status.bleeds.push(current);
  }
  emit(c, {
    type: 'bleedApplied',
    side: id(c, dst),
    stacked,
    pct: current.pct,
    healReduction: current.healReduction,
    turns: current.turns,
  });
}

export function tickBleed(c: Combat, s: Side, bleedStatus: Bleed): void {
  const n = damage(c, opponent(c, s), s, round((s.maxHp * bleedStatus.pct) / 100));
  emit(c, { type: 'damaged', side: id(c, s), amount: n, cause: 'bleed' });
  statusDamageMarks(c, s, 'saignement');
  if (!s.status.bleeds.includes(bleedStatus) || s.hp <= 0) return;
  if (--bleedStatus.turns > 0) return;
  s.status.bleeds = s.status.bleeds.filter((z) => z !== bleedStatus);
  emit(c, { type: 'statusEnded', side: id(c, s), status: 'bleed' });
}

// End of its turn, after burn and poison.
export function bleedTicks(c: Combat, s: Side): Flow {
  for (const bleedStatus of s.status.bleeds.slice()) {
    if (s.hp <= 0 || over(c)) return 'stop';
    if (!s.status.bleeds.includes(bleedStatus)) continue;
    tickBleed(c, s, bleedStatus);
  }
  if (s.hp <= 0) return 'stop';
  return undefined;
}

// Percent taken off its heals (100 at most).
export const healReduction = (s: Side): number =>
  Math.min(
    100,
    s.status.bleeds.reduce((a, b) => a + (b.healReduction || 0), 0),
  );

export function bleedEffect({ c, e, statusTarget }: EffectContext): void {
  bleed(c, statusTarget(), e.pctpv || 0, e.reducsoin || 0, e.tours || 1);
}

export function bleedOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) bleed(c, d, q.pctpv || 0, q.reducsoin || 0, q.tours || 1);
}

// Its effects (the registry of effects.ts).
export const effects = {
  saignement: { run: bleedEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
