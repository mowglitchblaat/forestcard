// Cancelled attack, blocked attack, damage reduction.
//   - cancelled (annule_attaque): the card's next attack does not happen at all;
//   - blocked (bloque_attaque): it happens and lands at 0 damage, its statuses and marks (execution,
//     swallowing) still apply; a breath or a missile it blocks deals no damage. Options: `nbbloque`,
//     only the first X strikes of the attack are blocked (empty or 0: the whole attack); `riposte`,
//     once, on the first strike (breath, missile) it blocks: `renvoi` sends `pctriposte` % of the
//     blocked damage back to the attacker, `statut` lays a status on it (`rstatut`, `sval`, `tours`,
//     `reducsoin`; `aleatoire` drawn then), each with its `chance` (100 % when empty);
//   - reduction (passive reduc_degats): each passive, with its chance, takes a share off a strike,
//     a breath or a missile; a strike reduced to 0 counts as blocked.

import type { Attack } from '../combat/attack.ts';
import { amount, emit, id, over, raw, roll, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow, StrikeFlow } from '../combat/flow.ts';
import type { Strike } from '../combat/attack.ts';
import type { Side } from '../combat/state.ts';
import { damage } from '../combat/damage.ts';
import { applyEffect } from '../combat/effects.ts';
import type { EffectData } from '../model/card.ts';
import { ELEMENTS, elementStatus } from './breath.ts';

// What a block sends back to the attacker, once (bloque_attaque's `riposte` option).
export type BlockRiposte = {
  strikes: number; // strikes blocked (Infinity: the whole attack)
  kind: 'renvoi' | 'statut' | null; // null: no riposte
  pct: number; // renvoi: % of the blocked damage
  status: string; // statut: a key of ELEMENTS, `etourdi` or `aleatoire`
  chance: number; // %
  data: EffectData; // the effect's data (status value and turns)
};

// Its part of a card's status (combat/state.ts).
export type BlockState = {
  nextAttackCancelled: number;
  nextAttackBlocked: number; // the attack lands at 0 damage, its statuses and marks still apply (legacy: blk)
  blockRiposte: BlockRiposte | null; // the options of that block (null: the whole attack, no riposte)
};
export const blockState = (): BlockState => ({
  nextAttackCancelled: 0,
  nextAttackBlocked: 0,
  blockRiposte: null,
});

// The block's options, taken by what it blocks (attack, breath, missile).
function takeBlock(a: Side): BlockRiposte | null {
  const r = a.status.blockRiposte;
  a.status.nextAttackBlocked = 0;
  a.status.blockRiposte = null;
  return r;
}

// d, which blocked, ripostes against a: n is the damage the block took (before it). Its rolls are in
// its own branch: a block without riposte draws nothing.
export function riposte(c: Combat, d: Side, a: Side, n: number, r: BlockRiposte | null): void {
  if (!r || !r.kind || a.hp <= 0 || d.hp <= 0) return;
  if (r.chance < 100 && !roll(c, r.chance)) return;
  emit(c, { type: 'blockRiposte', side: id(c, d), target: id(c, a), kind: r.kind });
  if (r.kind === 'renvoi') {
    if (n <= 0 || r.pct <= 0) return;
    const back = damage(c, d, a, (n * r.pct) / 100);
    if (back > 0) emit(c, { type: 'damaged', side: id(c, a), amount: back, cause: 'reflect', from: id(c, d) });
    return;
  }
  const status =
    r.status === 'aleatoire'
      ? (ELEMENTS[Math.floor(c.random() * ELEMENTS.length)] as string)
      : r.status;
  const turns = Math.max(1, parseInt(String(r.data.tours), 10) || 2);
  const effect: EffectData =
    status === 'etourdi'
      ? { type: 'etourdir_effet', ciblem: 'adversaire', chance: 100, tours: turns }
      : elementStatus(ELEMENTS.includes(status) ? status : 'brulure', r.data);
  applyEffect(c, effect, d, a);
}

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
  if (at.blocked) {
    at.riposte = takeBlock(at.a);
    if (at.riposte) at.blockStrikes = at.riposte.strikes;
  }
  return undefined;
}

// A breath or a missile of a: blocked? Takes the block and returns its options (the caller runs the
// riposte once its blocked line is out); undefined when not blocked.
export function blockedShot(a: Side): { riposte: BlockRiposte | null } | undefined {
  if (!(a.status.nextAttackBlocked > 0)) return undefined;
  return { riposte: takeBlock(a) };
}

// Each strike, before it hits.
export function blockOrReduce(c: Combat, at: Attack, st: Strike): StrikeFlow {
  const { a, d, ia, idd, blocked } = at;
  if (blocked && st.k < at.blockStrikes) {
    const n = st.n;
    st.n = 0;
    emit(c, { type: 'attackBlocked', side: ia, defender: idd });
    const r = at.riposte;
    at.riposte = null; // once, on the first strike it blocks
    riposte(c, d, a, n, r);
    if (a.hp <= 0 || over(c)) return 'stop';
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

export function blockAttackEffect({ c, e, x }: EffectContext): void {
  x.status.nextAttackBlocked = 1;
  const strikes = parseInt(String(e.nbbloque), 10) || 0;
  const kind = e.riposte === 'renvoi' || e.riposte === 'statut' ? e.riposte : null;
  x.status.blockRiposte =
    strikes > 0 || kind
      ? {
          strikes: strikes > 0 ? strikes : Infinity,
          kind,
          pct: +raw(e.pctriposte) || 0,
          status: String(e.rstatut || 'brulure'),
          chance: e.chance == null || e.chance === '' ? 100 : +e.chance || 0,
          data: e,
        }
      : null;
  emit(c, { type: 'nextAttackBlocked', side: id(c, x) });
}

// Its effects (the registry of effects.ts).
export const effects = {
  annule_attaque: { run: cancelAttackEffect, withoutTarget: true, undoesStatuses: 'opponent' },
  bloque_attaque: { run: blockAttackEffect, withoutTarget: true, undoesStatuses: 'opponent' },
} satisfies EffectRules;
