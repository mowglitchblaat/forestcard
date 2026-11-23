// Traps: every combat event is scanned to see whether a trap condition is met.
//
// Since November 2026 a trap can also (mechanics/trap-modes.ts): wait for a second condition (both,
// `logique: 'et'`, or either one), fire only at the X-th time (`compte`), fire X of its owner's turns
// after (`retard`), re-arm X turns after its last trigger (`rearme`), and set off its card's ultimate
// or magic (`enchaine`). A magic can wait for a condition too (`mdecl`, mechanics/magic-modes.ts):
// it is scanned here with the traps.

import type { EffectData, TrapCondition } from '../model/card.ts';
import { highestStatusLevel, negativeStatuses, type TriggerFact } from '../mechanics/triggers.ts';
import { magicConditionMet } from '../mechanics/magic-modes.ts';
import { trapConditionMet, trapModesAtTurn, trapChains } from '../mechanics/trap-modes.ts';
import type { Side } from './state.ts';
import { applyEffect } from './effects.ts';
import { effetOf, emit, opponent, raw, type Combat } from './combat.ts';

export type ScanEvent =
  | { kind: 'attack'; by: number }
  | { kind: 'ultimate'; by: number }
  | { kind: 'hp' }
  | { kind: 'heal'; who: number }
  | { kind: 'death'; who: number; only?: number; skip?: number } // only / skip: avoid-death traps
  | { kind: 'fact'; fact: TriggerFact }; // mechanics/triggers.ts: only the conditions on facts read it

const count = (v: unknown): number => Math.max(1, parseInt(String(v), 10) || 1);

// Whether a condition is met by the event, for the card at index i (o) and its opponent (x).
export function meetsCondition(
  c: Combat,
  o: Side,
  i: number,
  condition: TrapCondition,
  ev: ScanEvent,
): boolean {
  const x = opponent(c, o);
  const ia = 1 - i;
  const f = ev.kind === 'fact' ? ev.fact : undefined;
  // Every condition is evaluated (none has a side effect), then the trap's own one is read.
  const conditions: Record<string, boolean> = {
    // every N attacks of the opponent (N, 2N, 3N…), up to the trigger count
    adv_attaque:
      ev.kind === 'attack' &&
      ev.by === ia &&
      x.attacks > 0 &&
      x.attacks % Math.max(1, parseInt(String(condition.coups), 10) || 1) === 0,
    adv_ultime: ev.kind === 'ultimate' && ev.by === ia,
    proprio_pv_sous:
      ev.kind === 'hp' && o.hp > 0 && (o.hp / o.maxHp) * 100 < raw(condition.seuilpv),
    adv_pv_bas: ev.kind === 'hp' && x.hp > 0 && (x.hp / x.maxHp) * 100 < raw(condition.seuilpv),
    adv_soigne: ev.kind === 'heal' && ev.who === ia,
    proprio_soigne: ev.kind === 'heal' && ev.who === i,
    proprio_meurt: ev.kind === 'death' && ev.who === i,
    proprio_statut: f?.kind === 'status' && f.who === i,
    adv_statut: f?.kind === 'status' && f.who === ia,
    proprio_esquive: f?.kind === 'dodge' && f.who === i,
    adv_esquive: f?.kind === 'dodge' && f.who === ia,
    proprio_attaque:
      f?.kind === 'attack' &&
      f.who === i &&
      o.attacks > 0 &&
      o.attacks % Math.max(1, parseInt(String(condition.coups), 10) || 1) === 0,
    proprio_coup_fort:
      f?.kind === 'hit' &&
      f.who === i &&
      f.amount >= Math.max(1, parseInt(String(condition.seuildeg), 10) || 1),
    adv_piege: f?.kind === 'trap' && f.who === ia,
    tour_n:
      f?.kind === 'turn' && f.turn === Math.max(1, parseInt(String(condition.ntour), 10) || 1),
    proprio_bloque: f?.kind === 'block' && f.who === i,
    proprio_ultime: f?.kind === 'ultimate' && f.who === i,
    // November 2026
    adv_magie: f?.kind === 'magicAct' && f.who === ia,
    adv_critique: f?.kind === 'crit' && f.who === ia,
    adv_bloque: f?.kind === 'block' && f.who === ia,
    proprio_annule: f?.kind === 'cancel' && f.who === i,
    adv_survit: (f?.kind === 'revive' || f?.kind === 'avoidDeath') && f.who === ia,
    adv_purifie: f?.kind === 'purify' && f.who === ia,
    proprio_statuts:
      f?.kind === 'status' && f.who === i && negativeStatuses(o) >= count(condition.nb),
    adv_statuts: f?.kind === 'status' && f.who === ia && negativeStatuses(x) >= count(condition.nb),
    proprio_statut_max: f?.kind === 'status' && f.who === i && highestStatusLevel(o) >= 3,
    adv_atq_hausse: f?.kind === 'atqUp' && f.who === ia,
    proprio_fils: f?.kind === 'threads' && f.who === i && f.n >= count(condition.nb),
    adv_forge: f?.kind === 'forge' && f.who === ia,
    adv_entree: f?.kind === 'enter' && f.who === ia,
    proprio_pv_sur:
      f?.kind === 'heal' &&
      f.who === i &&
      o.hp > 0 &&
      (o.hp / o.maxHp) * 100 >= (raw(condition.seuilpv) || 50),
    adv_rate: (f?.kind === 'dodge' && f.who === i) || (f?.kind === 'cancel' && f.who === ia),
    proprio_affaibli: (f?.kind === 'atqDown' || f?.kind === 'maxDown') && f.who === i,
    terrain_change: f?.kind === 'terrain',
    adv_controle: f?.kind === 'control' && f.who === ia,
    proprio_detone: f?.kind === 'detonate' && f.who === i,
    proprio_magie_perdue: f?.kind === 'magicLost' && f.who === i,
    premier_coup: f?.kind === 'hit' && !!f.first,
  };
  return !!conditions[condition.type as string];
}

