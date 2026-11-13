// Relay combat (combat en relais) — the championship (title belts): each player fields up to
// `rules.equipe` fighters (3), one after the other.
//
//   - each player draws a trio (fighter, magic, trap) from their deck; a card already played is never
//     drawn again (draw(): never-played cards first);
//   - when a fighter falls, its player sends the next one at once, with a new trio (only its magic is
//     revealed), and the turn under way goes on against it: the rest of a chained attack or of a
//     missile salvo strikes it (combat.ts, standIn), and it is there for the end of the turn (a heal it
//     can absorb, an ultimate it can trigger…). The card playing the turn, if it falls, ends its turn
//     there. A fighter that has given way gets nothing more: the rest of its sequence (a status
//     tick, its end-of-turn steps) stops once it is out of play (combat.ts, inPlay). Then a new
//     duel starts and the turns go on in their usual order: the side whose turn comes next plays
//     first (the new fighter does not take the initiative). The fighter still standing keeps
//     everything: HP, statuses, magic and trap already played (a magic's turns go on). Only the
//     new fighter's magic is revealed;
//   - no round limit: each duel goes on until a KO (a safety cap of RELAY_ROUND_CAP rounds ends a
//     duel that cannot end: the fighter with the lowest share of its max HP falls, exhausted);
//   - both fighters down at once: both players send their next one (the turns go on in their order);
//     a fighter put down by the one entering (its magic, revealed on entry) gives way as well;
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
  handOver,
  id,
  newSide,
  opponent,
} from './combat/combat.ts';
import { TURN } from './combat/moments.ts';
import type { Side } from './combat/state.ts';
import { settleMagicCancellations } from './mechanics/magic-cancel.ts';
import { drawTerrain, terrainPassives } from './mechanics/terrain.ts';
import { revealMagic } from './mechanics/magic-timing.ts';
import { endControl, payControl, puppetFell, takeControl } from './mechanics/threads.ts';
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
  emit(c, { type: 'combatStarted', first, team, ...(rules.orage ? { storm: true as const } : {}) });
  drawTerrain(c); // the terrain of the combat, if the rules give some (mechanics/terrain.ts)
  revealMagics(c, [c.sides[first] as Side, c.sides[1 - first] as Side]);

  const canSend = (i: number) => fielded[i]! < team && fielded[i]! < (fighters[i] ?? 0);
  // The players who sent a fighter during the turn under way.
  const entered = new Set<number>();
  // A puppet given back to its player (mechanics/threads.ts) waits in its reserve with the HP it had.
  const reserve = new Map<Card, number>();
  // The next fighter of a player (with a new magic and trap), counted among its fighters.
  const next = (i: number, s: Side): Side => {
    const n = newSide(c, players[i] as Player, used[i], [s.fighter, s.magic, s.trap]);
    (used[i] as Card[]).push(n.fighter, n.magic, n.trap);
    disableEmptySlots(n);
    const hp = reserve.get(n.fighter);
    if (hp !== undefined) {
      reserve.delete(n.fighter);
      n.hp = Math.min(n.maxHp, hp);
    }
    fielded[i]!++;
    entered.add(i);
    return n;
  };
  const announce = (i: number, n: Side) => {
    emit(c, { type: 'fighterEntered', side: i, index: fielded[i]!, of: team });
    revealMagics(c, [n]);
  };
  // A fallen fighter (after what was pending: a revive, a trap) gives way to its player's next one.
  // A fallen puppet gives way to its puppeteer.
  c.standIn = (s: Side): Side => {
    if (c.control && c.control.puppet === s) return puppetFell(c, s);
    flush(c);
    const i = c.sides.indexOf(s);
    if (s.hp > 0 || i < 0 || !canSend(i)) return s;
    const n = next(i, s);
    c.sides[i] = n;
    const standing = c.sides[1 - i] as Side;
    if (standing.hp > 0) handOver(c, standing, [s]);
    announce(i, n);
    return n;
  };
  // A control: the player whose fighter is taken sends its next one; the puppet does not count
  // among the puppeteer's fighters, and goes back to its player's reserve if it is still standing.
  c.controlHost = {
    canReplace: canSend,
    replace: (i) => next(i, c.sides[i] as Side),
    entered: announce,
    giveBack: (i, puppet) => {
      fielded[i]!--;
      const u = used[i] as Card[];
      const k = u.indexOf(puppet.fighter);
      if (k >= 0) u.splice(k, 1);
      reserve.set(puppet.fighter, puppet.hp);
    },
  };
  // After a turn: what is pending, then the fallen give way. Whether someone is still down (the end).
  // A fighter that enters can put the other side's fighter down (its magic, revealed on entry): that
  // one gives way too, so the sides are checked again until nobody new has entered.
  const settle = (): boolean => {
    flush(c);
    let changed = true;
    while (changed) {
      const before = [...c.sides];
      c.sides.forEach((s) => c.standIn!(s));
      changed = c.sides.some((s, i) => s !== before[i]);
    }
    return c.sides.some((s) => s.hp <= 0);
  };

  // The turn order, by side: a side's card may change during a duel (a control, threads.ts).
  let order = [first, 1 - first];
  let turn = 0;
  // The side whose turn comes next when a duel ends: the turns go on in their usual order.
  let nextUp = first;
  duels: for (;;) {
    entered.clear();
    nextUp = order[0] as number;
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
        const side = order[oi] as number;
        payControl(c, side);
        const a = c.sides[side] as Side;
        emit(c, { type: 'turnStarted', side, turn: ++turn });
        for (let i = 0; i < TURN.length; i++) {
          if (i > 0) {
            flush(c);
            if (!c.sides.includes(a)) break; // it fell during the step and gave way: its turn ends
            const o = opponent(c, a);
            if (o.hp <= 0 && c.standIn(o).hp <= 0) break; // nobody left to send
            if (a.hp <= 0) break; // its turn ends with it
          }
          (TURN[i] as (typeof TURN)[number])(c, a);
        }
        if (settle()) break duels;
        if (c.pendingControl) takeControl(c);
        if (entered.size) {
          nextUp = order[1 - oi] as number;
          break;
        }
      }
      if (entered.size) break;
    }
    // A new duel: the side whose turn comes next plays first (no initiative for the newcomer). The fighter still
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
    // The turns go on in their usual order: the new fighter does not take the initiative.
    order = [nextUp, 1 - nextUp];
  }
  endControl(c, 'end');

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
  terrainPassives(c, order); // cards coming into play invoke their terrain (mechanics/terrain.ts)
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
