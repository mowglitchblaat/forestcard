// Burn and poison (damage over time), in levels I to III (model/levels.ts). Ticks at the end of the
// affected card's turn, right after its attack: "t turns" = t ticks in total, counted on its turns.
// One of each kind per card; reapplied, the levels add up (III at most) and the longer duration
// stays.
//   - poison: fixed damage per tick, by level;
//   - burn: a % of the card's max HP per tick, by level, and it calcinates: each tick also takes
//     max HP for good, a share of its damage set once for all burns (calcination %, a purification
//     stops the burn, not the scars).
// Fire on ice: a burn laid on a frozen card melts the ice one level down (mechanics/frost.ts) with a
// thermal shock (one tick at once), and the burn is spent doing it: no burn is laid.
// Fire and water: a burn on a contaminated card vaporises (mechanics/contamination.ts).
//
// Laid by: an effect (poison_effet, brulure_effet), an attack (passive or attack effect brulure,
// poison).

import { damage } from '../combat/damage.ts';
import { emit, id, opponent, over, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { addLevels, at, levelOf } from '../model/levels.ts';
import { contaminationExtra, vaporize } from './contamination.ts';
import { statusDamageMarks } from './execution.ts';
import { thaw } from './frost.ts';
import { mistTakes } from './mist.ts';

// kind is the legacy label, printed as is in the journal: 'poison' or 'brûlure'.
export type DamageOverTime = { kind: string; level: number; turns: number };

// Its part of a card's status (combat/state.ts).
export type DotState = {
  dots: DamageOverTime[]; // burn and poison
};
export const dotState = (): DotState => ({ dots: [] });

const isPoison = (kind: string) => kind === 'poison';

// The value of a level: poison damage per tick, or burn % of max HP per tick.
export const dotValue = (c: Combat, kind: string, level: number): number =>
  at(isPoison(kind) ? c.levels.poison : c.levels.brulure, level);

// The damage of one tick on s, before reductions.
export const dotAmount = (c: Combat, s: Side, dot: DamageOverTime): number =>
  isPoison(dot.kind)
    ? dotValue(c, dot.kind, dot.level)
    : round((s.maxHp * dotValue(c, dot.kind, dot.level)) / 100);

// kind: 'poison' or 'brûlure' (the legacy label, kept as is).
export function damageOverTime(
  c: Combat,
  M: Side,
  kind: string,
  level: number,
  turns: number,
): void {
  if (
    mistTakes(c, M, isPoison(kind) ? 'poison' : 'burn', (t) =>
      damageOverTime(c, t, kind, level, turns),
    )
  )
    return;
  if (kind === 'brûlure' && M.status.frosts.length) {
    // fire on ice: the ice melts one level, a thermal shock, and the burn is spent
    thaw(c, M);
    const shock = round((M.maxHp * dotValue(c, kind, level)) / 100);
    const n = damage(c, opponent(c, M), M, shock);
    emit(c, { type: 'damaged', side: id(c, M), amount: n, cause: 'thermalShock' });
    return;
  }
  turns += contaminationExtra(M);
  let current = M.status.dots.find((z) => z.kind === kind);
  const stacked = !!current;
  if (current) {
    current.level = addLevels(current.level, level);
    current.turns = Math.max(current.turns, turns);
  } else {
    current = { kind, level: addLevels(0, level), turns };
    M.status.dots.push(current);
  }
  emit(c, {
    type: 'dotApplied',
    side: id(c, M),
    kind: isPoison(kind) ? 'poison' : 'burn',
    stacked,
    level: current.level,
    value: dotValue(c, kind, current.level),
    turns: current.turns,
  });
  if (!isPoison(kind)) vaporize(c, M); // a burn on a contaminated card: vaporisation
}

export function tickDot(c: Combat, s: Side, dot: DamageOverTime): void {
  const n = damage(c, opponent(c, s), s, dotAmount(c, s, dot));
  emit(c, {
    type: 'damaged',
    side: id(c, s),
    amount: n,
    cause: isPoison(dot.kind) ? 'poison' : 'burn',
  });
  if (!isPoison(dot.kind) && n > 0 && s.hp > 0)
    calcinate(c, s, round((n * c.levels.calcination) / 100));
  statusDamageMarks(c, s, isPoison(dot.kind) ? 'poison' : 'brulure');
  if (!s.status.dots.includes(dot) || s.hp <= 0) return; // purified or dead during the tick: nothing more
  if (--dot.turns > 0) return;
  s.status.dots = s.status.dots.filter((z) => z !== dot);
  emit(c, {
    type: 'statusEnded',
    side: id(c, s),
    status: isPoison(dot.kind) ? 'poison' : 'burn',
  });
}

// A burn tick (or a blaze, mechanics/blaze.ts) takes n max HP (1 at least left).
export function calcinate(c: Combat, s: Side, n: number): void {
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

const turnsOf = (e: EffectData): number => +(e.tours as number) || 1;

export function poisonEffect({ c, e, statusTarget }: EffectContext): void {
  damageOverTime(c, statusTarget(), 'poison', levelOf('poison', e), turnsOf(e));
}

export function burnEffect({ c, e, statusTarget }: EffectContext): void {
  damageOverTime(c, statusTarget(), 'brûlure', levelOf('brulure', e), turnsOf(e));
}

export function burnOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) damageOverTime(c, d, 'brûlure', levelOf('brulure', q), turnsOf(q));
}

export function poisonOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) damageOverTime(c, d, 'poison', levelOf('poison', q), turnsOf(q));
}

// Its effects (the registry of effects.ts).
export const effects = {
  poison_effet: { run: poisonEffect, undoesStatuses: 'target' },
  brulure_effet: { run: burnEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
