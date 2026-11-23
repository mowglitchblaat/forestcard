// Triggers on an event: ultimates that fire when something happens to their card (`udecl`: a status
// received, a dodge, a hard hit…) and trap conditions on the same facts (proprio_statut, tour_n…).
//
// The legacy engine reads these facts from its journal: a hook in L() classes each line as it is
// written (trig). The engine has no journal, so it classes each domain event as it is emitted
// (emit, combat/combat.ts), which is the same moment:
//   - while a hold captures events too: a captured line went through the hook when first written;
//   - never when held events are released (deliver, not emit): a re-pushed line does not.
// TRIGGER_FACT is that classification, derived from the line each event projects to
// (packages/journal): `t`, `k` and `c` of the line give the kind and the card. tools/iso checks it
// against the legacy classifier, event by event.
//
// Then, in this order:
//   1. ultimates: the slots whose udecl the fact meets are flagged now (no draw, no event), with
//      the attack counts of now;
//   2. traps: the scan of the fact is deferred to the next flush, and evaluated with the state of
//      then (legacy: pendEv.push(() => scan(ev))). Except a trap that fires: it is scanned at once,
//      so that a trap answering it (adv_piege) acts first and can destroy or steal it.
// The hook only runs when a deck uses it (legacy TRIG / TRP): combats that use none of this keep
// their journal.

import { statusBadges, type BadgeKey } from '../combat/badges.ts';
import type { Combat } from '../combat/combat.ts';
import type { Side } from '../combat/state.ts';
import { scan } from '../combat/traps.ts';
import type { DomainEvent, EventType, SideIndex } from '../events.ts';
import type { Card } from '../model/card.ts';
import { NEW_TRAP_CONDITIONS } from '../model/types.ts';
import { bothConditions, fillGauge } from './ultimate-modes.ts';
import { usesTrapModes } from './trap-modes.ts';
import { usesMagicModes } from './magic-modes.ts';

export type TriggerFact =
  | {
      kind: 'status' | 'dodge' | 'trap' | 'block' | 'heal' | 'ultimate' | 'attack';
      who: SideIndex;
    }
  | { kind: 'hit'; who: SideIndex; amount: number; first?: boolean } // first: the combat's first hit
  | { kind: 'turn'; who: SideIndex; turn: number }
  | { kind: 'threads'; who: SideIndex; n: number } // n: the threads it carries now
  // No legacy line: the ultimate triggers and the trap conditions of November 2026 read them.
  | { kind: NewKind; who: SideIndex };

// Facts with no legacy line (who: the card it happens to; terrain: the invoker, or -1).
type NewKind =
  | 'purify'
  | 'avoidDeath'
  | 'revive'
  | 'atqDown'
  | 'maxDown'
  | 'atqUp'
  | 'magicAct' // its magic acts (mechanics/magic-timing.ts)
  | 'crit' // it lands a critical hit or a headshot
  | 'cancel' // its attack is cancelled (stun, frost, a cancelling block)
  | 'forge' // one of its cards is forged
  | 'control' // it takes control of the opponent's fighter
  | 'terrain' // the terrain changes
  | 'enter' // a fighter enters on its side (relay, control)
  | 'magicLost' // its magic is stolen, destroyed or cancelled
  | 'magicEnd' // its magic runs out
  | 'trapLost' // its trap is stolen or destroyed
  | 'molt'
  | 'rage'
  | 'mutation' // its insect mutation reaches level 3
  | 'detonate'; // a detonation explodes on it

type Classify<K extends EventType> = (
  e: Extract<DomainEvent, { type: K }>,
) => TriggerFact | TriggerFact[] | null;

type FactKind = 'status' | 'dodge' | 'trap' | 'block' | 'heal' | 'ultimate' | 'attack' | NewKind;

const fact =
  (kind: FactKind) =>
  (e: { side: SideIndex }): TriggerFact =>
    ({ kind, who: e.side }) as TriggerFact;

