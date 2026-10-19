// Cancelled attack, blocked attack, damage reduction.
//   - cancelled (annule_attaque): the card's next attack does not happen at all;
//   - blocked (bloque_attaque): it happens and lands at 0 damage, its statuses and marks (execution,
//     swallowing) still apply; a breath or a missile it blocks deals no damage;
//   - reduction (passive reduc_degats): each passive, with its chance, takes a share off a strike,
//     a breath or a missile; a strike reduced to 0 counts as blocked.

import type { Attack } from '../combat/attack.ts';
import { amount, emit, id, roll, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow, StrikeFlow } from '../combat/flow.ts';
import type { Strike } from '../combat/attack.ts';
import type { Side } from '../combat/state.ts';

// Its part of a card's status (combat/state.ts).
export type BlockState = {
  nextAttackCancelled: number;
  nextAttackBlocked: number; // the attack lands at 0 damage, its statuses and marks still apply (legacy: blk)
};
export const blockState = (): BlockState => ({ nextAttackCancelled: 0, nextAttackBlocked: 0 });

// Can it attack: a cancelled attack stops here.
export function cancelled(c: Combat, { a, ia, d }: Attack): Flow {
  if (!a.status.nextAttackCancelled) return undefined;
  a.status.nextAttackCancelled = 0;
  emit(c, { type: 'attackCancelled', side: ia, defender: id(c, d) });
  return 'stop';
}

// Can it attack: a blocked attack goes on, every strike at 0 damage.
export function blockedAttack(_c: Combat, at: Attack): Flow {
  at.blocked = at.a.status.nextAttackBlocked > 0;
  if (at.blocked) at.a.status.nextAttackBlocked = 0;
  return undefined;
}

// Each strike, before it hits.
export function blockOrReduce(c: Combat, { d, ia, idd, blocked }: Attack, st: Strike): StrikeFlow {
  if (blocked) {
    st.n = 0;
    emit(c, { type: 'attackBlocked', side: ia, defender: idd });
  } else
    d.passives
      .filter((p) => p.type === 'reduc_degats')
      .forEach((p) => {
        if (roll(c, p.chance)) {
          emit(c, { type: 'damageReduced', side: idd });
          st.n = Math.max(0, st.n - amount(p, st.n));
          if (st.n <= 0) st.blocked = true;
        }
      });
  return undefined;
}

// The reduction passives on a breath or a missile, each with its chance.
export function reduce(c: Combat, d: Side, n: number): number {
  d.passives
    .filter((p) => p.type === 'reduc_degats')
    .forEach((p) => {
      if (n > 0 && roll(c, p.chance)) {
        emit(c, { type: 'damageReduced', side: id(c, d) });
        n = Math.max(0, n - amount(p, n));
      }
    });
  return n;
}

export function cancelAttackEffect({ c, x }: EffectContext): void {
  x.status.nextAttackCancelled = 1;
  emit(c, { type: 'nextAttackCancelled', side: id(c, x) });
}

export function blockAttackEffect({ c, x }: EffectContext): void {
  x.status.nextAttackBlocked = 1;
  emit(c, { type: 'nextAttackBlocked', side: id(c, x) });
}

// Its effects (the registry of effects.ts).
export const effects = {
  annule_attaque: { run: cancelAttackEffect, withoutTarget: true, undoesStatuses: 'opponent' },
  bloque_attaque: { run: blockAttackEffect, withoutTarget: true, undoesStatuses: 'opponent' },
} satisfies EffectRules;
