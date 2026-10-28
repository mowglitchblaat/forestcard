// Lightning mark (marque de foudre, Foudre, rework of October 2026): a mark in levels on the opponent.
//   - Laid by a Foudre fighter (passive foudre: `chance` % on each strike), a magic giving it to the
//     basic attack (atk_foudre), or an effect laying one level at once (marque_foudre).
//   - Level I: the next strike the marked card takes is amplified (level table: foudre, +40 % by
//     default), once.
//   - Level II: lightning bounces twice towards the marked card's magic and trap slots (first the
//     magic, then the trap): a card hit is charged; a charged card hit again is destroyed. After the
//     two bounces the mark goes back to zero. A slot with no live card lets its bounce go.
//   - The charge stays on the card itself: a stolen magic or trap keeps it.
// A mark, not a status, but it is purified; a molt removes it; a mist neither takes nor sends it back.

import type { Attack, Strike } from '../combat/attack.ts';
import { emit, id, opponent, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import { applyEffect } from '../combat/effects.ts';
import type { StrikeFlow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { Card, EffectData } from '../model/card.ts';

export type LightningMark = { level: number; primed: boolean };

// Its part of a card's status (combat/state.ts): the mark on the fighter, and the magic or trap
// cards this side charged on the opponent (looked up on both sides: a charge follows its card).
export type LightningState = {
  lightning: LightningMark | null;
  chargedCards: Card[];
};
export const lightningState = (): LightningState => ({ lightning: null, chargedCards: [] });

const charged = (c: Combat, card: Card): boolean =>
  c.sides.some((s) => s.status.chargedCards.includes(card));
const discharge = (c: Combat, card: Card) =>
  c.sides.forEach((s) => {
    s.status.chargedCards = s.status.chargedCards.filter((k) => k !== card);
  });

// One bounce towards a slot of x (laid by o).
function bounce(c: Combat, o: Side, x: Side, slot: 'magie' | 'piege'): void {
  const live = slot === 'magie' ? !!(x.magicActive || x.magicCancelTurns) : !!x.trapActive;
  const card = slot === 'magie' ? x.magic : x.trap;
  if (!live || card.vide) {
    emit(c, { type: 'lightningBounced', side: id(c, x), slot, result: 'empty' });
    return;
  }
  if (charged(c, card)) {
    discharge(c, card);
    emit(c, { type: 'lightningBounced', side: id(c, x), slot, result: 'destroyed' });
    applyEffect(c, { type: 'detruire', carte: slot }, o, x);
    return;
  }
  o.status.chargedCards.push(card);
  emit(c, { type: 'lightningBounced', side: id(c, x), slot, result: 'charged' });
}

// One level of mark on x, laid by o.
export function markLightning(c: Combat, o: Side, x: Side): void {
  if (x.hp <= 0) return;
  const m = x.status.lightning ?? { level: 0, primed: false };
  m.level++;
  x.status.lightning = m;
  if (m.level < 2) {
    m.primed = true;
    emit(c, { type: 'lightningMarked', side: id(c, x), level: m.level });
    return;
  }
  emit(c, { type: 'lightningMarked', side: id(c, x), level: 2 });
  bounce(c, o, x, 'magie');
  bounce(c, o, x, 'piege');
  x.status.lightning = null;
  emit(c, { type: 'lightningFaded', side: id(c, x) });
}

// Each strike, after a critical hit: a primed mark amplifies it, once.
export function lightningStrike(c: Combat, { d, ia, idd }: Attack, st: Strike): StrikeFlow {
  const m = d.status.lightning;
  if (!m || !m.primed || st.n <= 0 || d.hp <= 0) return undefined;
  m.primed = false;
  const bonus = round((st.n * c.levels.foudre) / 100);
  st.n += bonus;
  emit(c, { type: 'lightningStruck', side: ia, target: idd, bonus });
  return undefined;
}

// A purification or a molt: the mark on the fighter is gone (the charged cards keep their charge).
export function liftLightning(s: Side): boolean {
  const had = !!s.status.lightning;
  s.status.lightning = null;
  return had;
}

export function lightningOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) markLightning(c, opponent(c, d), d);
}

export function lightningEffect({ c, o, x }: EffectContext): void {
  markLightning(c, o, x);
}

// Its effects (the registry of effects.ts). atk_foudre: attack-effects.ts.
export const effects = {
  marque_foudre: { run: lightningEffect },
} satisfies EffectRules;
