// The combat context: rules, random sequence, both sides, and the variables the legacy engine kept
// in closures (round, effect source, trap chain depth, pending revives…). Every module receives it
// as its first argument.
//
// Event delivery lives here too: emit() hands a domain event to the consumer (or to the current
// hold), notices the triggers it meets (mechanics/triggers.ts), then flushes pending revives and
// deferred effects after every `damaged` event.

import type { CombatView, DomainEvent, OnEvent, SideView } from '../events.ts';
import type { Card, EffectData, Num, Player } from '../model/card.ts';
import type { Rules } from '../model/rules.ts';
import { damageFactor } from '../mechanics/double-damage.ts';
import { flushRevives } from '../mechanics/revive.ts';
import { noticeTrigger, type Triggers } from '../mechanics/triggers.ts';
import { reactToEvent } from '../mechanics/reaction.ts';
import { NO_MAGIC, NO_TRAP, newStatus, normalizePassives, type Side } from './state.ts';

export type PendingRevive = { side: Side; pct: Num; reveal: (() => void) | null };

// An event held back by the engine, with the view of the moment it happened.
export type HeldEvent = { event: DomainEvent; view: CombatView };

export type Combat = {
  readonly rules: Rules;
  readonly random: () => number;
  readonly sides: Side[];
  readonly onEvent: OnEvent;
  readonly liveView: CombatView;
  round: number;
  reviving: number; // heals logged as part of a revive
  source: string; // where the running effect comes from ('magie', 'piege', 'ultime', 'passif'): places a stolen card
  pendingRevives: PendingRevive[];
  pendingEffects: (() => void)[]; // traps and avoid-death shown AFTER the damage line
  executing: number; // an execution ignores avoid-death
  noRevive: number; // detonation damage: a card it kills cannot be revived (legacy: NOREV)
  knelling: number; // the knell takes a card: no avoid-death
  trapChainDepth: number;
  held: HeldEvent[][]; // nested holds, innermost last
  triggers: Triggers; // what the event hook does, from both decks (mechanics/triggers.ts)
};

// Raw card values take part in arithmetic exactly as in the legacy engine: JavaScript coerces them
// the same way whatever their declared type. This assertion only tells the compiler so.
export const raw = (value: Num): number => value as number;

export const round = Math.round;

// mulberry32, identical to the legacy generator.
export const createRandom = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// One draw, even at 0 % or 100 %: the draw itself is part of the sequence.
export const roll = (c: Combat, p: Num): boolean => c.random() * 100 < (p || 0);

export const id = (c: Combat, s: Side) => c.sides.indexOf(s);
export const opponent = (c: Combat, s: Side) => c.sides[1 - id(c, s)] as Side;

// Amount of an effect: percent of `base` ('pct') or points.
export const amount = (e: EffectData, base: number): number =>
  e.u === 'pct' ? round((base * raw(e.val)) / 100) : e.val || 0;

// Draws a card of a type. During overtime: never-played cards first, else at least cards not in
// play. The draw consumes one random number even when the list holds one card or none.
export function draw(
  c: Combat,
  deck: Card[],
  type: string,
  exclude?: Card[],
  current?: Card[],
): Card | undefined {
  let list = deck.filter((card) => card.type === type);
  if (exclude) {
    const neverPlayed = list.filter((card) => !exclude.includes(card));
    const notInPlay = list.filter((card) => !(current || []).includes(card));
    if (neverPlayed.length) list = neverPlayed;
    else if (notInPlay.length) list = notInPlay;
  }
  return list[Math.floor(c.random() * list.length)];
}

export function newSide(c: Combat, player: Player, exclude?: Card[], current?: Card[]): Side {
  const fighter = draw(c, player.deck, 'combattant', exclude, current);
  // The only text the engine produces: an invalid input, same message as the legacy engine.
  if (!fighter) throw new Error(player.pseudo + " n'a aucun combattant dans son deck");
  const passives = normalizePassives(fighter.passif);
  return {
    pseudo: player.pseudo,
    deck: player.deck,
    dos: player.dos || null,
    fighter,
    magic: draw(c, player.deck, 'magie', exclude, current) || NO_MAGIC,
    trap: draw(c, player.deck, 'piege', exclude, current) || NO_TRAP,
    atq: raw(fighter.atq),
    hp: raw(fighter.pv),
    maxHp: raw(fighter.pv),
    passives,
    ultimates: [{ effect: fighter.ultime, uses: 0, lastRound: -99 }],
    magicActive: 1,
    trapActive: 1,
    trapTriggers: 0,
    magicDeltas: [],
    status: newStatus(passives),
    damageDealt: 0,
    attacks: 0,
    hitsTaken: 0,
    cardActivated: 0,
    magicCancelStage: 0,
    magicCancelTurns: 0,
    magicNeverActed: 0,
    magicStolen: 0,
    trapBlocked: 0,
  };
}

