// Relay combat (combat en relais) — the championship (title belts): each player fields up to
// `rules.equipe` fighters (3), one after the other.
//
//   - each player draws a trio (fighter, magic, trap) from their deck; a card already played is never
//     drawn again (draw(): never-played cards first);
//   - when a fighter falls, its player sends the next one with a new trio. The fighter still standing
//     keeps everything: HP, statuses, magic and trap already played. The new fighter acts first, and
//     only its magic is revealed;
//   - no round limit: each duel goes on until a KO (a safety cap of RELAY_ROUND_CAP rounds ends a
//     duel that cannot end: the fighter with the lowest share of its max HP falls, exhausted);
//   - both fighters down at once: both players send their next one (both act in the starting order);
//   - the player who still has a fighter standing when the other has none wins; both out at once is
//     a draw.
//
// It reuses the turn of a normal combat (combat/moments.ts) and emits the same events, plus
// `fighterEntered` and `fighterExhausted`. simulate.ts (the normal combat) is left untouched.

import {
  createCombat,
  disableEmptySlots,
  emit,
  id,
  newSide,
  opponent,
  over,
} from './combat/combat.ts';
import { TURN } from './combat/moments.ts';
import type { Side } from './combat/state.ts';
import { settleMagicCancellations } from './mechanics/magic-cancel.ts';
import { revealMagic } from './mechanics/magic-timing.ts';
import { triggersOf } from './mechanics/triggers.ts';
import type { OnEvent } from './events.ts';
import type { Card, Player } from './model/card.ts';
import { DEFAULT_RULES, type Rules } from './model/rules.ts';
import type { CombatResult, SimulateOptions } from './simulate.ts';

// A duel that lasts this many rounds without a KO ends: the most worn-out fighter falls.
export const RELAY_ROUND_CAP = 60;

const ignoreEvents: OnEvent = () => {};

