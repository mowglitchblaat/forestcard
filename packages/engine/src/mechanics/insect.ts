// Insect mutation and molt.
//
// Mutation (passive mutation): the card goes up one level (3 at most, for the whole combat) each
// time it takes a negative status, and each time it spends 4 of its turns in a row without any
// negative status on it. What each level brings, on top of the previous ones:
//   I   ATQ +matq and HP +mpv (unit `u`: points or % of its ATQ / max HP);
//   II  damage taken −mreduc %, and its attack can make the target bleed (msaignch % of chances,
//       its level msaignniv, from msaignpct % of max HP when empty, msaigntours turns);
//   III an instant molt (the molt values of the mutation, or of the card's mue passive), dodge
//       +mesq %, and a parasitic link on the opponent for lientours turns (its heals feed the card).
//
// Molt (passive mue): starts after 2 of its turns in a row ending with a negative status on it (an
// execution mark is not a status: it does not start it). Then 2 turns of molt: at the start of the second turn
// after, before its attack, the card molts: every negative status (stun included), its execution
// marks, a targeting mark and a parasitic link on it are removed; it loses mueatq ATQ (unit uatq)
// and muepv max HP (unit upv; 10 % each when empty). It can molt again later.

import { explicitLevel, legacyLevel } from '../model/levels.ts';
import { emit, id, opponent, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData, Num } from '../model/card.ts';
import { grantAttackEffect } from './attack-effects.ts';
import { linkCount, links, parasiteTurns, sharePct, unlink } from './parasite.ts';
import { hasPurifiableStatus, purify } from './purification.ts';
import { earthMolt } from './earth.ts';
import { gainOf, grow } from './reaction.ts';

// Its part of a card's status (combat/state.ts).
export type InsectState = {
  mutationLevel: number;
  quietTurns: number; // its turns in a row without a negative status (mutation)
  statusTurns: number; // its turns in a row ending with a negative status (molt)
  moltTurns: number; // > 0: molting, turns before the molt
};
export const insectState = (): InsectState => ({
  mutationLevel: 0,
  quietTurns: 0,
  statusTurns: 0,
  moltTurns: 0,
});

const mutationOf = (s: Side): EffectData | undefined =>
  s.passives.find((p) => p.type === 'mutation');
const moltOf = (s: Side): EffectData | undefined => s.passives.find((p) => p.type === 'mue');

const negative = (s: Side): boolean =>
  !!hasPurifiableStatus(s.status) ||
  s.status.stunTurns > 0 ||
  s.status.parasites.length > 0 ||
  !!s.status.weakness;

const filled = (v: Num | undefined): boolean => v != null && v !== '';
const loss = (v: Num | undefined, unit: string | undefined, base: number): number =>
  filled(v) ? gainOf(v, unit, base) : round((base * 10) / 100);

// ── Molt ──

function startMolt(c: Combat, s: Side): void {
  s.status.moltTurns = 2;
  s.status.statusTurns = 0;
  emit(c, { type: 'moltStarted', side: id(c, s), turns: 2 });
}

// Values: the mutation's when it gives them, else the mue passive's.
export function molt(c: Combat, s: Side, values: EffectData | undefined, instant: boolean): void {
  if (s.hp <= 0) return;
  const q = values ?? {};
  s.status.moltTurns = 0;
  s.status.statusTurns = 0;
  emit(c, { type: 'molted', side: id(c, s), instant });
  purify(c, s);
  if (s.status.stunTurns > 0) {
    s.status.stunTurns = 0;
    emit(c, { type: 'statusEnded', side: id(c, s), status: 'stun' });
  }
  earthMolt(s);
  if (s.status.weakness) {
    s.status.weakness = null;
    emit(c, { type: 'statusEnded', side: id(c, s), status: 'weakness' });
  }
  const marks = s.status.executionMarks;
  if (marks > 0) {
    s.status.executionMarks = 0;
    emit(c, { type: 'marksLost', side: id(c, s), count: marks, marks: 0 });
  }
  if (s.status.targeted) {
    s.status.targeted = null;
    emit(c, { type: 'targetEnded', side: id(c, s) });
  }
  unlink(c, s);
  const atq = Math.min(s.atq, Math.max(0, loss(q.mueatq, q.uatq, s.atq)));
  if (atq > 0) {
    s.atq -= atq;
    emit(c, { type: 'statChanged', side: id(c, s), stat: 'atq', delta: -atq, cause: 'molt' });
  }
  const hp = Math.min(s.maxHp - 1, Math.max(0, loss(q.muepv, q.upv, s.maxHp)));
  if (hp > 0) {
    s.maxHp -= hp;
    s.hp = Math.max(1, Math.min(s.maxHp, s.hp - hp));
    emit(c, { type: 'statChanged', side: id(c, s), stat: 'max', delta: -hp, cause: 'molt' });
  }
}

