// Relay combat (combat en relais) — the championship (title belts): each player fields up to
// `rules.equipe` fighters (3), one after the other.
//
//   - each player draws a trio (fighter, magic, trap) from their deck; a card already played is never
//     drawn again (draw(): never-played cards first);
//   - when a fighter falls, its player sends the next one at once, with a new trio (only its magic is
//     revealed), and the turn under way goes on against it: the rest of a chained attack or of a
//     missile salvo strikes it (combat.ts, standIn), and it is there for the end of the turn (a heal it
//     can absorb, an ultimate it can trigger…). The card playing the turn, if it falls, ends its turn
//     there. Then a new duel starts, the new fighter acting first. The fighter still standing keeps
//     everything: HP, statuses, magic and trap already played. The new fighter acts first, and
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
  flush,
  id,
  newSide,
  opponent,
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

  const canSend = (i: number) => fielded[i]! < team && fielded[i]! < (fighters[i] ?? 0);
  // The players who sent a fighter during the turn under way.
  const entered = new Set<number>();
  // A fallen fighter (after what was pending: a revive, a trap) gives way to its player's next one.
  c.standIn = (s: Side): Side => {
    flush(c);
    const i = c.sides.indexOf(s);
    if (s.hp > 0 || i < 0 || !canSend(i)) return s;
    const next = newSide(c, players[i] as Player, used[i], [s.fighter, s.magic, s.trap]);
    (used[i] as Card[]).push(next.fighter, next.magic, next.trap);
    c.sides[i] = next;
    disableEmptySlots(next);
    fielded[i]!++;
    entered.add(i);
    const standing = c.sides[1 - i] as Side;
    if (standing.hp > 0) handOver(c, standing, [s]);
    emit(c, { type: 'fighterEntered', side: i, index: fielded[i]!, of: team });
    revealMagics(c, [next]);
    return next;
  };
  // After a turn: what is pending, then the fallen give way. Whether someone is still down (the end).
  const settle = (): boolean => {
    flush(c);
    c.sides.forEach((s) => c.standIn!(s));
    return c.sides.some((s) => s.hp <= 0);
  };

  let order: Side[] = [c.sides[first] as Side, c.sides[1 - first] as Side];
  let turn = 0;
  duels: for (;;) {
    entered.clear();
    // One duel: rounds until a fighter falls (or the safety cap).
    for (c.round = 1; ; c.round++) {
      if (c.round > RELAY_ROUND_CAP) {
        const worn = c.sides.reduce((x, y) => (y.hp / y.maxHp < x.hp / x.maxHp ? y : x));
        worn.hp = 0;
        emit(c, { type: 'fighterExhausted', side: id(c, worn) });
        if (settle()) break duels;
        break;
      }
      for (let oi = 0; oi < 2; oi++) {
        const a = order[oi] as Side;
        emit(c, { type: 'turnStarted', side: id(c, a), turn: ++turn });
        for (let i = 0; i < TURN.length; i++) {
          if (i > 0) {
            flush(c);
            const o = opponent(c, a);
            if (o.hp <= 0 && c.standIn(o).hp <= 0) break; // nobody left to send
            if (a.hp <= 0) break; // its turn ends with it
          }
          (TURN[i] as (typeof TURN)[number])(c, a);
        }
        if (settle()) break duels;
        if (entered.size) break;
      }
      if (entered.size) break;
    }
    // A new duel: the new fighter acts first (both new: the starting order). The fighter still
    // standing keeps its state; its ultimates' cooldowns start again (rounds count from 1 again).
    c.sides.forEach((s, i) => {
      if (!entered.has(i))
        s.ultimates.forEach((u) => {
          u.lastRound = -99;
          // a programmed ultimate "in X turns" keeps the turns it had left
          if (u.programmed && u.effect && u.effect.apres_tours)
            u.effect.apres_tours = Math.max(1, +u.effect.apres_tours - c.round);
        });
    });
    c.round = 0;
    c.pendingRevives = [];
    c.pendingEffects = [];
    const one = entered.size === 1 ? (c.sides[[...entered][0]!] as Side) : null;
    order = one ? [one, opponent(c, one)] : [c.sides[first] as Side, c.sides[1 - first] as Side];
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
