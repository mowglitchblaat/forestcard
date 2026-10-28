// Double damage (double_degats): the card's strikes deal twice its ATQ for its turns, counted on
// the card's turns. Since 28 October 2026 they stack: each one running doubles again (×2, ×4, ×8…),
// each with its own turns.

import { emit, id, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';

// One double damage running: its turns left.
export type Doubling = { turns: number };

// Its part of a card's status (combat/state.ts): the double damages running.
export type DoubleDamageState = {
  doublings: Doubling[];
};
export const doubleDamageState = (): DoubleDamageState => ({ doublings: [] });

// How many double damages are running.
export const doublingsOf = (a: Side): number =>
  a.status.doublings.filter((d) => d.turns > 0).length;
export const damageFactor = (a: Side): number => 2 ** doublingsOf(a);

// End of its turn.
export function doubleDamageEnd(_c: Combat, s: Side): Flow {
  s.status.doublings.forEach((d) => d.turns--);
  s.status.doublings = s.status.doublings.filter((d) => d.turns > 0);
  return undefined;
}

export function doubleDamageEffect({ c, e, o, onUndo }: EffectContext): void {
  const doubling: Doubling = { turns: Math.max(1, Math.floor(+(e.tours ?? 0) || 1)) };
  o.status.doublings.push(doubling);
  // A magic cancelled, destroyed or stolen takes back its own double damage only.
  onUndo(() => {
    o.status.doublings = o.status.doublings.filter((d) => d !== doubling);
  });
  emit(c, { type: 'damageDoubled', side: id(c, o), factor: damageFactor(o) });
}

// Its effects (the registry of effects.ts).
export const effects = {
  double_degats: { run: doubleDamageEffect },
} satisfies EffectRules;
