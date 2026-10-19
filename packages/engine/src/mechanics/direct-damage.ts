// Direct damage: at once (degats), or delayed (degats_tours: dealt to the opponent after X of its
// turns, at the end of its turn).

import { emit, id, raw, type Combat } from '../combat/combat.ts';
import { damage } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Num } from '../model/card.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';

export type DelayedDamage = { turns: number; amount: Num; source: Side };

// Its part of a card's status (combat/state.ts).
export type DirectDamageState = {
  delayedDamages: DelayedDamage[];
};
export const directDamageState = (): DirectDamageState => ({ delayedDamages: [] });

export function damageEffect({ c, e, o, x }: EffectContext): void {
  const n = damage(c, o, x, raw(e.val));
  emit(c, { type: 'damaged', side: id(c, x), amount: n, cause: 'direct' });
}

export function delayedDamageEffect({ e, o, x, onUndo }: EffectContext): void {
  const delayed: DelayedDamage = { turns: e.tours || 1, amount: e.val, source: o };
  x.status.delayedDamages.push(delayed);
  onUndo(() => {
    x.status.delayedDamages = x.status.delayedDamages.filter((z) => z !== delayed);
  });
}

// End of its turn: the delayed damage due.
export function delayedDamages(c: Combat, s: Side): Flow {
  s.status.delayedDamages = s.status.delayedDamages.filter((delayed) => {
    if (--delayed.turns > 0) return true;
    const n = damage(c, delayed.source, s, raw(delayed.amount));
    emit(c, { type: 'damaged', side: id(c, s), amount: n, cause: 'delayed' });
    return false;
  });
  return undefined;
}

// Its effects (the registry of effects.ts).
export const effects = {
  degats: { run: damageEffect, once: true },
  degats_tours: { run: delayedDamageEffect },
} satisfies EffectRules;
