// Several strikes in one attack:
//   - multiple strikes (passive multi_frappe): with its chance, `frappes` strikes instead of one;
//   - chain (passive, or attack effect enchainement): after the strikes, retries for one more, and
//     again after each extra one, until the first failure (`max` extra strikes, 10 by default).

import type { Attack } from '../combat/attack.ts';
import { raw, roll, type Combat } from '../combat/combat.ts';
import type { Flow } from '../combat/flow.ts';

export function multiStrike(c: Combat, at: Attack): Flow {
  at.a.passives
    .filter((p) => p.type === 'multi_frappe')
    .forEach((p) => {
      if (roll(c, p.chance)) at.strikes += Math.max(0, (p.frappes || 1) - 1);
    });
  return undefined;
}

// Each source retries on its own; the extra strikes come after the announced ones.
export function chain(c: Combat, at: Attack): Flow {
  let extra = 0;
  [
    ...at.a.passives.filter((p) => p.type === 'enchainement'),
    ...at.a.status.attackEffects.filter((q) => q.type === 'enchainement'),
  ].forEach((q) => {
    const cap = raw(q.max) > 0 ? raw(q.max) : 10;
    let n = 0;
    while (n < cap && roll(c, q.chance)) n++;
    extra += n;
  });
  at.strikes += extra;
  at.base = at.strikes - extra;
  return undefined;
}
