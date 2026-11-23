// Trap modes (November 2026), set on the trap's payload next to its condition:
//   - condition2 + logique: a second condition. 'ou' (by default): either one sets it off. 'et': both
//     must have been met, in any order, since it last fired (each is remembered once met);
//   - compte: it fires at the X-th time its condition is met (then counts again from 0);
//   - retard: once its condition is met, it fires X turns of the combat later (the turns the journal
//     numbers: met during turn 3, `retard` 2 fires at the start of turn 5);
//   - rearme: once it has fired all its triggers, it re-arms X turns of the combat later;
//   - enchaine: once it has fired, it sets off its card's ultimate ('ultime': at its next chance) or
//     its magic ('magie': it acts once more, now);
//   - cache: its condition is hidden on the card (packages/describe), nothing changes in combat.
// None of them draws a random number.

import { effetOf, emit, id, opponent, raw, type Combat } from '../combat/combat.ts';
import { applyEffect } from '../combat/effects.ts';
import type { Side } from '../combat/state.ts';
import { fireTrap, meetsCondition, type ScanEvent } from '../combat/traps.ts';
import type { Card, EffectData } from '../model/card.ts';

// Its part of a side: what the trap in play remembers (reset when another trap takes its place).
export type TrapModeState = {
  card: Card | null;
  met1: number; // 'et': its first condition met
  met2: number; // 'et': its second condition met
  count: number; // compte: times its condition was met
  dueAt: number; // retard: fires at the start of this turn of the combat (-1: nothing due)
  exhaustedAt: number; // rearme: the turn of the combat it was found spent on (-1: not spent)
};

export const newTrapMode = (): TrapModeState => ({
  card: null,
  met1: 0,
  met2: 0,
  count: 0,
  dueAt: -1,
  exhaustedAt: -1,
});

const n = (v: unknown): number => Math.max(0, parseInt(String(v), 10) || 0);

function modeOf(o: Side): TrapModeState {
  if (o.trapMode.card !== o.trap) o.trapMode = { ...newTrapMode(), card: o.trap };
  return o.trapMode;
}

// Whether the trap of card o fires on this event, its modes included.
export function trapConditionMet(
  c: Combat,
  o: Side,
  i: number,
  e: EffectData,
  ev: ScanEvent,
): boolean {
  if (!e.condition) return false;
  const first = meetsCondition(c, o, i, e.condition, ev);
  if (!e.condition2?.type && !n(e.compte) && !n(e.retard)) return first; // a plain trap
  const m = modeOf(o);
  let met = first;
  if (e.condition2?.type) {
    const second = meetsCondition(c, o, i, e.condition2, ev);
    if (e.logique === 'et') {
      if (first) m.met1 = 1;
      if (second) m.met2 = 1;
      met = !!(m.met1 && m.met2);
      if (met) m.met1 = m.met2 = 0;
    } else met = first || second;
  }
  if (!met) return false;
  const times = n(e.compte);
  if (times > 1) {
    m.count++;
    emit(c, { type: 'trapCounted', side: i, count: Math.min(m.count, times), of: times });
    if (m.count < times) return false;
    m.count = 0;
  }
  const later = n(e.retard);
  if (later > 0) {
    if (m.dueAt < 0) {
      m.dueAt = c.turnNow + later;
      emit(c, { type: 'trapPrimed', side: i, turns: later });
    }
    return false;
  }
  return true;
}

// The start of a turn of the combat: delayed traps due fire; spent traps may re-arm.
export function trapModesAtTurn(c: Combat, turn: number): void {
  c.sides.forEach((o, who) => {
    if (o.hp <= 0) return;
    const e = effetOf(c, o.trap);
    if (!o.trapActive || !e || !e.condition) return;
    const m = modeOf(o);
    const spent = o.trapTriggers >= (e.declenchements || 1);
    if (m.dueAt >= 0 && turn >= m.dueAt) {
      m.dueAt = -1;
      if (!spent) fireTrap(c, o, who);
      return;
    }
    const rearm = n(e.rearme);
    if (!rearm || !spent) return;
    if (m.exhaustedAt < 0) m.exhaustedAt = turn;
    else if (turn - m.exhaustedAt >= rearm) {
      m.exhaustedAt = -1;
      o.trapTriggers = 0;
      o.trapBlocked = 0;
      emit(c, { type: 'trapRearmed', side: who });
    }
  });
}

// After the trap of card o fired: its ultimate or its magic, set off.
export function trapChains(c: Combat, o: Side, e: EffectData): void {
  if (o.hp <= 0) return;
  if (e.enchaine === 'ultime' && o.ultimates.some((slot) => slot.effect && slot.effect.type)) {
    o.ultimates.forEach((slot) => (slot.triggered = 1));
    emit(c, { type: 'trapChained', side: id(c, o), to: 'ultime' });
  } else if (e.enchaine === 'magie' && o.magicActive && !o.magicStolen) {
    const magic = effetOf(c, o.magic);
    if (!magic) return;
    emit(c, { type: 'trapChained', side: id(c, o), to: 'magie' });
    const previous = c.source;
    c.source = 'magie';
    applyEffect(c, magic, o, opponent(c, o), true);
    c.source = previous;
  }
}

// What a trap mode needs from the combat: the trap scans on facts (mechanics/triggers.ts).
export const usesTrapModes = (e: EffectData | null | undefined): boolean =>
  !!e &&
  !!e.condition &&
  (!!e.condition2?.type ||
    raw(e.compte) > 1 ||
    raw(e.retard) > 0 ||
    raw(e.rearme) > 0 ||
    !!e.enchaine);