// Every event type, so that a new one must be classed. The legacy lines (trig):
//   statut with a negative status k  → status   (curse, bleed, poison, burn, frost, fracture, stun,
//                                                fatigue laid: the *Applied events, frozen, fractured,
//                                                stunned)
//   esquive                          → dodge
//   degats with n > 0, not a tick    → hit      (poison, burn and bleed ticks excluded)
//   piege without k                  → trap     (trapNullified has k 'bloque')
//   tour                             → turn
//   bloque                           → block    (c: the defender for a cancelled or blocked attack)
//   soin                             → heal
//   ultime                           → ultimate (programmed ones too)
//   attaque without k                → attack   (extraStrike has k 'enchaine')
// And, for the ultimate triggers only (no legacy line): purified with something removed → purify,
// deathAvoided → avoidDeath, revived → revive, statChanged with a loss of ATQ → atqDown, of max HP
// → maxDown.
export const TRIGGER_FACT: { [K in EventType]: Classify<K> | null } = {
  combatStarted: null,
  turnStarted: (e) => ({ kind: 'turn', who: e.side, turn: e.turn }),
  overtimeStarted: null,
  fighterEntered: fact('enter'),
  fighterExhausted: null,
  combatEnded: null,
  magicRevealed: null,
  magicCancelled: fact('magicLost'),
  magicBack: null,
  magicDestroyed: fact('magicLost'),
  trapFired: fact('trap'),
  trapNullified: null,
  trapDestroyed: fact('trapLost'),
  trapRearmed: null,
  ultimateTriggered: fact('ultimate'),
  ultimateCopied: null,
  ultimateAlreadyHeld: null,
  noUltimateToCopy: null,
  ultimateStolen: null,
  noUltimateToSteal: null,
  ultimateReset: null,
  theftScheduled: null,
  magicStolen: (e) => ({ kind: 'magicLost', who: e.from }),
  trapStolen: (e) => ({ kind: 'trapLost', who: e.from }),
  magicReturned: null,
  trapReturned: null,
  equipped: null,
  unknownEffect: null,
  randomEffectDrawn: null,
  cannotAttack: (e) =>
    e.reason === 'stunned' || e.reason === 'frozen' || e.reason === 'glaciation'
      ? { kind: 'cancel', who: e.side }
      : null,
  attackCancelled: (e) => [
    { kind: 'block', who: e.defender },
    { kind: 'cancel', who: e.side },
  ],
  attacked: fact('attack'),
  extraStrike: null,
  strike: null,
  dodged: fact('dodge'),
  damageReduced: fact('block'),
  nextAttackCancelled: null,
  nextAttackBlocked: null,
  attackBlocked: (e) => ({ kind: 'block', who: e.defender }),
  blockRiposte: null,
  damageDoubled: null,
  counterPrepared: null,
  damaged: (e) =>
    e.amount > 0 &&
    e.cause !== 'poison' &&
    e.cause !== 'burn' &&
    e.cause !== 'bleed' &&
    e.cause !== 'storm' // the storm triggers nothing (mechanics/storm.ts)
      ? { kind: 'hit', who: e.side, amount: e.amount }
      : null,
  healed: fact('heal'),
  deathAvoided: fact('avoidDeath'),
  avoidDeathBroken: null,
  avoidDeathGranted: null,
  reviveGranted: null,
  shattered: null,
  revived: fact('revive'),
  reviveDenied: null,
  statChanged: (e) =>
    e.delta < 0
      ? { kind: e.stat === 'atq' ? 'atqDown' : 'maxDown', who: e.side }
      : e.delta > 0 && e.stat === 'atq'
        ? { kind: 'atqUp', who: e.side }
        : null,
  dodgeChanged: null,
  statsSwapped: null,
  attackAndHpSwapped: null,
  statusEnded: null,
  statusDispelled: null,
  purified: (e) => (e.removedSomething ? { kind: 'purify', who: e.side } : null),
  rageStarted: fact('rage'),
  regenStarted: null,
  regenEnded: null,
  curseApplied: fact('status'),
  bleedApplied: fact('status'),
  dotApplied: fact('status'),
  fatigueApplied: fact('status'),
  frozen: fact('status'),
  frostShattered: null,
  thawed: null,
  fireExtinguished: null,
  knellLaid: fact('status'),
  knellRose: null,
  knellReceded: null,
  knelled: null,
  fractured: fact('status'),
  rooted: fact('status'),
  rootEnded: null,
  ultimateHeld: null,
  contaminated: fact('status'),
  vaporized: null,
  layerGained: null,
  shieldRaised: null,
  shieldAbsorbed: null,
  chargeGained: null,
  seismicStrike: null,
  criticalHit: fact('crit'),
  updraft: null,
  updraftEnded: null,
  bladesLaid: null,
  bladesStruck: null,
  lightningMarked: null,
  lightningStruck: null,
  lightningBounced: null,
  lightningFaded: null,
  blazeStarted: null,
  blazeEnded: null,
  furyGiven: null,
  furyChanged: null,
  leechGiven: null,
  leechEnded: null,
  poisonLeeched: null,
  venomInjected: null,
  overloaded: null,
  forged: fact('forge'),
  // Threads are marks, not statuses (no 'status' fact); the cost of a control triggers nothing.
  threadsLaid: (e) => ({ kind: 'threads', who: e.side, n: e.threads }),
  controlTaken: fact('control'),
  puppeteerPaid: null,
  controlEnded: null,
  forgeIdle: null,
  livingWeaponImmune: null,
  livingWeaponBurned: null,
  reconstructionFailed: null,
  scaled: null,
  stormStruck: null,
  terrainChanged: (e) => ({ kind: 'terrain', who: e.by ?? -1 }),
  terrainActs: null,
  forgeCreated: null,
  overloadEnded: null,
  voltCharged: null,
  discharged: null,
  willBroken: null,
  embraceGiven: null,
  targetLocked: null,
  targetKept: null,
  weakened: fact('status'),
  solidified: null,
  solidBroken: null,
  stunned: fact('status'),
  stunResisted: null,
  stunBlockedBySolid: null,
  breathed: null,
  breathResisted: null,
  breathDodged: fact('dodge'),
  breathBlocked: fact('block'),
  missileFired: null,
  missileDodged: fact('dodge'),
  missileBlocked: fact('block'),
  detonated: fact('detonate'),
  statusExploded: null,
  detonationEmpty: null,
  detonationDampened: null,
  attackEffectGranted: null,
  executionPrepared: null,
  markReceived: null,
  marksLost: null,
  executed: null,
  swallowPrepared: null,
  swallowMarkReceived: null,
  swallowFailed: null,
  swallowed: null,
  statusesTransferred: null,
  statusesShared: null,
  distorted: null,
  gagged: fact('status'),
  gagSprung: null,
  statusLostToSwallower: null,
  spatOut: null,
  digestionStarted: null,
  transcendenceArmed: null,
  transcendenceLost: null,
  transcended: null,
  programmed: null,
  stunnedCannot: null,
  programmingActivated: null,
  programmedPassivesAwake: null,
  programmedUltimateInstalled: null,
  programmedUltimate: fact('ultimate'),
  // New mechanics (no legacy line): a parasitic link is a negative status received.
  headshot: fact('crit'),
  targeted: null,
  targetMissed: null,
  targetEnded: null,
  mistRaised: null,
  mistMissed: null,
  mistBlocked: null,
  mistReturned: null,
  mistFaded: null,
  parasiteLinked: fact('status'),
  parasiteFed: null,
  parasiteEnded: null,
  mutated: (e) => (e.level >= 3 ? { kind: 'mutation', who: e.side } : null),
  moltStarted: fact('molt'),
  molted: null,
  defenseChanged: null,
  reductionGranted: null,
  reductionEnded: null,
  magicDelayed: null,
  magicActivated: null,
  magicExpired: fact('magicEnd'),
  trapCounted: null,
  trapPrimed: null,
  trapChained: null,
  gaugeFilled: null,
  ultimatePhase: null,
  ultimateDesperate: null,
  ultimateCountered: fact('ultimate'),
  magicWaiting: null,
  magicDormant: (e) => ({ kind: 'magicEnd', who: e.side }),
  magicSacrifice: null,
  magicTwist: null,
  magicPulse: (e) => ({ kind: 'magicAct', who: e.side }),
  magicScaled: null,
  magicPhase: (e) => ({ kind: 'magicAct', who: e.side }),
  magicUnstable: null,
  magicLocked: null,
  magicFollows: null,
  magicMirrored: null,
};

