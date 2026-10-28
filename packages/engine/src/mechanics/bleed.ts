// Bleed, in levels I to III (model/levels.ts): a % of max HP at the end of the affected card's turn
// (after burn and poison), and its heals reduced by a % while it runs, both by level. One per card;
// reapplied, the levels add up (III at most) and the longer duration stays.
//
// Laid by: an effect (saignement), an attack (passive or attack effect saignement), the insect
// mutation (level II).

import { damage } from '../combat/damage.ts';
import { emit, id, opponent, over, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { addLevels, at, levelOf } from '../model/levels.ts';
import { contaminationExtra } from './contamination.ts';
import { statusDamageMarks } from './execution.ts';
import { mistTakes } from './mist.ts';

export type Bleed = { level: number; turns: number };

// Its part of a card's status (combat/state.ts).
export type BleedState = {
  bleeds: Bleed[];
};
export const bleedState = (): BleedState => ({ bleeds: [] });

export const bleedPct = (c: Combat, b: Bleed): number => at(c.levels.saignement, b.level);
export const bleedHealReduction = (c: Combat, b: Bleed): number =>
  Math.min(100, at(c.levels.saignementSoin, b.level));

// The damage of one tick on s, before reductions.
export const bleedAmount = (c: Combat, s: Side, b: Bleed): number =>
  round((s.maxHp * bleedPct(c, b)) / 100);

export function bleed(c: Combat, dst: Side, level: number, turns: number): void {
  if (mistTakes(c, dst, 'bleed', (t) => bleed(c, t, level, turns))) return;
  turns += contaminationExtra(dst);
  let current = dst.status.bleeds[0];
  const stacked = !!current;
  if (current) {
    current.level = addLevels(current.level, level);
    current.turns = Math.max(current.turns, turns);
  } else {
    current = { level: addLevels(0, level), turns };
    dst.status.bleeds.push(current);
  }
  emit(c, {
    type: 'bleedApplied',
    side: id(c, dst),
    stacked,
    level: current.level,
    pct: bleedPct(c, current),
    healReduction: bleedHealReduction(c, current),
    turns: current.turns,
  });
}

export function tickBleed(c: Combat, s: Side, bleedStatus: Bleed): void {
  const n = damage(c, opponent(c, s), s, bleedAmount(c, s, bleedStatus));
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
export const healReduction = (c: Combat, s: Side): number =>
  Math.min(
    100,
    s.status.bleeds.reduce((a, b) => a + bleedHealReduction(c, b), 0),
  );

const turnsOf = (e: EffectData): number => +(e.tours as number) || 1;

export function bleedEffect({ c, e, statusTarget }: EffectContext): void {
  bleed(c, statusTarget(), levelOf('saignement', e), turnsOf(e));
}

export function bleedOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) bleed(c, d, levelOf('saignement', q), turnsOf(q));
}

// Its effects (the registry of effects.ts).
export const effects = {
  saignement: { run: bleedEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
