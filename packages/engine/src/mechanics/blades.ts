// Shear (cisaillement, Vent, rework of October 2026): air blades laid on the opponent. Each laying is
// a packet of its own: `lames` blades (1 when empty) of `val` damage each (10 when empty), that strike
// together after `tours` of the target's turns (2 when empty): blades × damage, at the end of its
// turn, after the damage over time. The target may dodge them when they strike.
// A mark, not a status: neither purified, nor prolonged by a contamination, nor taken by a mist. A
// molt removes them. Their damage is direct damage, not an attack.
//
// Laid by: an effect (cisaillement), an attack (passive or attack effect cisaillement).

import { emit, id, opponent, over, raw, roll, type Combat } from '../combat/combat.ts';
import { damage } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData, Num } from '../model/card.ts';
import { dodges } from './dodge.ts';

export type BladePacket = { blades: number; damage: number; turns: number };

// Its part of a card's status (combat/state.ts): the packets laid on it.
export type BladesState = {
  blades: BladePacket[];
};
export const bladesState = (): BladesState => ({ blades: [] });

const num = (v: Num | undefined, d: number): number =>
  v == null || v === '' ? d : Math.max(0, +raw(v) || 0);

export function shear(c: Combat, d: Side, q: EffectData): void {
  if (d.hp <= 0) return;
  const packet: BladePacket = {
    blades: Math.max(1, Math.floor(num(q.lames, 1))),
    damage: num(q.val, 10),
    turns: Math.max(1, Math.floor(num(q.tours, 2))),
  };
  d.status.blades.push(packet);
  emit(c, {
    type: 'bladesLaid',
    side: id(c, d),
    blades: packet.blades,
    damage: packet.damage,
    turns: packet.turns,
    packets: d.status.blades.length,
  });
}

// End of its turn, after the damage over time: the packets count down; those due strike.
export function bladesTick(c: Combat, s: Side): Flow {
  for (const p of s.status.blades.slice()) {
    if (s.hp <= 0 || over(c)) return 'stop';
    if (!s.status.blades.includes(p) || --p.turns > 0) continue;
    s.status.blades = s.status.blades.filter((z) => z !== p);
    const total = p.blades * p.damage;
    const dodged = dodges(c, s);
    emit(c, { type: 'bladesStruck', side: id(c, s), blades: p.blades, total, dodged });
    if (!dodged) {
      const n = damage(c, opponent(c, s), s, total);
      emit(c, { type: 'damaged', side: id(c, s), amount: n, cause: 'blades' });
    }
  }
  if (s.hp <= 0) return 'stop';
  return undefined;
}

// A molt: the blades fall.
export function bladesMolt(s: Side): void {
  s.status.blades = [];
}

export function shearEffect({ c, e, statusTarget }: EffectContext): void {
  shear(c, statusTarget(), e);
}

export function shearOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) shear(c, d, q);
}

// Its effects (the registry of effects.ts).
export const effects = {
  cisaillement: { run: shearEffect },
} satisfies EffectRules;
