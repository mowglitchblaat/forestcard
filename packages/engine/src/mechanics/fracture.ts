// Fracture, in levels I to III (model/levels.ts): when the fractured card attacks, before its
// strikes, it may hurt itself: a chance by level, and damage in % of its own ATQ by level. One per
// card; reapplied, the levels add up (III at most) and the longer duration stays. It breaks a
// solidification first, and shatters the ice of a frozen card. It counts the fractured card's turns.
//
// Laid by: an effect (fracture), an attack (passive or attack effect fracture).

import type { Attack } from '../combat/attack.ts';
import { damage } from '../combat/damage.ts';
import { emit, id, over, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { addLevels, at, levelOf } from '../model/levels.ts';
import { shatter } from './frost.ts';
import { mistTakes } from './mist.ts';

export type Fracture = { level: number; turns: number };

// Its part of a card's status (combat/state.ts).
export type FractureState = {
  fractures: Fracture[];
};
export const fractureState = (): FractureState => ({ fractures: [] });

export const fractureChance = (c: Combat, f: Fracture): number =>
  at(c.levels.fractureChance, f.level);
export const fractureAtqPct = (c: Combat, f: Fracture): number => at(c.levels.fractureAtq, f.level);

export function fracture(c: Combat, d: Side, level: number, turns: number): void {
  if (mistTakes(c, d, 'fracture', (t) => fracture(c, t, level, turns))) return;
  if (d.status.solidTurns > 0) {
    d.status.solidTurns = 0;
    emit(c, { type: 'solidBroken', side: id(c, d) });
  }
  let current = d.status.fractures[0];
  const stacked = !!current;
  if (current) {
    current.level = addLevels(current.level, level);
    current.turns = Math.max(current.turns, turns);
  } else {
    current = { level: addLevels(0, level), turns };
    d.status.fractures.push(current);
  }
  emit(c, {
    type: 'fractured',
    side: id(c, d),
    stacked,
    level: current.level,
    chance: fractureChance(c, current),
    atqPct: fractureAtqPct(c, current),
    turns: current.turns,
  });
  // a fracture on a frozen card shatters the ice at once
  if (d.status.frosts.length) shatter(c, d, 'fracture');
}

// Before its strikes: a chance to get hurt, for a share of its own ATQ.
export function selfFracture(c: Combat, { a, d, ia }: Attack): Flow {
  const f = a.status.fractures[0];
  if (f && roll(c, fractureChance(c, f))) {
    const n = damage(c, d, a, round((Math.max(0, a.atq) * fractureAtqPct(c, f)) / 100));
    emit(c, { type: 'damaged', side: ia, amount: n, cause: 'selfFracture' });
  }
  if (over(c)) return 'stop';
  return undefined;
}

export function fracturesEnd(c: Combat, s: Side): Flow {
  s.status.fractures = s.status.fractures.filter((f) => {
    if (--f.turns > 0) return true;
    emit(c, { type: 'statusEnded', side: id(c, s), status: 'fracture' });
    return false;
  });
  return undefined;
}

const turnsOf = (e: EffectData): number => +(e.tours as number) || 1;

export function fractureEffect({ c, e, statusTarget }: EffectContext): void {
  fracture(c, statusTarget(), levelOf('fracture', e), turnsOf(e));
}

export function fractureOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) fracture(c, d, levelOf('fracture', q), turnsOf(q));
}

// Its effects (the registry of effects.ts).
export const effects = {
  fracture: { run: fractureEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
