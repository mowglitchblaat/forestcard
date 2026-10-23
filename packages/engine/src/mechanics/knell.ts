// The Knell (le Glas): the ultimate anti-survival status. An ominous shadow rises on the HP bar of
// the card it tolls for, from the left: at the start of each of the card's turns it grows by its
// speed (`glasv`, % of max HP per turn). As soon as the card's HP are under the shadow, the knell
// tolls: the card dies, with no avoid-death and no revive.
//   - Laid again, it speeds up, less and less: +1/2 of the new speed, then +1/4, +1/8…
//   - A purification breaks one of its 3 skulls and pushes the shadow back by a third; the 3rd
//     purification lifts it. Laid again, its skulls are back to 3.
//   - Checked when the shadow grows and after every damage the card takes.
//
// Laid by: a passive or a basic attack effect (glas: `chance` % on each hit), an effect (glas_effet:
// magic, ultimate, trap).

import { emit, id, opponent, roll, type Combat } from '../combat/combat.ts';
import { damage } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData, Num } from '../model/card.ts';

export type Knell = { threshold: number; speed: number; tolls: number; skulls: number };

// Its part of a card's status (combat/state.ts).
export type KnellState = {
  knell: Knell | null;
};
export const knellState = (): KnellState => ({ knell: null });

const pct = (v: Num | undefined): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const round1 = (n: number): number => Math.round(n * 10) / 10;

// The knell tolls for d (or tolls again, faster).
export function toll(c: Combat, d: Side, speed: number): void {
  if (d.hp <= 0 || speed <= 0) return;
  const k = d.status.knell;
  if (!k) d.status.knell = { threshold: 0, speed: round1(speed), tolls: 1, skulls: 3 };
  else {
    k.speed = round1(k.speed + speed * 0.5 ** k.tolls);
    k.tolls++;
    k.skulls = 3;
  }
  const now = d.status.knell as Knell;
  emit(c, { type: 'knellLaid', side: id(c, d), speed: now.speed, stacked: !!k });
}

// HP under the shadow: the card is taken.
export function knellCheck(c: Combat, s: Side): void {
  const k = s.status.knell;
  if (!k || s.hp <= 0 || k.threshold <= 0) return;
  if (s.hp > Math.ceil((s.maxHp * k.threshold) / 100)) return;
  emit(c, { type: 'knelled', side: id(c, s) });
  c.knelling = 1;
  c.noRevive = 1;
  try {
    const n = damage(c, opponent(c, s), s, s.hp);
    emit(c, { type: 'damaged', side: id(c, s), amount: n, cause: 'knell' });
  } finally {
    c.knelling = 0;
    c.noRevive = 0;
  }
}

// Start of its turn: the shadow rises, then may take it.
export function knellRises(c: Combat, s: Side): Flow {
  const k = s.status.knell;
  if (!k || s.hp <= 0) return undefined;
  k.threshold = Math.min(100, round1(k.threshold + k.speed));
  emit(c, { type: 'knellRose', side: id(c, s), threshold: k.threshold });
  knellCheck(c, s);
  return s.hp <= 0 ? 'stop' : undefined;
}

// A purification: one skull breaks, the shadow goes back by a third; the 3rd lifts the knell.
// Returns true when the knell is gone.
export function knellPurified(c: Combat, s: Side): boolean {
  const k = s.status.knell;
  if (!k) return false;
  k.skulls--;
  if (k.skulls <= 0) {
    s.status.knell = null;
    return true;
  }
  k.threshold = round1((k.threshold * 2) / 3);
  emit(c, { type: 'knellReceded', side: id(c, s), threshold: k.threshold, skulls: k.skulls });
  return false;
}

export function knellEffect({ c, e, statusTarget }: EffectContext): void {
  toll(c, statusTarget(), pct(e.glasv));
}

export function knellOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) toll(c, d, pct(q.glasv));
}

// Its effects (the registry of effects.ts).
export const effects = {
  glas_effet: { run: knellEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
