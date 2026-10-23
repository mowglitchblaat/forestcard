// Dodge: a chance to avoid a strike, a breath or a missile, and everything it carries. Chances of
// the dodge passives and of the dodge bonus (esquive_mod) add up, capped by the rules
// (plafondEsquive).

import type { Attack } from '../combat/attack.ts';
import { emit, id, roll, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { StrikeFlow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import { cannotDodge } from './frost.ts';

// Its part of a card's status (combat/state.ts).
export type DodgeState = {
  dodgeBonus: number;
};
export const dodgeState = (): DodgeState => ({ dodgeBonus: 0 });

// One draw (if the chance is above 0): does d dodge?
export function dodges(c: Combat, d: Side): boolean {
  if (cannotDodge(d)) return false; // frost level 2 or more
  const chance = Math.min(
    c.rules.plafondEsquive,
    d.passives.filter((p) => p.type === 'esquive').reduce((q, p) => q + (p.chance || 0), 0) +
      d.status.dodgeBonus,
  );
  return chance > 0 && roll(c, chance);
}

// Each strike, first: a dodge cancels the strike and its effects.
export function dodge(c: Combat, { d, idd }: Attack): StrikeFlow {
  if (dodges(c, d)) {
    emit(c, { type: 'dodged', side: idd });
    return 'next';
  }
  return undefined;
}

export function dodgeEffect({ c, e, o, target: T, fromMagic }: EffectContext): void {
  const d = e.val || 0;
  T.status.dodgeBonus += d;
  if (fromMagic)
    o.magicDeltas.push({
      undo: () => {
        T.status.dodgeBonus -= d;
      },
    });
  emit(c, { type: 'dodgeChanged', side: id(c, T), delta: d });
}

// Its effects (the registry of effects.ts).
export const effects = {
  esquive_mod: { run: dodgeEffect },
} satisfies EffectRules;
