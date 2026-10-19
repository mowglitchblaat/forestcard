// Trap immunity (insensible_piege): the opponent's trap cannot fire on the card for X of its turns;
// a trap it blocked re-arms when the immunity ends, if it can still fire.

import { emit, id, opponent, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';

// Its part of a card's status (combat/state.ts).
export type TrapImmunityState = {
  trapImmunityTurns: number;
};
export const trapImmunityState = (): TrapImmunityState => ({ trapImmunityTurns: 0 });

export function trapImmunityEffect({ e, o, onUndo }: EffectContext): void {
  o.status.trapImmunityTurns = e.tours || 1;
  onUndo(() => {
    o.status.trapImmunityTurns = 0;
  });
}

// End of its turn.
export function trapImmunityEnd(c: Combat, s: Side): Flow {
  if (s.status.trapImmunityTurns > 0 && --s.status.trapImmunityTurns === 0) {
    const x = opponent(c, s);
    const payload = x.trap.effet;
    if (
      x.trapBlocked &&
      x.trapActive &&
      payload &&
      x.trapTriggers < (payload.declenchements || 1)
    ) {
      x.trapBlocked = 0;
      emit(c, { type: 'trapRearmed', side: id(c, x) });
    }
  }
  return undefined;
}

// Its effects (the registry of effects.ts).
export const effects = {
  insensible_piege: { run: trapImmunityEffect },
} satisfies EffectRules;
