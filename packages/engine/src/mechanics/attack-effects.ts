// Effects given to the card's basic attack by a magic, a trap or an ultimate (atk_brulure,
// atk_poison, atk_gel… and execution, atk_avalage): they act as the attack passives of the same name
// (mechanics of each status). A magic takes them back when it goes.

import { emit, id } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';

// Its part of a card's status (combat/state.ts).
export type AttackEffectsState = {
  attackEffects: EffectData[]; // effects given to the basic attack
};
export const attackEffectsState = (): AttackEffectsState => ({ attackEffects: [] });

// Gives an effect to the owner's basic attack; a magic takes it back when it goes.
export function grantAttackEffect(
  o: Side,
  attackEffect: EffectData,
  fromMagic: boolean | undefined,
): void {
  o.status.attackEffects.push(attackEffect);
  if (fromMagic)
    o.magicDeltas.push({
      undo: () => {
        o.status.attackEffects = o.status.attackEffects.filter((z) => z !== attackEffect);
      },
    });
}

// Effect atk_<passive>: the passive <passive> given to the basic attack.
export function attackEffectGrant({ c, e, o, fromMagic }: EffectContext): void {
  const attackEffect: EffectData = { ...e, type: (e.type as string).slice(4) };
  grantAttackEffect(o, attackEffect, fromMagic);
  emit(c, {
    type: 'attackEffectGranted',
    side: id(c, o),
    effect: attackEffect.type as string,
    chance: attackEffect.chance,
  });
}

// Its effects (the registry of effects.ts).
export const effects = {
  atk_fatigue: { run: attackEffectGrant },
  atk_detonation: { run: attackEffectGrant },
  atk_enchainement: { run: attackEffectGrant },
  atk_brulure: { run: attackEffectGrant },
  atk_poison: { run: attackEffectGrant },
  atk_etourdir: { run: attackEffectGrant },
  atk_saignement: { run: attackEffectGrant },
  atk_malediction: { run: attackEffectGrant },
  atk_fracture: { run: attackEffectGrant },
  atk_gel: { run: attackEffectGrant },
  atk_glas: { run: attackEffectGrant },
  atk_enracinement: { run: attackEffectGrant },
  atk_contamination: { run: attackEffectGrant },
  atk_cisaillement: { run: attackEffectGrant },
  atk_critique: { run: attackEffectGrant },
  atk_headshot: { run: attackEffectGrant },
} satisfies EffectRules;
