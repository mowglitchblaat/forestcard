// Double damage (double_degats): the card's strikes deal twice its ATQ for its turns, counted on
// the card's turns.

import { emit, id, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';

// Its part of a card's status (combat/state.ts).
export type DoubleDamageState = {
  doubleDamageTurns: number;
};
export const doubleDamageState = (): DoubleDamageState => ({ doubleDamageTurns: 0 });

export const damageFactor = (a: Side): number => (a.status.doubleDamageTurns > 0 ? 2 : 1);

// End of its turn.
export function doubleDamageEnd(_c: Combat, s: Side): Flow {
  if (s.status.doubleDamageTurns > 0) s.status.doubleDamageTurns--;
  return undefined;
}

export function doubleDamageEffect({ c, e, o, onUndo }: EffectContext): void {
  o.status.doubleDamageTurns = e.tours || 1;
  onUndo(() => {
    o.status.doubleDamageTurns = 0;
  });
  emit(c, { type: 'damageDoubled', side: id(c, o) });
}

// Its effects (the registry of effects.ts).
export const effects = {
  double_degats: { run: doubleDamageEffect },
} satisfies EffectRules;
