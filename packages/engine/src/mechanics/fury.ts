// Incandescent fury (fureur incandescente, Feu, skill of October 2026): each time the card loses HP,
// its strikes grow stronger (+ a % of its ATQ, the level table's fureurPct, 5 by default, up to
// fureurMax, 50 by default); each time it heals, it loses one of those gains.
// A passive, or an effect (magic: while the magic acts; trap: until the end of the combat).
// Every HP loss counts (strikes, statuses, direct damage); every heal takes one gain back.

import { emit, id, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Side } from '../combat/state.ts';

// Its part of a card's status (combat/state.ts): the gains, and the effects giving the skill.
export type FuryState = {
  fury: number; // gains (each fureurPct % of ATQ)
  furyGiven: number; // effects giving the skill (magic, trap)
};
export const furyState = (): FuryState => ({ fury: 0, furyGiven: 0 });

const hasFury = (s: Side): boolean =>
  s.status.furyGiven > 0 || s.passives.some((p) => p.type === 'fureur_incandescente');

const maxGains = (c: Combat): number =>
  c.levels.fureurPct > 0 ? Math.floor(c.levels.fureurMax / c.levels.fureurPct) : 0;

// The bonus of its strikes.
export const furyBonus = (c: Combat, a: Side): number =>
  a.status.fury > 0 ? Math.max(0, round((a.atq * a.status.fury * c.levels.fureurPct) / 100)) : 0;

// The card lost HP (combat/damage.ts): one gain more, shown right after the damage line.
export function furyOnLoss(c: Combat, s: Side): void {
  if (!hasFury(s) || s.hp <= 0) return;
  if (s.status.fury >= maxGains(c)) return;
  c.pendingEffects.push(() => {
    if (s.hp <= 0 || s.status.fury >= maxGains(c)) return;
    s.status.fury++;
    emit(c, {
      type: 'furyChanged',
      side: id(c, s),
      pct: s.status.fury * c.levels.fureurPct,
      up: true,
    });
  });
}

// The card healed (combat/damage.ts): one gain less.
export function furyOnHeal(c: Combat, s: Side): void {
  if (s.status.fury <= 0) return;
  s.status.fury--;
  emit(c, {
    type: 'furyChanged',
    side: id(c, s),
    pct: s.status.fury * c.levels.fureurPct,
    up: false,
  });
}

export function furyEffect({ c, o, onUndo }: EffectContext): void {
  o.status.furyGiven++;
  emit(c, { type: 'furyGiven', side: id(c, o) });
  onUndo(() => {
    o.status.furyGiven = Math.max(0, o.status.furyGiven - 1);
    if (!hasFury(o) && o.status.fury) {
      o.status.fury = 0;
      emit(c, { type: 'furyChanged', side: id(c, o), pct: 0, up: false });
    }
  });
}

// Its effects (the registry of effects.ts).
export const effects = {
  fureur_incandescente: { run: furyEffect },
} satisfies EffectRules;