export function triggerFacts(e: DomainEvent): TriggerFact[] {
  const classify = TRIGGER_FACT[e.type] as Classify<EventType> | null;
  const f = classify ? classify(e as never) : null;
  return !f ? [] : Array.isArray(f) ? f : [f];
}

// Which part of the hook a combat uses, from both decks (legacy: TRIG, TRP).
export type Triggers = { any: boolean; traps: boolean };

// Trap conditions read from the facts (legacy: NEWC), and those of November 2026.
const FACT_CONDITIONS = new Set([
  'proprio_statut',
  'adv_statut',
  'proprio_esquive',
  'adv_esquive',
  'proprio_attaque',
  'proprio_coup_fort',
  'adv_piege',
  'tour_n',
  'proprio_bloque',
  'proprio_ultime',
  ...NEW_TRAP_CONDITIONS,
]);

// The conditions a trap or a magic waits for (mechanics/trap-modes.ts, mechanics/magic-modes.ts):
// its own, its second one, a magic's.
const conditionsOf = (card: Card): string[] => {
  const e = card.effet;
  if (!e) return [];
  return [e.condition?.type, e.condition2?.type, e.mdecl?.type].filter(
    (t): t is string => typeof t === 'string',
  );
};

export function triggersOf(decks: (Card[] | undefined)[]): Triggers {
  const cards = decks.flatMap((deck) => deck || []).filter(Boolean);
  const traps = cards.some(
    (card) =>
      conditionsOf(card).some((t) => FACT_CONDITIONS.has(t)) ||
      (card.type === 'piege' && usesTrapModes(card.effet)) ||
      (card.type === 'magie' && usesMagicModes(card.effet)),
  );
  const ultimates = cards.some((card) => card.ultime && (card.ultime.udecl || card.ultime.jauge));
  return { any: traps || !!ultimates, traps };
}