// Start of its turn, before its attack: the molt counts down, and happens at 0.
export function moltAtStart(c: Combat, s: Side): Flow {
  if (s.status.moltTurns > 0 && --s.status.moltTurns === 0) molt(c, s, moltOf(s), false);
  return undefined;
}

// End of its turn: 2 turns in a row ending with a negative status start the molt.
export function moltWatch(c: Combat, s: Side): Flow {
  if (s.hp <= 0 || !moltOf(s) || s.status.moltTurns > 0) return undefined;
  if (!negative(s)) s.status.statusTurns = 0;
  else if (++s.status.statusTurns >= 2) startMolt(c, s);
  return undefined;
}

// ── Mutation ──

function mutate(c: Combat, s: Side, p: EffectData): void {
  if (s.status.mutationLevel >= 3 || s.hp <= 0) return;
  const level = ++s.status.mutationLevel;
  emit(c, { type: 'mutated', side: id(c, s), level });
  if (level === 1) {
    grow(c, s, 'atq', gainOf(p.matq, p.u, s.atq), 'mutation');
    grow(c, s, 'pv', gainOf(p.mpv, p.u, s.maxHp), 'mutation');
  } else if (level === 2) {
    const reduce = +(p.mreduc as number) || 0;
    if (reduce > 0) {
      s.status.armorPct += reduce;
      emit(c, { type: 'defenseChanged', side: id(c, s), kind: 'reduce', delta: reduce });
    }
    const pct = +(p.msaignpct as number) || 0;
    const set = explicitLevel(p.msaignniv);
    if (pct > 0 || set) {
      const chance = filled(p.msaignch) ? +(p.msaignch as number) || 0 : 100;
      grantAttackEffect(
        s,
        {
          type: 'saignement',
          chance,
          niveau: set || legacyLevel('saignement', { pctpv: pct }),
          tours: Math.max(1, parseInt(String(p.msaigntours), 10) || 2),
        },
        false,
      );
      emit(c, { type: 'attackEffectGranted', side: id(c, s), effect: 'saignement', chance });
    }
  } else {
    const own = filled(p.mueatq) || filled(p.muepv);
    molt(c, s, own ? p : moltOf(s), true);
    grow(c, s, 'esquive', +(p.mesq as number) || 0, 'mutation');
    const x = opponent(c, s);
    if (x.hp > 0)
      links(c, x, s, parasiteTurns(p.lientours), sharePct(p.pctlien), linkCount(p.nbliens));
  }
}

// A negative status received.
export function mutationOnStatus(c: Combat, s: Side): void {
  const p = mutationOf(s);
  if (!p) return;
  s.status.quietTurns = 0;
  mutate(c, s, p);
}

// End of its turn: 4 turns in a row without a negative status, one level more.
export function mutationQuiet(c: Combat, s: Side): Flow {
  const p = mutationOf(s);
  if (!p || s.hp <= 0 || s.status.mutationLevel >= 3) return undefined;
  if (negative(s)) s.status.quietTurns = 0;
  else if (++s.status.quietTurns >= 4) {
    s.status.quietTurns = 0;
    mutate(c, s, p);
  }
  return undefined;
}

// ── Forced molt (effect mue_forcee: magic, ultimate, trap) ──

// The target (`cible`: itself by default, or the opponent) molts at once, X % of chances (100 when
// empty). Its values: the effect's own, else the target's mue passive, else 10 %.
export function forcedMoltEffect({ c, e, o, x }: EffectContext): void {
  const T = e.cible === 'adversaire' ? x : o;
  const chance = e.chance == null || e.chance === '' ? 100 : +e.chance || 0;
  if (chance < 100 && !roll(c, chance)) return;
  const own = filled(e.mueatq) || filled(e.muepv);
  molt(c, T, own ? e : moltOf(T), true);
}

// Its effects (the registry of effects.ts).
export const effects = {
  mue_forcee: { run: forcedMoltEffect, once: true },
} satisfies EffectRules;
