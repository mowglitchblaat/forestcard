// Counter (passive bonus_frappe): hit X times since its last turn, the card's next strike deals a
// bonus (a share of its ATQ, or points), once.

import { amount, emit, id, type Combat } from '../combat/combat.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';

// Its part of a card's status (combat/state.ts).
export type CounterState = {
  counterBonus: number;
};
export const counterState = (): CounterState => ({ counterBonus: 0 });

// Start of its turn: reads the hits taken since its last turn, then resets them.
export function counterAtStart(c: Combat, s: Side): Flow {
  s.passives.forEach((p) => {
    if (p.type === 'bonus_frappe' && s.hitsTaken >= (p.coups || 1)) {
      s.status.counterBonus = amount(p, s.atq);
      emit(c, { type: 'counterPrepared', side: id(c, s) });
    }
  });
  s.hitsTaken = 0;
  return undefined;
}

// A strike that hits d (dodged ones do not count).
export function countHit(d: Side): void {
  d.hitsTaken++;
}

// The bonus of the strike being struck; used once.
export function useCounterBonus(a: Side): number {
  const bonus = a.status.counterBonus;
  a.status.counterBonus = 0;
  return bonus;
}
