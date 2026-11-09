// Combat simulation: the flow of a combat (start, magics, rounds, overtimes, result).
//
// The rules live in combat/; the order in which they act during a turn lives in combat/moments.ts.
// Their control flow and call order are the legacy ones (legacy/moteur-combat.js), on purpose:
//   - the RNG is a single sequence consumed in call order, and short-circuits (`a && roll(x)`)
//     decide whether a draw happens at all;
//   - over() and every `damaged` event flush pending revives and deferred effects;
//   - filter-and-reassign patterns (`list = list.filter(...)`) drop what a callback pushes during
//     the filter, and that loss is part of the behaviour.
// See docs/legacy/moteur.md before moving any expression. The iso run (tools/iso) is the judge.
//
// The engine emits typed domain events (events.ts) and produces no text. The legacy French journal
// is a projection of these events (packages/journal).

import {
  createCombat,
  disableEmptySlots,
  emit,
  newSide,
  over,
  type Combat,
} from './combat/combat.ts';
import { TURN } from './combat/moments.ts';
import { settleMagicCancellations } from './mechanics/magic-cancel.ts';
import { revealMagic } from './mechanics/magic-timing.ts';
import { endControl, payControl, takeControl } from './mechanics/threads.ts';
import { triggersOf } from './mechanics/triggers.ts';
import type { Side } from './combat/state.ts';
import type { OnEvent } from './events.ts';
import type { Card, Player } from './model/card.ts';
import { DEFAULT_RULES, type Rules } from './model/rules.ts';

export { canonEffect, canonPassive } from './combat/state.ts';

export type SimulateOptions = { seed?: number; regles?: Partial<Rules> };

export type CombatResult = {
  seed: number;
  regles: Rules;
  gagnant: number | null; // 0, 1, or null for a draw
  recompenses: number[];
};

const ignoreEvents: OnEvent = () => {};

export function simulate(
  pA: Player,
  pB: Player,
  opt: SimulateOptions = {},
  onEvent: OnEvent = ignoreEvents,
): CombatResult {
  const seed = opt.seed ?? (Math.random() * 1e9) | 0;
  const rules: Rules = { ...DEFAULT_RULES, ...opt.regles };
  const c = createCombat(rules, seed, onEvent);
  c.triggers = triggersOf([pA.deck, pB.deck]);
  c.sides.push(newSide(c, pA), newSide(c, pB));
  c.sides.forEach(disableEmptySlots);

  const first = c.random() < 0.5 ? 0 : 1;
  // The turn order, by side: a side's card may change during a period (a control, threads.ts).
  const order = [first, 1 - first];
  const cards = () => order.map((i) => c.sides[i] as Side);
  // Cards already played by each player (avoided during overtimes).
  const used: Card[][] = c.sides.map((s) => [s.fighter, s.magic, s.trap]);
  const players = [pA, pB];
  // A control (mechanics/threads.ts): the player whose fighter is taken sends a fighter of its deck
  // not played yet, with a new magic and trap; a puppet still standing leaves the combat.
  c.controlHost = {
    canReplace: (i) =>
      (players[i] as Player).deck.some(
        (card) => card.type === 'combattant' && !(used[i] as Card[]).includes(card),
      ),
    replace: (i) => {
      const s = c.sides[i] as Side;
      const next = newSide(c, players[i] as Player, used[i], [s.fighter, s.magic, s.trap]);
      (used[i] as Card[]).push(next.fighter, next.magic, next.trap);
      disableEmptySlots(next);
      return next;
    },
    entered: (_i, s) => revealMagics(c, [s]),
    giveBack: () => {},
  };
  emit(c, { type: 'combatStarted', first, ...(rules.orage ? { storm: true as const } : {}) });
  revealMagics(c, cards());

  // Overtime: at the last round, if no card fell, each player draws 3 new cards from their deck (1
  // fighter, 1 magic, 1 trap) and the combat goes on, until a KO. After rules.maxProlong overtimes (3
  // by default), the card with the most HP wins (equal HP = draw).
  const maxOvertimes = rules.maxProlong ?? 3;
  let period = 0;
  let turnOffset = 0;
  for (;;) {
    for (c.round = 1; c.round <= rules.maxTours && !over(c); c.round++) {
      // A fallen card ends the round: before each turn, and between two steps of a turn.
      sides: for (let oi = 0; oi < 2; oi++) {
        if (over(c)) break;
        const side = order[oi] as number;
        payControl(c, side);
        const a = c.sides[side] as Side;
        emit(c, {
          type: 'turnStarted',
          side,
          turn: turnOffset + (c.round - 1) * 2 + oi + 1,
        });
        for (let i = 0; i < TURN.length; i++) {
          if (i > 0 && over(c)) break sides;
          if (!c.sides.includes(a)) break; // a puppet that fell: its turn ends with it
          (TURN[i] as (typeof TURN)[number])(c, a);
        }
        // a control drawn during the turn is taken once it is done (no flush otherwise: the order of
        // the pending effects is behaviour)
        if (c.pendingControl && !over(c)) takeControl(c);
      }
    }
    if (over(c) || period >= maxOvertimes) break;
    endControl(c, 'end');
    c.pendingControl = null;
    period++;
    turnOffset += rules.maxTours * 2;
    c.round = 0;
    [0, 1].forEach((i) => {
      const previous = c.sides[i] as Side;
      const next = newSide(c, players[i] as Player, used[i], [
        previous.fighter,
        previous.magic,
        previous.trap,
      ]);
      (used[i] as Card[]).push(next.fighter, next.magic, next.trap);
      c.sides[i] = next;
      disableEmptySlots(next);
    });
    c.pendingRevives = [];
    c.pendingEffects = [];
    emit(c, { type: 'overtimeStarted', period, first });
    revealMagics(c, cards());
  }
  endControl(c, 'end');

  const dead = c.sides.map((s) => s.hp <= 0);
  const [s0, s1] = c.sides as [Side, Side];
  let winner: number | null = null;
  if (dead[0] !== dead[1]) winner = dead[0] ? 1 : 0;
  else if (!dead[0] && s0.hp !== s1.hp) winner = s0.hp > s1.hp ? 0 : 1;
  const rewards =
    winner === null
      ? [rules.nul, rules.nul]
      : winner === 0
        ? [rules.gain, rules.perte]
        : [rules.perte, rules.gain];
  emit(c, { type: 'combatEnded', winner, rewards });
  return { seed, regles: rules, gagnant: winner, recompenses: rewards };
}

// Magic cancellation is settled BEFORE magics act (mechanics/magic-cancel.ts). Then each magic
// reveals and acts, in turn order: a magic destroyed by the one played before it does not play.
// The magics of the start do not count as "a card activates" (sur_carte ultimates).
function revealMagics(c: Combat, order: Side[]): void {
  settleMagicCancellations(c, order);
  order.forEach((s) => {
    if (
      s.magic.effet &&
      s.magicActive &&
      s.magicCancelStage !== 1 &&
      s.magicCancelStage !== 2 &&
      !s.magicStolen
    ) {
      revealMagic(c, s);
    }
  });
}