export function scan(c: Combat, ev: ScanEvent): void {
  // A turn: delayed traps due, exhausted traps re-arming (mechanics/trap-modes.ts).
  if (ev.kind === 'fact' && ev.fact.kind === 'turn') trapModesAtTurn(c, ev.fact.turn);
  c.sides.forEach((o, i) => {
    magicConditionMet(c, o, i, ev); // a magic waiting for a condition (mechanics/magic-modes.ts)
    const e = effetOf(c, o.trap);
    if (!o.trapActive || !e || !e.condition || o.trapTriggers >= (e.declenchements || 1)) return;
    if (ev.kind === 'death') {
      const avoidsDeath =
        e.effet &&
        (e.effet.type === 'mort_evitee' ||
          (e.effet.briques || []).some((b) => (b as EffectData).type === 'mort_evitee'));
      if (ev.only && !avoidsDeath) return;
      if (ev.skip && avoidsDeath) return;
    }
    if (!trapConditionMet(c, o, i, e, ev)) return;
    fireTrap(c, o, i);
  });
}

// The trap of card o (at index i) fires now.
export function fireTrap(c: Combat, o: Side, i: number): void {
  const e = effetOf(c, o.trap);
  if (!e) return;
  const condition = e.condition as TrapCondition;
  const x = opponent(c, o);
  // Trap chain limited to 3 (two traps triggering each other would loop): the trap stays armed.
  if (c.trapChainDepth >= 3) return;
  if (x.status.trapImmunityTurns > 0) {
    // Immune opponent: the trap fires anyway (the trigger is consumed) but does nothing.
    o.trapTriggers++;
    const left = o.trapTriggers < (e.declenchements || 1);
    o.trapBlocked = left ? 1 : 0;
    emit(c, { type: 'trapNullified', side: i, target: c.sides.indexOf(x), exhausted: !left });
    return;
  }
  o.trapTriggers++;
  const card = o.trap;
  // Still armed and still ours: a trap destroyed or stolen does nothing more (a counter-trap,
  // adv_piege, answers at the trapFired event below; a trap broken between two bricks stops).
  const holds = () => !!o.trapActive && o.trap === card;
  c.trapChainDepth++;
  const previousSource = c.source;
  try {
    emit(c, { type: 'trapFired', side: i });
    if (condition.type === 'proprio_meurt') c.reviving = 1;
    c.source = 'piege';
    const bricks = e.effet && e.effet.briques ? e.effet.briques : [e.effet];
    for (const b of bricks) {
      if (!holds()) break;
      applyEffect(c, b as EffectData, o, x);
    }
    if (holds()) trapChains(c, o, e); // its ultimate or its magic, set off (enchaine)
  } finally {
    c.trapChainDepth--;
    c.source = previousSource;
  }
  c.reviving = 0;
  c.sides.forEach((s) => (s.cardActivated = 1));
}
