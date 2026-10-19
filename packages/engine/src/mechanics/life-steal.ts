// Life steal:
//   - passive vol_pct_atq: with its chance, a strike that dealt damage heals a percent of it;
//   - effect vol_vie: direct damage, healed back in full.
// (A transcendence's own life steal lives with the transcendence.)

import type { Attack, Strike } from '../combat/attack.ts';
import { damage, heal } from '../combat/damage.ts';
import { emit, id, raw, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { StrikeFlow } from '../combat/flow.ts';

// A strike that landed and dealt damage.
export function lifeStealOnHit(c: Combat, { a }: Attack, st: Strike): StrikeFlow {
  if (st.n > 0)
    a.passives
      .filter((p) => p.type === 'vol_pct_atq')
      .forEach((p) => {
        if (roll(c, p.chance)) heal(c, a, round((st.n * raw(p.pctatq)) / 100));
      });
  return undefined;
}

export function lifeStealEffect({ c, e, o, x }: EffectContext): void {
  const n = damage(c, o, x, raw(e.val));
  emit(c, { type: 'damaged', side: id(c, x), amount: n, cause: 'lifeSteal' });
  heal(c, o, n);
}

// Its effects (the registry of effects.ts).
export const effects = {
  vol_vie: { run: lifeStealEffect, once: true },
} satisfies EffectRules;