// A card with no magic or no trap has that slot inactive.
export function disableEmptySlots(s: Side): void {
  if (s.magic.vide) s.magicActive = 0;
  if (s.trap.vide) s.trapActive = 0;
}

// Temporary boosts read by the view (the live ATQ of the overlay). A rage whose last turn just ran
// (turns at 0, its end line being emitted) no longer counts, so the shown ATQ drops with that line.
const rageOf = (s: Side): number =>
  s.status.rages.reduce((q, g) => q + (g.turns > 0 ? g.bonus : 0), 0);
const doubledOf = (s: Side): boolean => damageFactor(s) > 1;

export function createCombat(rules: Rules, seed: number, onEvent: OnEvent): Combat {
  const sides: Side[] = [];
  let currentRound = 0;
  const views = new WeakMap<Side, SideView>();
  const sideView = (s: Side): SideView => {
    let view = views.get(s);
    if (!view) {
      view = {
        get pseudo() {
          return s.pseudo;
        },
        get dos() {
          return s.dos;
        },
        get fighter() {
          return s.fighter;
        },
        get magic() {
          return s.magic;
        },
        get trap() {
          return s.trap;
        },
        get hp() {
          return s.hp;
        },
        get maxHp() {
          return s.maxHp;
        },
        get atq() {
          return s.atq;
        },
        get rage() {
          return rageOf(s);
        },
        get doubled() {
          return doubledOf(s);
        },
      };
      views.set(s, view);
    }
    return view;
  };
  const combat: Combat = {
    rules,
    random: createRandom(seed),
    sides,
    onEvent,
    liveView: {
      get round() {
        return currentRound;
      },
      get sides() {
        return sides.map(sideView);
      },
    },
    get round() {
      return currentRound;
    },
    set round(value: number) {
      currentRound = value;
    },
    reviving: 0,
    source: 'magie',
    pendingRevives: [],
    pendingEffects: [],
    executing: 0,
    noRevive: 0,
    knelling: 0,
    trapChainDepth: 0,
    held: [],
    triggers: { any: false, traps: false },
  };
  return combat;
}

// ── Event delivery ──

const frozenView = (c: Combat): CombatView => ({
  round: c.round,
  sides: c.sides.map((s) => ({
    pseudo: s.pseudo,
    dos: s.dos,
    fighter: s.fighter,
    magic: s.magic,
    trap: s.trap,
    hp: s.hp,
    maxHp: s.maxHp,
    atq: s.atq,
    rage: rageOf(s),
    doubled: doubledOf(s),
  })),
});

// view: the view to show the event with, or null for "now". During a hold, events go to the hold.
function deliver(c: Combat, event: DomainEvent, view: CombatView | null): void {
  const buffer = c.held[c.held.length - 1];
  if (buffer) buffer.push({ event, view: view ?? frozenView(c) });
  else c.onEvent(event, view ?? c.liveView);
}

export function emit(c: Combat, event: DomainEvent): void {
  deliver(c, event, null);
  // Even during a hold: the legacy hook runs when a line is written, not when it is shown.
  if (c.triggers.any) noticeTrigger(c, event);
  // The cards holding a reacting passive (mutation, molt, reaction) answer what happens to them.
  reactToEvent(c, event);
  // A damage line flushes pending revives and deferred effects, even for 0 damage.
  if (event.type === 'damaged') flush(c);
}

// Runs `run` and returns the events it emitted instead of delivering them.
export function hold(c: Combat, run: () => void): HeldEvent[] {
  c.held.push([]);
  run();
  return c.held.pop() as HeldEvent[];
}

// Releases held events with the view of the moment they happened.
export const releaseAsTheyWere = (c: Combat, events: HeldEvent[]) =>
  events.forEach((h) => deliver(c, h.event, h.view));

// Releases held events with the HP, max HP and ATQ of now, but everything else (round, names) as
// they were when they happened: the legacy engine re-pushes the captured lines with fresh `pv`,
// `max` and `atq` only. The release can come a round later, when no damage line flushed in between.
export const releaseNow = (c: Combat, events: HeldEvent[]) =>
  events.forEach((h) => {
    const now = c.liveView.sides;
    const view: CombatView = {
      round: h.view.round,
      sides: h.view.sides.map((s, i) => ({
        ...s,
        hp: now[i]?.hp ?? s.hp,
        maxHp: now[i]?.maxHp ?? s.maxHp,
        atq: now[i]?.atq ?? s.atq,
        rage: now[i]?.rage ?? s.rage,
        doubled: now[i]?.doubled ?? s.doubled,
      })),
    };
    deliver(c, h.event, view);
  });

export function flush(c: Combat): void {
  do {
    flushRevives(c);
    if (c.pendingEffects.length) (c.pendingEffects.shift() as () => void)();
  } while (c.pendingRevives.length || c.pendingEffects.length);
}

// Flushes, then tells whether a card is down.
export function over(c: Combat): boolean {
  flush(c);
  return c.sides.some((s) => s.hp <= 0);
}
