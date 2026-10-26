// Damage reduction given by an effect (reduc_degats: magic, ultimate, trap): for X turns of the card
// (empty or 0: the whole combat), each strike, breath or missile it takes has X % of chances (100
// when empty) to be reduced by `val` % (or `val` points with `u` 'pts'). Several protections each
// roll. A magic's protection goes with the magic.

import { emit, id, raw, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';

export type Guard = { chance: number; value: number; points: boolean; turns: number };

// Its part of a card's status (combat/state.ts).
export type GuardState = {
  guards: Guard[];
};
export const guardState = (): GuardState => ({ guards: [] });

export function guardEffect({ c, e, o, onUndo }: EffectContext): void {
  const g: Guard = {
    chance: e.chance == null || e.chance === '' ? 100 : Math.max(0, +e.chance || 0),
    value: Math.max(0, +raw(e.val) || 0),
    points: e.u === 'pts',
    turns: Math.max(0, parseInt(String(e.tours), 10) || 0),
  };
  o.status.guards.push(g);
  emit(c, {
    type: 'reductionGranted',
    side: id(c, o),
    chance: g.chance,
    value: g.value,
    points: g.points,
    turns: g.turns,
  });
  onUndo(() => {
    if (!o.status.guards.includes(g)) return;
    o.status.guards = o.status.guards.filter((z) => z !== g);
    emit(c, { type: 'reductionEnded', side: id(c, o) });
  });
}

// Damage n coming at d: what is left after its protections.
export function guarded(c: Combat, d: Side, n: number): number {
  for (const g of d.status.guards) {
    if (n <= 0) break;
    if (g.chance < 100 && !roll(c, g.chance)) continue;
    n = Math.max(0, g.points ? n - g.value : round((n * (100 - Math.min(100, g.value))) / 100));
    emit(c, { type: 'damageReduced', side: id(c, d) });
  }
  return n;
}

// End of its turn: the protections count down.
export function guardsEnd(c: Combat, s: Side): Flow {
  if (!s.status.guards.length) return undefined;
  const gone = s.status.guards.filter((g) => g.turns > 0 && --g.turns === 0);
  if (gone.length) {
    s.status.guards = s.status.guards.filter((g) => !gone.includes(g));
    gone.forEach(() => emit(c, { type: 'reductionEnded', side: id(c, s) }));
  }
  return undefined;
}

// Its effects (the registry of effects.ts).
export const effects = {
  reduc_degats: { run: guardEffect },
} satisfies EffectRules;
