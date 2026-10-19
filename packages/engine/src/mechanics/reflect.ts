// Reflect: a share of the damage taken goes back to the attacker. Comes from passives (renvoi, a
// share of each hit) and from reflect effects (renvoi, a percent for its turns, counted on the
// card's turns). Applies to strikes and breaths; a reflected missile flies back (effects.ts).

import type { Attack, Strike } from '../combat/attack.ts';
import { damage } from '../combat/damage.ts';
import { amount, emit, id, over, raw, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Num } from '../model/card.ts';
import type { Flow, StrikeFlow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';

export type Reflect = { pct: Num; turns: number };

// Its part of a card's status (combat/state.ts).
export type ReflectState = {
  reflects: Reflect[];
};
export const reflectState = (): ReflectState => ({ reflects: [] });

// Each strike, after it hit: passives, then effects. The attacker down or the combat over ends the
// attack.
export function reflected(c: Combat, { a, d, ia, idd }: Attack, st: Strike): StrikeFlow {
  d.passives
    .filter((p) => p.type === 'renvoi')
    .forEach((p) => {
      if (st.n > 0) {
        const back = damage(c, d, a, amount(p, st.n));
        emit(c, { type: 'damaged', side: ia, amount: back, cause: 'reflect', from: idd });
      }
    });
  d.status.reflects.forEach((R) => {
    const back = damage(c, d, a, (st.n * raw(R.pct)) / 100);
    if (back > 0) emit(c, { type: 'damaged', side: ia, amount: back, cause: 'reflect', from: idd });
  });
  if (a.hp <= 0 || over(c)) return 'stop';
  return undefined;
}

// What d would reflect of n damage (passives and reflect effects), without dealing it.
export function reflectTotal(d: Side, n: number): number {
  if (n <= 0) return 0;
  let total = 0;
  d.passives.filter((p) => p.type === 'renvoi').forEach((p) => (total += amount(p, n)));
  d.status.reflects.forEach((R) => (total += (n * raw(R.pct)) / 100));
  return round(total);
}

// d reflects onto a a part of the n damage it took (a breath).
export function reflect(c: Combat, d: Side, a: Side, n: number): void {
  if (n <= 0 || a.hp <= 0) return;
  d.passives
    .filter((p) => p.type === 'renvoi')
    .forEach((p) => {
      const back = damage(c, d, a, amount(p, n));
      emit(c, { type: 'damaged', side: id(c, a), amount: back, cause: 'reflect', from: id(c, d) });
    });
  d.status.reflects.forEach((R) => {
    const back = damage(c, d, a, (n * raw(R.pct)) / 100);
    if (back > 0)
      emit(c, { type: 'damaged', side: id(c, a), amount: back, cause: 'reflect', from: id(c, d) });
  });
}

// End of its turn.
export function reflectsEnd(_c: Combat, s: Side): Flow {
  s.status.reflects = s.status.reflects.filter((r) => --r.turns > 0);
  return undefined;
}

export function reflectEffect({ e, o, onUndo }: EffectContext): void {
  const reflectStatus: Reflect = { pct: e.val, turns: e.tours || 1 };
  o.status.reflects.push(reflectStatus);
  onUndo(() => {
    o.status.reflects = o.status.reflects.filter((z) => z !== reflectStatus);
  });
}

// Its effects (the registry of effects.ts).
export const effects = {
  renvoi: { run: reflectEffect },
} satisfies EffectRules;
