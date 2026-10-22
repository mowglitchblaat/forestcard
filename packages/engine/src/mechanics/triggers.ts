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

import type { Combat } from '../combat/combat.ts';
import { scan } from '../combat/traps.ts';
import type { DomainEvent, EventType, SideIndex } from '../events.ts';
import type { Card } from '../model/card.ts';

export type TriggerFact =
  | {
      kind: 'status' | 'dodge' | 'trap' | 'block' | 'heal' | 'ultimate' | 'attack';
      who: SideIndex;
    }
  | { kind: 'hit'; who: SideIndex; amount: number }
  | { kind: 'turn'; who: SideIndex; turn: number };

type Classify<K extends EventType> = (e: Extract<DomainEvent, { type: K }>) => TriggerFact | null;

const fact =
  (kind: 'status' | 'dodge' | 'trap' | 'block' | 'heal' | 'ultimate' | 'attack') =>
  (e: { side: SideIndex }): TriggerFact => ({ kind, who: e.side });

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
export const TRIGGER_FACT: { [K in EventType]: Classify<K> | null } = {
  combatStarted: null,
  turnStarted: (e) => ({ kind: 'turn', who: e.side, turn: e.turn }),
  overtimeStarted: null,
  fighterEntered: null,
  fighterExhausted: null,
  combatEnded: null,
  magicRevealed: null,
  magicCancelled: null,
  magicBack: null,
  magicDestroyed: null,
  trapFired: fact('trap'),
  trapNullified: null,
  trapDestroyed: null,
  trapRearmed: null,
  ultimateTriggered: fact('ultimate'),
  ultimateCopied: null,
  ultimateAlreadyHeld: null,
  noUltimateToCopy: null,
  ultimateStolen: null,
  noUltimateToSteal: null,
  ultimateReset: null,
  theftScheduled: null,
  magicStolen: null,
  trapStolen: null,
  magicReturned: null,
  trapReturned: null,
  equipped: null,
  unknownEffect: null,
  randomEffectDrawn: null,
  cannotAttack: null,
  attackCancelled: (e) => ({ kind: 'block', who: e.defender }),
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
    e.amount > 0 && e.cause !== 'poison' && e.cause !== 'burn' && e.cause !== 'bleed'
      ? { kind: 'hit', who: e.side, amount: e.amount }
      : null,
  healed: fact('heal'),
  deathAvoided: null,
  avoidDeathGranted: null,
  reviveGranted: null,
  shattered: null,
  revived: null,
  reviveDenied: null,
  statChanged: null,
  dodgeChanged: null,
  statsSwapped: null,
  attackAndHpSwapped: null,
  statusEnded: null,
  statusDispelled: null,
  purified: null,
  rageStarted: null,
  regenStarted: null,
  regenEnded: null,
  curseApplied: fact('status'),
  bleedApplied: fact('status'),
  dotApplied: fact('status'),
  fatigueApplied: fact('status'),
  frozen: fact('status'),
  fractured: fact('status'),
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
  detonated: null,
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
  statusLostToSwallower: null,
  spatOut: null,
  digestionStarted: null,
  transcendenceArmed: null,
  transcendenceLost: null,
  transcended: null,
  programmed: null,
  programmingActivated: null,
  programmedPassivesAwake: null,
  programmedUltimate: fact('ultimate'),
};

export function triggerFact(e: DomainEvent): TriggerFact | null {
  const classify = TRIGGER_FACT[e.type] as Classify<EventType> | null;
  return classify ? classify(e as never) : null;
}

// Which part of the hook a combat uses, from both decks (legacy: TRIG, TRP).
export type Triggers = { any: boolean; traps: boolean };

// Trap conditions read from the facts (legacy: NEWC).
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
]);

export function triggersOf(decks: (Card[] | undefined)[]): Triggers {
  const cards = decks.flatMap((deck) => deck || []);
  const traps = cards.some(
    (card) =>
      card &&
      card.effet &&
      card.effet.condition &&
      FACT_CONDITIONS.has(card.effet.condition.type as string),
  );
  const ultimates = cards.some((card) => card && card.ultime && card.ultime.udecl);
  return { any: traps || !!ultimates, traps };
}

// An ultimate's event trigger, met by a fact for the card at index i (legacy: the table in trig).
function meets(c: Combat, i: number, udecl: string, x: number, f: TriggerFact): boolean {
  const me = f.who === i;
  const opponentOf = f.who === 1 - i;
  const s = c.sides[i] as Combat['sides'][number];
  const o = c.sides[1 - i] as Combat['sides'][number];
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
  };
  return !!triggers[udecl];
}

// The hook, called by emit() for every event.
export function noticeTrigger(c: Combat, e: DomainEvent): void {
  const f = triggerFact(e);
  if (!f) return;
  c.sides.forEach((s, i) =>
    s.ultimates.forEach((slot) => {
      const u = slot.effect;
      if (!u || !u.udecl) return;
      const x = Math.max(1, parseInt(String(u.udx), 10) || 1);
      if (meets(c, i, u.udecl, x, f)) slot.triggered = 1;
    }),
  );
  if (!c.triggers.traps) return;
  // A trap that fired is answered at once, before its own effect (a counter-trap, adv_piege):
  // traps.ts then drops the effect of a trap destroyed or stolen meanwhile.
  if (f.kind === 'trap') scan(c, { kind: 'fact', fact: f });
  else c.pendingEffects.push(() => scan(c, { kind: 'fact', fact: f }));
}
