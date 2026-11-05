// Dodge: a chance to avoid a strike, a breath or a missile, and everything it carries. Chances of
// the dodge passives and of the dodge bonus (esquive_mod) add up, capped by the rules
// (plafondEsquive).

import type { Attack } from '../combat/attack.ts';
import { emit, id, over, roll, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { StrikeFlow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import { frostDodgeMalus } from './frost.ts';
import { gagOnDodge } from './gag.ts';

// Its part of a card's status (combat/state.ts).
export type DodgeState = {
  dodgeBonus: number;
};
export const dodgeState = (): DodgeState => ({ dodgeBonus: 0 });

// Its dodge chance (passives, magics, a frost's malus), capped.
const dodgeChance = (c: Combat, d: Side): number =>
  Math.min(
    c.rules.plafondEsquive,
    d.passives.filter((p) => p.type === 'esquive').reduce((q, p) => q + (p.chance || 0), 0) +
      d.status.dodgeBonus -
      frostDodgeMalus(d), // a frozen card dodges less
  );

// One draw (if the chance is above 0): does d dodge? A stunned card cannot dodge (no draw).
export function dodges(c: Combat, d: Side): boolean {
  if (d.status.stunTurns > 0) {
    if (dodgeChance(c, d) > 0) emit(c, { type: 'stunnedCannot', side: id(c, d), what: 'dodge' });
    return false;
  }
  const chance = dodgeChance(c, d);
  return chance > 0 && roll(c, chance);
}

// Each strike, first: a dodge cancels the strike and its effects.
export function dodge(c: Combat, at: Attack): StrikeFlow {
  const { d, idd } = at;
  if (dodges(c, d)) {
    emit(c, { type: 'dodged', side: idd });
    // a gagged card slips on a banana: it takes a share of the strike anyway (mechanics/gag.ts)
    if (gagOnDodge(c, at) && (d.hp <= 0 || over(c))) return 'stop';
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
