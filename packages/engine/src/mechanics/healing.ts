// Healing: at once (soin), over the card's next turns (soin_tours, a regeneration that heals at the
// start of each of its turns), or on each of its turns (passive soin_tour). A bleed reduces every
// heal (damage.ts).

import { amount, emit, id, type Combat } from '../combat/combat.ts';
import { heal } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';

export type Regen = { amount: number; turns: number };

// Its part of a card's status (combat/state.ts).
export type HealingState = {
  regens: Regen[];
};
export const healingState = (): HealingState => ({ regens: [] });

export function healEffect({ c, e, o }: EffectContext): void {
  heal(c, o, amount(e, o.maxHp));
}

export function regenEffect({ c, e, o, fromMagic }: EffectContext): void {
  const n = amount(e, o.maxHp);
  const turns = e.tours || 1;
  const regen: Regen = { amount: n, turns };
  o.status.regens.push(regen);
  if (fromMagic)
    o.magicDeltas.push({
      undo: () => {
        o.status.regens = o.status.regens.filter((z) => z !== regen);
      },
    });
  emit(c, { type: 'regenStarted', side: id(c, o), amount: n, turns });
}

// Start of its turn: each regeneration heals, then counts down.
export function regensAtStart(c: Combat, s: Side): Flow {
  s.status.regens = s.status.regens.filter((regen) => {
    if (s.hp <= 0) return false;
    heal(c, s, regen.amount);
    if (--regen.turns > 0) return true;
    emit(c, { type: 'regenEnded', side: id(c, s) });
    return false;
  });
  if (s.hp <= 0) return 'stop';
  return undefined;
}

// "Every turn" passive.
export function healEveryTurn(c: Combat, s: Side, p: EffectData): void {
  heal(c, s, amount(p, s.maxHp));
}

// Its effects (the registry of effects.ts).
export const effects = {
  soin: { run: healEffect, once: true },
  soin_tours: { run: regenEffect },
} satisfies EffectRules;