// Negative statuses a card carries (one per kind), and the highest level among them.
const NEGATIVE: ReadonlySet<BadgeKey> = new Set<BadgeKey>([
  'poison',
  'brulure',
  'saignement',
  'fatigue',
  'fracture',
  'glas',
  'malediction',
  'gel',
  'etourdi',
  'contamination',
  'faiblesse',
  'foudre',
  'enracinement',
  'gag',
]);
const LEVELED: ReadonlySet<BadgeKey> = new Set<BadgeKey>([
  'poison',
  'brulure',
  'saignement',
  'fatigue',
  'fracture',
  'glas',
  'gel',
  'foudre',
]);
export const negativeStatuses = (s: Side): number =>
  statusBadges(s).filter((b) => NEGATIVE.has(b.key)).length;
export const highestStatusLevel = (s: Side): number =>
  statusBadges(s).reduce((m, b) => (LEVELED.has(b.key) && b.n > m ? b.n : m), 0);

// An ultimate's event trigger, met by a fact for the card at index i (legacy: the table in trig).
export function meets(c: Combat, i: number, udecl: string, x: number, f: TriggerFact): boolean {
  const me = f.who === i;
  const opponentOf = f.who === 1 - i;
  const s = c.sides[i] as Side;
  const o = c.sides[1 - i] as Side;
  // Every entry is evaluated (none has a side effect), then the ultimate's own one is read.
  const triggers: Record<string, boolean> = {
    coups_recus: f.kind === 'attack' && opponentOf && o.attacks % x === 0,
    attaques: f.kind === 'attack' && me && s.attacks % x === 0,
    son_piege: f.kind === 'trap' && me,
    piege_adv: f.kind === 'trap' && opponentOf,
    adv_ultime: f.kind === 'ultimate' && opponentOf,
    statut: f.kind === 'status' && me,
    esquive: f.kind === 'dodge' && me,
    soigne: f.kind === 'heal' && me,
    coup_fort: f.kind === 'hit' && me && f.amount >= x,
    bloque: f.kind === 'block' && me,
    // the opponent's side of the same facts
    adv_soigne: f.kind === 'heal' && opponentOf,
    adv_statut: f.kind === 'status' && opponentOf,
    adv_esquive: f.kind === 'dodge' && opponentOf,
    adv_bloque: f.kind === 'block' && opponentOf,
    inflige_coup_fort: f.kind === 'hit' && opponentOf && f.amount >= x,
    // facts read by the ultimates only
    purifie: f.kind === 'purify' && me,
    adv_purifie: f.kind === 'purify' && opponentOf,
    evite_mort: f.kind === 'avoidDeath' && me,
    adv_evite_mort: f.kind === 'avoidDeath' && opponentOf,
    reanime: f.kind === 'revive' && me,
    adv_reanime: f.kind === 'revive' && opponentOf,
    atq_baisse: f.kind === 'atqDown' && me,
    adv_atq_baisse: f.kind === 'atqDown' && opponentOf,
    pvmax_baisse: f.kind === 'maxDown' && me,
    // November 2026 (the state ones are also checked at the start of its turn: ultimates.ts)
    tour_n: f.kind === 'turn' && f.turn === x,
    statuts: f.kind === 'status' && me && negativeStatuses(s) >= x,
    critique: f.kind === 'crit' && me,
    critique_recu: f.kind === 'crit' && opponentOf,
    adv_magie: f.kind === 'magicAct' && opponentOf,
    allie_tombe: f.kind === 'enter' && me,
    fils: f.kind === 'threads' && me && f.n >= x,
    se_forge: f.kind === 'forge' && me,
    serie: f.kind === 'attack' && me && s.status.hitStreak >= x,
    piege_perdu: f.kind === 'trapLost' && me,
    adv_magie_fin: (f.kind === 'magicEnd' || f.kind === 'magicLost') && opponentOf,
    mue: f.kind === 'molt' && me,
    rage: f.kind === 'rage' && me,
    mutation: f.kind === 'mutation' && me,
  };
  return !!triggers[udecl];
}

