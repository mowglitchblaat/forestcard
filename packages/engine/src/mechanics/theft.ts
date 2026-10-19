// Theft of a magic or a trap, and undoing a magic's effects.
//
// The stolen card moves to the thief's side: in place of the trap if a trap steals, else in its magic
// / trap slot. duree: turns OF THE THIEF it keeps the card; then it goes back to its owner (empty or 0
// = until the end of the combat).

import { emit, id, opponent, over, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import { applyEffect } from '../combat/effects.ts';
import type { Flow } from '../combat/flow.ts';
import type { MagicDelta, Side } from '../combat/state.ts';
import type { Card, EffectData, Num } from '../model/card.ts';

export type DeferredTheft = { effect: EffectData; atTurn: number; source: string };
export type PreviousTrap = { trap: Card; active: number; triggers: number; blocked: number };
export type TimedTheft =
  | {
      turns: number;
      kind: 'magie';
      slot: string;
      owner: Side;
      card: Card;
      previous: PreviousTrap | null;
      deltas: MagicDelta[];
    }
  | {
      turns: number;
      kind: 'piege';
      slot: 'piege';
      owner: Side;
      card: Card;
      previous: PreviousTrap;
      ownerTriggers: number;
    };

// Its part of a card's status (combat/state.ts).
export type TheftState = {
  timedThefts: TimedTheft[];
  deferredThefts: DeferredTheft[];
  theftPassivesUsed: Record<number, number>; // per passive index
};
export const theftState = (): TheftState => ({
  timedThefts: [],
  deferredThefts: [],
  theftPassivesUsed: [],
});

// source: what plays the theft ('magie', 'piege', 'ultime', 'passif').
export function steal(
  c: Combat,
  o: Side,
  x: Side,
  carte: string | undefined,
  source: string,
  duree: Num,
): void {
  const turns = Math.max(0, parseInt(String(duree), 10) || 0);
  if (carte === 'magie' && (x.magicActive || x.magicCancelTurns)) {
    const wasActive = x.magicActive;
    x.magicActive = 0;
    x.magicCancelTurns = 0;
    x.magicStolen = 1;
    if (wasActive) undoMagic(x);
    // Stolen by a trap: it takes that trap's place (the trap is consumed).
    const slot = source === 'piege' ? 'piege' : 'magie';
    const previous: PreviousTrap | null =
      source === 'piege'
        ? { trap: o.trap, active: 0, triggers: o.trapTriggers, blocked: o.trapBlocked }
        : null;
    if (source === 'piege') o.trapActive = 0;
    emit(c, { type: 'magicStolen', side: id(c, o), from: id(c, x), card: x.magic, slot, turns });
    const firstDelta = o.magicDeltas.length;
    applyEffect(c, x.magic.effet, o, x, true);
    // Its effects are kept apart, to be removed when it goes back.
    if (turns > 0)
      o.status.timedThefts.push({
        turns,
        kind: 'magie',
        slot,
        owner: x,
        card: x.magic,
        previous,
        deltas: o.magicDeltas.splice(firstDelta),
      });
  } else if (carte === 'piege' && x.trapActive) {
    x.trapActive = 0;
    // The stolen trap takes the place of the thief's trap.
    const previous: PreviousTrap = {
      trap: o.trap,
      active: source === 'piege' ? 0 : o.trapActive,
      triggers: o.trapTriggers,
      blocked: o.trapBlocked,
    };
    const ownerTriggers = x.trapTriggers;
    o.trap = x.trap;
    o.trapActive = 1;
    o.trapTriggers = 0;
    o.trapBlocked = 0;
    emit(c, { type: 'trapStolen', side: id(c, o), from: id(c, x), card: x.trap, turns });
    if (turns > 0)
      o.status.timedThefts.push({
        turns,
        kind: 'piege',
        slot: 'piege',
        owner: x,
        card: x.trap,
        previous,
        ownerTriggers,
      });
  }
}

// End of a timed theft: the card goes back to its owner, and the thief gets back the card it covered.
export function giveBack(c: Combat, o: Side, theft: TimedTheft): void {
  const x = theft.owner;
  if (x !== opponent(c, o)) return;
  if (theft.kind === 'magie') {
    // The thief loses the stolen magic's effects.
    replayDeltas(theft.deltas);
    if (theft.previous) restoreTrap(o, theft.previous);
    const ok = x.magic === theft.card && !x.magicActive;
    x.magicStolen = 0;
    emit(c, {
      type: 'magicReturned',
      side: id(c, x),
      from: id(c, o),
      card: theft.card,
      slot: theft.slot,
      uncovered: theft.slot === 'piege' ? theft.previous && theft.previous.trap : o.magic,
      ok,
    });
    // Back home: its "once" effects do not replay.
    if (ok && theft.card.effet) {
      x.magicActive = 1;
      applyEffect(c, theft.card.effet, x, o, true, true);
      c.sides.forEach((s) => (s.cardActivated = 1));
    }
  } else {
    const holds = o.trap === theft.card && o.trapActive;
    const max = (theft.card.effet && theft.card.effet.declenchements) || 1;
    const used = theft.ownerTriggers + (holds ? o.trapTriggers : 0);
    restoreTrap(o, theft.previous);
    const ok = !!(holds && x.trap === theft.card && !x.trapActive);
    if (ok) {
      x.trapTriggers = Math.min(used, max);
      x.trapActive = x.trapTriggers < max ? 1 : 0;
      x.trapBlocked = 0;
    }
    emit(c, {
      type: 'trapReturned',
      side: id(c, x),
      from: id(c, o),
      card: theft.card,
      uncovered: theft.previous.trap,
      ok,
      exhausted: ok && !x.trapActive,
    });
  }
}

function restoreTrap(o: Side, previous: PreviousTrap): void {
  o.trap = previous.trap;
  o.trapActive = previous.active;
  o.trapTriggers = previous.triggers;
  o.trapBlocked = previous.blocked;
}

function replayDeltas(deltas: MagicDelta[]): void {
  deltas.forEach((d) => {
    if ('undo' in d) {
      d.undo();
      return;
    }
    d.side[d.stat] -= d.delta;
    if (d.stat === 'maxHp') d.side.hp = Math.min(d.side.hp, d.side.maxHp);
  });
}

// The magic of s goes (cancelled, destroyed, stolen): everything it did is undone.
export function undoMagic(s: Side): void {
  replayDeltas(s.magicDeltas);
  s.magicDeltas = [];
}

// Thefts: at the start of the card's X-th turn (deferred magic theft, theft passive).
export function theftsAtStart(c: Combat, s: Side): Flow {
  const nextTurn = s.status.turnsPlayed + 1;
  const x = opponent(c, s);
  s.status.deferredThefts = s.status.deferredThefts.filter((deferred) => {
    if (nextTurn < deferred.atTurn) return true;
    steal(c, s, x, deferred.effect.carte, deferred.source, deferred.effect.duree);
    return false;
  });
  s.passives.forEach((p, pi) => {
    if (
      p.type === 'voler' &&
      !s.status.theftPassivesUsed[pi] &&
      nextTurn >= Math.max(1, parseInt(String(p.tourdecl), 10) || 1)
    ) {
      s.status.theftPassivesUsed[pi] = 1;
      steal(c, s, x, p.carte, 'passif', p.duree);
    }
  });
  if (s.hp <= 0 || over(c)) return 'stop';
  return undefined;
}

// Timed theft: counted on the thief's turns.
export function timedTheftsEnd(c: Combat, s: Side): Flow {
  s.status.timedThefts = s.status.timedThefts.filter((theft) => {
    if (--theft.turns > 0) return true;
    giveBack(c, s, theft);
    return false;
  });
  return undefined;
}

// Effect voler. Magic: the theft waits for the start of the card's X-th turn.
export function theftEffect({ c, e, o, x, fromMagic, returning, onUndo }: EffectContext): void {
  const atTurn = parseInt(String(e.tourdecl), 10) || 0;
  if (atTurn > 1 && (fromMagic || c.source === 'magie') && !returning) {
    const deferred: DeferredTheft = { effect: e, atTurn, source: c.source };
    o.status.deferredThefts.push(deferred);
    onUndo(() => {
      o.status.deferredThefts = o.status.deferredThefts.filter((z) => z !== deferred);
    });
    emit(c, { type: 'theftScheduled', side: id(c, o), carte: e.carte, turn: atTurn });
    return;
  }
  steal(c, o, x, e.carte, c.source, e.duree);
}

// Its effects (the registry of effects.ts).
export const effects = {
  voler: { run: theftEffect, once: true, withoutTarget: true },
} satisfies EffectRules;
