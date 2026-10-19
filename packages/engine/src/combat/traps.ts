// Traps: every combat event is scanned to see whether a trap condition is met.

import type { EffectData } from '../model/card.ts';
import type { TriggerFact } from '../mechanics/triggers.ts';
import { applyEffect } from './effects.ts';
import { emit, opponent, raw, type Combat } from './combat.ts';

export type ScanEvent =
  | { kind: 'attack'; by: number }
  | { kind: 'ultimate'; by: number }
  | { kind: 'hp' }
  | { kind: 'heal'; who: number }
  | { kind: 'death'; who: number; only?: number; skip?: number } // only / skip: avoid-death traps
  | { kind: 'fact'; fact: TriggerFact }; // mechanics/triggers.ts: only the conditions on facts read it

export function scan(c: Combat, ev: ScanEvent): void {
  c.sides.forEach((o, i) => {
    const e = o.trap.effet;
    if (!o.trapActive || !e || !e.condition || o.trapTriggers >= (e.declenchements || 1)) return;
    if (ev.kind === 'death') {
      const avoidsDeath =
        e.effet &&
        (e.effet.type === 'mort_evitee' ||
          (e.effet.briques || []).some((b) => (b as EffectData).type === 'mort_evitee'));
      if (ev.only && !avoidsDeath) return;
      if (ev.skip && avoidsDeath) return;
    }
    const condition = e.condition;
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
    };
    if (!conditions[condition.type as string]) return;
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
    emit(c, { type: 'trapFired', side: i });
    if (condition.type === 'proprio_meurt') c.reviving = 1;
    const previousSource = c.source;
    c.source = 'piege';
    c.trapChainDepth++;
    try {
      applyEffect(c, e.effet, o, x);
    } finally {
      c.trapChainDepth--;
    }
    c.source = previousSource;
    c.reviving = 0;
    c.sides.forEach((s) => (s.cardActivated = 1));
  });
}