// Its part of a card's state: the strikes it made in a row without being hit, and the turn it was
// last hit on (its turns played then; -1: never).
export type TriggerWatchState = { hitStreak: number; lastHitTurn: number };
export const triggerWatchState = (): TriggerWatchState => ({ hitStreak: 0, lastHitTurn: 0 });

// What the facts leave behind, before anything reads them.
function keep(c: Combat, f: TriggerFact): void {
  if (f.kind === 'turn') c.turnNow = f.turn;
  const s = c.sides[f.who];
  if (f.kind === 'attack' && s) s.status.hitStreak++;
  if (f.kind === 'hit') {
    f.first = c.hitsSeen === 0;
    c.hitsSeen++;
    if (s) {
      s.status.hitStreak = 0;
      s.status.lastHitTurn = s.status.turnsPlayed;
    }
  }
}

// The hook, called by emit() for every event.
export function noticeTrigger(c: Combat, e: DomainEvent): void {
  for (const f of triggerFacts(e)) noticeFact(c, f);
}

// A fact: the ultimates it meets are flagged, the gauges it feeds fill, the traps and the waiting
// magics are scanned. Also called directly for the facts no event carries (a magic acting).
export function noticeFact(c: Combat, f: TriggerFact): void {
  if (!c.triggers.any) return;
  keep(c, f);
  c.sides.forEach((s, i) =>
    s.ultimates.forEach((slot) => {
      const u = slot.effect;
      if (!u) return;
      if (u.jauge) fillGauge(c, s, slot, f);
      if (!u.udecl) return;
      const x = Math.max(1, parseInt(String(u.udx), 10) || 1);
      const first = meets(c, i, u.udecl, x, f);
      if (!u.udecl2) {
        if (first) slot.triggered = 1;
        return;
      }
      const x2 = Math.max(1, parseInt(String(u.udx2), 10) || 1);
      const second = meets(c, i, u.udecl2, x2, f);
      bothConditions(slot, u.ulogique, first, second);
    }),
  );
  if (!c.triggers.traps) return;
  // A trap that fired is answered at once, before its own effect (a counter-trap, adv_piege):
  // traps.ts then drops the effect of a trap destroyed or stolen meanwhile.
  if (f.kind === 'trap') scan(c, { kind: 'fact', fact: f });
  else c.pendingEffects.push(() => scan(c, { kind: 'fact', fact: f }));
}
