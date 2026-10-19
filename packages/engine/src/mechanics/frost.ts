// Frost: when the frozen card attacks, a chance its attack is cancelled, then a chance it is
// paralysed (two draws); chances of several frosts add up (100 % at most). Each frost lasts its
// turns, counted on the frozen card's turns.
//
// Laid by: an effect (gel), an attack (passive or attack effect gel).

import type { Attack } from '../combat/attack.ts';
import { emit, id, roll, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';

export type Frost = { cancelChance: number; stunChance: number; turns: number };

// Its part of a card's status (combat/state.ts).
export type FrostState = {
  frosts: Frost[];
};
export const frostState = (): FrostState => ({ frosts: [] });

export function freeze(
  c: Combat,
  d: Side,
  cancelChance: number,
  stunChance: number,
  turns: number,
): void {
  d.status.frosts.push({ cancelChance, stunChance, turns });
  emit(c, { type: 'frozen', side: id(c, d), cancelChance, stunChance, turns });
}

// Can it attack: cancelled, then paralysed.
export function frozen(c: Combat, { a, ia }: Attack): Flow {
  if (!a.status.frosts.length) return undefined;
  const cancelChance = Math.min(
    100,
    a.status.frosts.reduce((q, f) => q + f.cancelChance, 0),
  );
  const stunChance = Math.min(
    100,
    a.status.frosts.reduce((q, f) => q + f.stunChance, 0),
  );
  if (roll(c, cancelChance)) {
    emit(c, { type: 'cannotAttack', side: ia, reason: 'frozen' });
    return 'stop';
  }
  if (roll(c, stunChance)) {
    emit(c, { type: 'cannotAttack', side: ia, reason: 'paralysed' });
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

export function frostEffect({ c, e, statusTarget }: EffectContext): void {
  freeze(c, statusTarget(), e.annul || 0, e.stunch || 0, e.tours || 1);
}

export function frostOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) freeze(c, d, q.annul || 0, q.stunch || 0, q.tours || 1);
}

// Its effects (the registry of effects.ts).
export const effects = {
  gel: { run: frostEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
