// Ultimate modes (November 2026), set on the ultimate next to its trigger:
//   - udecl2 (+ udx2) and ulogique: a second trigger. 'ou' (by default): either one sets it off. 'et':
//     both must have been met since its last use, in any order (each is remembered once met);
//   - jauge: a gauge of X points, filled by `jsource` (damage taken by default, damage dealt,
//     attacks made, statuses received); full, it sets the ultimate off and empties;
//   - phase2: a second effect, played every other use (1st use: its effect, 2nd: phase2, 3rd: its
//     effect…);
//   - desespoir: up to X % stronger, in proportion to the HP its card lost;
//   - udecl 'contre': it waits for the opponent's ultimate, answers it and cancels it.
// The state triggers (under X % of HP, X statuses carried…) are read at the start of its turn.

import { emit, id, opponent, raw, type Combat } from '../combat/combat.ts';
import { applyEffect } from '../combat/effects.ts';
import type { Side, UltimateSlot } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { scaleEffect } from './power.ts';
import { inhibited } from './rooting.ts';
import { negativeStatuses, type TriggerFact } from './triggers.ts';

const count = (v: unknown): number => Math.max(1, parseInt(String(v), 10) || 1);

// A trigger on the card's state, checked at the start of its turn.
function stateMet(c: Combat, s: Side, udecl: string | undefined, udx: unknown): boolean {
  if (!udecl) return false;
  const x = opponent(c, s);
  if (udecl === 'pv_sous' || udecl === 'adv_pv_sous') {
    const ux = parseInt(String(udx), 10) || 50;
    return udecl === 'pv_sous'
      ? (s.hp / s.maxHp) * 100 < ux
      : x.hp > 0 && (x.hp / x.maxHp) * 100 < ux;
  }
  const n = count(udx);
  switch (udecl) {
    case 'statuts':
      return negativeStatuses(s) >= n;
    case 'fils':
      return s.status.threads >= n;
    case 'adv_atq_sup':
      return x.hp > 0 && x.atq > s.atq;
    case 'entree':
      return s.status.turnsPlayed === 0;
    case 'intact':
      return s.status.turnsPlayed >= n && s.status.turnsPlayed - s.status.lastHitTurn >= n;
    case 'adv_pv_fixe':
      return x.hp > 0 && x.hp < n;
    default:
      return false;
  }
}

// Whether the state triggers of an ultimate are met now (both, for 'et').
export function stateReady(c: Combat, s: Side, slot: UltimateSlot): boolean {
  const u = slot.effect;
  if (!u) return false;
  const first = stateMet(c, s, u.udecl, u.udx);
  if (!u.udecl2) return first;
  const second = stateMet(c, s, u.udecl2, u.udx2);
  if (u.ulogique !== 'et') return first || second;
  if (first) slot.met1 = 1;
  if (second) slot.met2 = 1;
  if (!(slot.met1 && slot.met2)) return false;
  slot.met1 = slot.met2 = 0;
  return true;
}

// Two event triggers, met by a fact (mechanics/triggers.ts).
export function bothConditions(
  slot: UltimateSlot,
  logique: string | undefined,
  first: boolean,
  second: boolean,
): void {
  if (logique !== 'et') {
    if (first || second) slot.triggered = 1;
    return;
  }
  if (first) slot.met1 = 1;
  if (second) slot.met2 = 1;
  if (slot.met1 && slot.met2) {
    slot.met1 = slot.met2 = 0;
    slot.triggered = 1;
  }
}

// A fact feeds the gauge of an ultimate of card s.
export function fillGauge(c: Combat, s: Side, slot: UltimateSlot, f: TriggerFact): void {
  const u = slot.effect;
  if (!u || s.hp <= 0) return;
  const i = id(c, s);
  const me = f.who === i;
  const source = u.jsource || 'degats_recus';
  const points =
    source === 'degats_recus'
      ? f.kind === 'hit' && me
        ? f.amount
        : 0
      : source === 'degats_infliges'
        ? f.kind === 'hit' && f.who === 1 - i
          ? f.amount
          : 0
        : source === 'coups'
          ? f.kind === 'attack' && me
            ? 1
            : 0
          : source === 'statuts'
            ? f.kind === 'status' && me
              ? 1
              : 0
            : 0;
  if (points <= 0) return;
  const max = count(u.jauge);
  slot.gauge = (slot.gauge || 0) + points;
  if (slot.gauge < max) return;
  slot.gauge = 0;
  slot.triggered = 1;
  emit(c, { type: 'gaugeFilled', side: i });
}

// The opponent's counter-ultimate, if it has one ready: it answers the ultimate card s just launched,
// which does nothing. Whether it did.
export function counterUltimate(c: Combat, s: Side): boolean {
  const x = opponent(c, s);
  if (x.hp <= 0) return false;
  const slot = x.ultimates.find((z) => {
    const u = z.effect;
    return (
      !!u &&
      u.udecl === 'contre' &&
      !!(u.type || u.briques) &&
      !(raw(u.utilisations) > 0 && z.uses >= raw(u.utilisations)) &&
      c.round - z.lastRound >= (u.delai_tours || 0)
    );
  });
  if (!slot || inhibited(x)) return false;
  slot.uses++;
  slot.lastRound = c.round;
  emit(c, { type: 'ultimateCountered', side: id(c, x), target: id(c, s) });
  const previous = c.source;
  c.source = 'ultime';
  applyEffect(c, slot.effect, x, s);
  c.source = previous;
  return true;
}

// The effect an ultimate plays now: its second phase every other use, made stronger by despair.
export function ultimateEffect(
  c: Combat,
  s: Side,
  slot: UltimateSlot,
): EffectData | null | undefined {
  const u = slot.effect;
  if (!u) return u;
  let effect: EffectData | null | undefined = u;
  if (u.phase2 && (u.phase2.type || u.phase2.briques) && slot.uses % 2 === 0) {
    effect = u.phase2;
    emit(c, { type: 'ultimatePhase', side: id(c, s) });
  }
  const despair = raw(u.desespoir) || 0;
  if (despair > 0 && s.maxHp > 0) {
    const lost = Math.min(1, Math.max(0, 1 - s.hp / s.maxHp));
    const bonus = Math.round(despair * lost);
    if (bonus > 0) {
      emit(c, { type: 'ultimateDesperate', side: id(c, s), bonus });
      effect = scaleEffect(effect, 1 + bonus / 100);
    }
  }
  return effect;
}
