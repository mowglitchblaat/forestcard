// ATQ and HP: changed by an effect (atq_mod, pv_mod; a magic's change is undone when it goes),
// swapped between the cards (echange_atq, echange_pv, echange_tout) or on one card (echange_atq_def),
// grown every X turns (passives atq_tours, pv_tours).

import { amount, emit, id, raw, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';

export function atqEffect({ c, e, target: T, delta }: EffectContext): void {
  const d = amount(e, T.atq);
  T.atq = Math.max(0, T.atq + d);
  delta(T, 'atq', d);
  emit(c, { type: 'statChanged', side: id(c, T), stat: 'atq', delta: d, cause: 'effect' });
}

export function maxHpEffect({ c, e, target: T, delta }: EffectContext): void {
  const d = amount(e, T.maxHp);
  T.maxHp = Math.max(1, T.maxHp + d);
  T.hp = Math.max(1, Math.min(T.maxHp, T.hp + d));
  delta(T, 'maxHp', d);
  emit(c, { type: 'statChanged', side: id(c, T), stat: 'max', delta: d, cause: 'effect' });
}

export function swapAtqEffect({ c, o, x }: EffectContext): void {
  [o.atq, x.atq] = [x.atq, o.atq];
  emit(c, { type: 'statsSwapped', side: id(c, o), with: id(c, x), what: 'atq' });
}

// One card's ATQ and HP swapped: the opponent by default, or itself. Its max HP become its new HP
// (5 ATQ → 5/5 HP), whether they went up or down.
export function swapAtqHpEffect({ c, statusTarget }: EffectContext): void {
  const Q = statusTarget();
  [Q.atq, Q.hp] = [Q.hp, Q.atq];
  Q.hp = Math.max(1, Q.hp);
  Q.maxHp = Q.hp;
  emit(c, { type: 'attackAndHpSwapped', side: id(c, Q) });
}

export function swapHpEffect({ c, o, x }: EffectContext): void {
  [o.hp, x.hp] = [x.hp, o.hp];
  [o.maxHp, x.maxHp] = [x.maxHp, o.maxHp];
  emit(c, { type: 'statsSwapped', side: id(c, o), with: id(c, x), what: 'hp' });
}

export function swapAllEffect({ c, o, x }: EffectContext): void {
  [o.atq, x.atq] = [x.atq, o.atq];
  [o.hp, x.hp] = [x.hp, o.hp];
  [o.maxHp, x.maxHp] = [x.maxHp, o.maxHp];
  emit(c, { type: 'statsSwapped', side: id(c, o), with: id(c, x), what: 'all' });
}

// Its part of a card's status (combat/state.ts): how many times each growth passive (by its index
// in the card's passives) has grown.
export type StatsState = { growths: Record<number, number> };
export const statsState = (): StatsState => ({ growths: {} });

// A growth with a limit (`fois`: how many times it grows in the whole combat; empty = no limit):
// true while it may still grow, and counts this growth.
function grows(s: Side, p: EffectData): boolean {
  const max = parseInt(String(p.fois), 10) || 0;
  if (max <= 0) return true;
  const i = s.passives.indexOf(p);
  const done = s.status.growths[i] || 0;
  if (done >= max) return false;
  s.status.growths[i] = done + 1;
  return true;
}

// "Every turn" passive: ATQ grows every X rounds (X times at most, with `fois`).
export function atqGrowth(c: Combat, s: Side, p: EffectData): void {
  if (c.round % raw(p.tours) !== 0) return;
  if (!grows(s, p)) return;
  const gain = amount(p, s.atq);
  s.atq += gain;
  emit(c, { type: 'statChanged', side: id(c, s), stat: 'atq', delta: gain, cause: 'growth' });
}

// "Every turn" passive: max HP (and HP) grow every X rounds (X times at most, with `fois`).
export function maxHpGrowth(c: Combat, s: Side, p: EffectData): void {
  if (c.round % raw(p.tours) !== 0) return;
  if (!grows(s, p)) return;
  const gain = amount(p, s.maxHp);
  s.maxHp += gain;
  s.hp += gain;
  emit(c, { type: 'statChanged', side: id(c, s), stat: 'max', delta: gain, cause: 'growth' });
}

// Its effects (the registry of effects.ts).
export const effects = {
  atq_mod: { run: atqEffect },
  pv_mod: { run: maxHpEffect },
  echange_atq: { run: swapAtqEffect, once: true, withoutTarget: true },
  echange_atq_def: { run: swapAtqHpEffect, once: true, withoutTarget: true },
  echange_pv: { run: swapHpEffect, once: true, withoutTarget: true },
  echange_tout: { run: swapAllEffect, once: true, withoutTarget: true },
} satisfies EffectRules;
