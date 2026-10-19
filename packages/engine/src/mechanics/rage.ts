// Rage: extra damage on the card's strikes for its turns, then a fatigue. Several rages add up.
//
// Laid by: an effect (rage).

import { amount, emit, id, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import { fatigue } from './fatigue.ts';

export type Rage = {
  bonus: number;
  turns: number;
  fatigueValue: number;
  fatigueUnit: string | undefined;
  fatigueTurns: number;
};

// Its part of a card's status (combat/state.ts).
export type RageState = {
  rages: Rage[];
};
export const rageState = (): RageState => ({ rages: [] });

// Extra damage of each strike.
export const rageBonus = (s: Side): number => s.status.rages.reduce((q, g) => q + g.bonus, 0);

// End of its turn, after the fatigues: an ended rage lays its fatigue for the next turns.
export function ragesEnd(c: Combat, s: Side): Flow {
  s.status.rages = s.status.rages.filter((rage) => {
    if (--rage.turns > 0) return true;
    emit(c, { type: 'statusEnded', side: id(c, s), status: 'rage' });
    if (rage.fatigueTurns > 0 && rage.fatigueValue > 0)
      fatigue(c, s, rage.fatigueValue, rage.fatigueUnit, rage.fatigueTurns, true);
    return false;
  });
  return undefined;
}

export function rageEffect({ c, e, o, onUndo, statusEnds }: EffectContext): void {
  const bonus = amount({ u: e.u, val: e.ragev || 0 }, o.atq);
  const turns = e.ragetours || 1;
  const rage: Rage = {
    bonus,
    turns,
    fatigueValue: e.fatval || 0,
    fatigueUnit: e.u,
    fatigueTurns: e.fattours || 0,
  };
  o.status.rages.push(rage);
  onUndo(() => {
    if (o.status.rages.includes(rage)) {
      o.status.rages = o.status.rages.filter((z) => z !== rage);
      if (!o.status.rages.length) statusEnds(o, 'rage');
    }
  });
  emit(c, { type: 'rageStarted', side: id(c, o), bonus, turns });
}

// Its effects (the registry of effects.ts).
export const effects = {
  rage: { run: rageEffect },
} satisfies EffectRules;
