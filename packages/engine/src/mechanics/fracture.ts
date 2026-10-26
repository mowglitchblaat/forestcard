// Fracture: the fractured card may hurt itself when it attacks (a draw per fracture, before its
// strikes). It breaks a solidification first. Each fracture lasts its turns, counted on the
// fractured card's turns.
//
// Laid by: an effect (fracture), an attack (passive or attack effect fracture).

import type { Attack } from '../combat/attack.ts';
import { damage } from '../combat/damage.ts';
import { emit, id, over, roll, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { shatter } from './frost.ts';
import { mistTakes } from './mist.ts';

export type Fracture = { chance: number; damage: number; turns: number };

// Its part of a card's status (combat/state.ts).
export type FractureState = {
  fractures: Fracture[];
};
export const fractureState = (): FractureState => ({ fractures: [] });

export function fracture(
  c: Combat,
  d: Side,
  chance: number,
  damageOnAttack: number,
  turns: number,
): void {
  if (mistTakes(c, d, 'fracture', (t) => fracture(c, t, chance, damageOnAttack, turns))) return;
  if (d.status.solidTurns > 0) {
    d.status.solidTurns = 0;
    emit(c, { type: 'solidBroken', side: id(c, d) });
  }
  d.status.fractures.push({ chance, damage: damageOnAttack, turns });
  emit(c, { type: 'fractured', side: id(c, d), chance, damage: damageOnAttack, turns });
  // a fracture on a frozen card shatters the ice at once
  if (d.status.frosts.length) shatter(c, d, 'fracture');
}

// Before its strikes: a chance to get hurt. Iterates the live list on purpose (legacy).
export function selfFracture(c: Combat, { a, d, ia }: Attack): Flow {
  for (const f of a.status.fractures) {
    if (roll(c, f.chance)) {
      const n = damage(c, d, a, f.damage);
      emit(c, { type: 'damaged', side: ia, amount: n, cause: 'selfFracture' });
    }
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

export function fractureEffect({ c, e, statusTarget }: EffectContext): void {
  fracture(c, statusTarget(), e.fchance || 0, e.degfrac || 0, e.tours || 1);
}

export function fractureOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) fracture(c, d, q.fchance || 0, q.degfrac || 0, q.tours || 1);
}

// Its effects (the registry of effects.ts).
export const effects = {
  fracture: { run: fractureEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