export function simulateRelay(
  pA: Player,
  pB: Player,
  opt: SimulateOptions = {},
  onEvent: OnEvent = ignoreEvents,
): CombatResult {
  const seed = opt.seed ?? (Math.random() * 1e9) | 0;
  const rules: Rules = { ...DEFAULT_RULES, ...opt.regles };
  const team = Math.max(1, rules.equipe ?? 3);
  // A fighter that has left can still be touched by what it left behind (a magic undone on it):
  // those are not facts of the combat any more.
  const c = createCombat(rules, seed, (e, view) => {
    const r = e as Record<string, unknown>;
    if (!['side', 'target', 'by', 'from'].some((k) => r[k] === -1)) onEvent(e, view);
  });
  const players = [pA, pB];
  c.triggers = triggersOf([pA.deck, pB.deck]);
  c.sides.push(newSide(c, pA), newSide(c, pB));
  c.sides.forEach(disableEmptySlots);
  const used: Card[][] = c.sides.map((s) => [s.fighter, s.magic, s.trap]);
  const fielded = [1, 1]; // fighters sent so far by each player
  const fighters = players.map((p) => p.deck.filter((card) => card.type === 'combattant').length);

  const first = c.random() < 0.5 ? 0 : 1;
  emit(c, { type: 'combatStarted', first, team });
  revealMagics(c, [c.sides[first] as Side, c.sides[1 - first] as Side]);

  let order: Side[] = [c.sides[first] as Side, c.sides[1 - first] as Side];
  let turn = 0;
  for (;;) {
    // One duel: rounds until a KO (or the safety cap).
    for (c.round = 1; !over(c); c.round++) {
      if (c.round > RELAY_ROUND_CAP) {
        const worn = c.sides.reduce((x, y) => (y.hp / y.maxHp < x.hp / x.maxHp ? y : x));
        worn.hp = 0;
        emit(c, { type: 'fighterExhausted', side: id(c, worn) });
        break;
      }
      sides: for (let oi = 0; oi < 2; oi++) {
        const a = order[oi] as Side;
        if (over(c)) break;
        emit(c, { type: 'turnStarted', side: id(c, a), turn: ++turn });
        for (let i = 0; i < TURN.length; i++) {
          if (i > 0 && over(c)) break sides;
          (TURN[i] as (typeof TURN)[number])(c, a);
        }
      }
    }
    // Who fell, and who can still send a fighter.
    const down = c.sides.map((s) => s.hp <= 0);
    const canSend = [0, 1].map((i) => fielded[i]! < team && fielded[i]! < (fighters[i] ?? 0));
    if ((down[0] && !canSend[0]) || (down[1] && !canSend[1])) break;
    // The fallen send their next fighter, with a new trio.
    const entering: Side[] = [];
    const gone: Side[] = [];
    [0, 1].forEach((i) => {
      if (!down[i]) return;
      const previous = c.sides[i] as Side;
      gone.push(previous);
      const next = newSide(c, players[i] as Player, used[i], [
        previous.fighter,
        previous.magic,
        previous.trap,
      ]);
      (used[i] as Card[]).push(next.fighter, next.magic, next.trap);
      c.sides[i] = next;
      disableEmptySlots(next);
      fielded[i]!++;
      entering.push(next);
    });
    // The fighter still standing keeps its state; its ultimates' cooldowns start again with the
    // new duel (rounds count from 1 again).
    c.sides.forEach((s) => {
      if (!entering.includes(s)) {
        s.ultimates.forEach((u) => (u.lastRound = -99));
        handOver(c, s, gone);
      }
    });
    c.round = 0;
    c.pendingRevives = [];
    c.pendingEffects = [];
    entering.forEach((s) => {
      const i = id(c, s);
      emit(c, { type: 'fighterEntered', side: i, index: fielded[i]!, of: team });
    });
    // The new fighter acts first (both new: the starting order).
    order =
      entering.length === 1
        ? [entering[0] as Side, opponent(c, entering[0] as Side)]
        : [c.sides[first] as Side, c.sides[1 - first] as Side];
    revealMagics(
      c,
      order.filter((s) => entering.includes(s)),
    );
  }

  const out = [0, 1].map(
    (i) =>
      (c.sides[i] as Side).hp <= 0 && !(fielded[i]! < team && fielded[i]! < (fighters[i] ?? 0)),
  );
  let winner: number | null = null;
  if (out[0] !== out[1]) winner = out[0] ? 1 : 0;
  const rewards =
    winner === null
      ? [rules.nul, rules.nul]
      : winner === 0
        ? [rules.gain, rules.perte]
        : [rules.perte, rules.gain];
  emit(c, { type: 'combatEnded', winner, rewards });
  return { seed, regles: rules, gagnant: winner, recompenses: rewards };
}

// As in simulate.ts: magic cancellation settled first, then each magic of `order` acts.
function revealMagics(c: ReturnType<typeof createCombat>, order: Side[]): void {
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

// What the fighter still standing held on the fallen one goes with it: a swallowed card is gone,
// a purification aimed at it has no target, its magic changes on it have nothing to undo, a card
// stolen from it for a while stays (nobody to give it back to). Its statuses stay; a delayed damage the fallen one
// laid still strikes, now on behalf of the fighter that took its place.
function handOver(c: ReturnType<typeof createCombat>, s: Side, gone: Side[]): void {
  const st = s.status;
  if (st.swallowing && gone.includes(st.swallowing.victim)) st.swallowing = null;
  if (st.swallowedBy && gone.includes(st.swallowedBy)) st.swallowedBy = null;
  st.scheduledPurifications = st.scheduledPurifications.filter((p) => !gone.includes(p.target));
  s.magicDeltas = s.magicDeltas.filter((d) => !('side' in d && gone.includes(d.side)));
  st.timedThefts = st.timedThefts.filter((t) => !gone.includes(t.owner));
  st.delayedDamages.forEach((d) => {
    if (gone.includes(d.source)) d.source = opponent(c, s);
  });
}
