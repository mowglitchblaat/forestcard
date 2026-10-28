// Poison skills (October 2026):
//   - Toxic leech (sangsue toxique): at each poison tick the opponent takes, the card heals a % of
//     that tick's damage, by the poison's level (level table: sangsue, 20 / 35 / 50 %). Every poison
//     on the opponent counts, whoever laid it. The heal is a heal: a bleed reduces it, and so on.
//     A passive, or an effect (magic, trap) for `tours` of the card's turns (2 when empty).
//   - Virulent injection (injection virulente): an effect. On an opponent without poison, it lays a
//     level I poison for 3 turns; on a poisoned one, the poison goes one level up (its turns stay);
//     on a level III poison, raw damage instead: a % (level table: injection, 50 by default) of the
//     poison damage left (tick × turns left), and the poison stays.

import { emit, id, opponent, round, type Combat } from '../combat/combat.ts';
import { damage, heal } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import { addLevels, at, MAX_LEVEL } from '../model/levels.ts';
import { damageOverTime, dotAmount, dotValue, type DamageOverTime } from './dot.ts';

export const INJECTION_TURNS = 3;

// Its part of a card's status (combat/state.ts): turns left of a leech given by an effect.
export type VenomState = {
  leechTurns: number;
};
export const venomState = (): VenomState => ({ leechTurns: 0 });

const leeches = (s: Side): boolean =>
  s.status.leechTurns > 0 || s.passives.some((p) => p.type === 'sangsue_toxique');

// A poison tick of n damage on s (mechanics/dot.ts): its opponent may leech it.
export function leechTick(c: Combat, s: Side, dot: DamageOverTime, n: number): void {
  const o = opponent(c, s);
  if (n <= 0 || o.hp <= 0 || !leeches(o)) return;
  const pct = at(c.levels.sangsue, dot.level);
  const amount = round((n * pct) / 100);
  if (amount <= 0) return;
  emit(c, { type: 'poisonLeeched', side: id(c, o), target: id(c, s), pct, amount });
  heal(c, o, amount);
}

export function leechEffect({ c, e, o, onUndo }: EffectContext): void {
  const turns = Math.max(1, Math.floor(+(e.tours ?? 0) || 2));
  o.status.leechTurns = Math.max(o.status.leechTurns, turns);
  emit(c, { type: 'leechGiven', side: id(c, o), turns: o.status.leechTurns });
  onUndo(() => {
    o.status.leechTurns = 0;
  });
}

// End of its turn: a leech given by an effect counts down.
export function leechEnd(c: Combat, s: Side): Flow {
  if (s.status.leechTurns > 0 && --s.status.leechTurns <= 0)
    emit(c, { type: 'leechEnded', side: id(c, s) });
  return undefined;
}

export function injectionEffect({ c, o, x }: EffectContext): void {
  if (x.hp <= 0) return;
  const poison = x.status.dots.find((z) => z.kind === 'poison');
  if (!poison) {
    emit(c, { type: 'venomInjected', side: id(c, o), target: id(c, x), result: 'laid' });
    damageOverTime(c, x, 'poison', 1, INJECTION_TURNS);
    return;
  }
  if (poison.level < MAX_LEVEL) {
    poison.level = addLevels(poison.level, 1);
    emit(c, { type: 'venomInjected', side: id(c, o), target: id(c, x), result: 'raised' });
    emit(c, {
      type: 'dotApplied',
      side: id(c, x),
      kind: 'poison',
      stacked: true,
      level: poison.level,
      value: dotValue(c, 'poison', poison.level),
      turns: poison.turns,
    });
    return;
  }
  const left = dotAmount(c, x, poison) * Math.max(0, poison.turns);
  const raw = round((left * c.levels.injection) / 100);
  emit(c, { type: 'venomInjected', side: id(c, o), target: id(c, x), result: 'burst' });
  const n = damage(c, o, x, raw);
  emit(c, { type: 'damaged', side: id(c, x), amount: n, cause: 'venom' });
}

// Its effects (the registry of effects.ts).
export const effects = {
  sangsue_toxique: { run: leechEffect },
  injection_virulente: { run: injectionEffect, withoutTarget: true },
} satisfies EffectRules;
