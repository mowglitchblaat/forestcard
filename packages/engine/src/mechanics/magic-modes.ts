// Magic modes (November 2026), set on the magic's effect next to its timing (magic-timing.ts):
//   - mdecl: it waits for a condition (any trap condition, combat/traps.ts), then acts;
//   - maura: it acts only while its card is under X % of its HP: it falls dormant above (its changes
//     undone) and wakes up again below;
//   - mterrain: it acts only on that terrain (mechanics/terrain.ts), `mterrainbonus` % stronger (30);
//   - mpulse: it acts once more every X of its card's turns (its effects add up);
//   - mcroit: it grows by X % at each of its card's turns (played again, stronger);
//   - mconsume: it starts X % stronger and loses X % at each of its card's turns; spent at 0;
//   - mphase2 (+ mphase2tours, 2 by default): after X of its card's turns, it turns into its second
//     effect (the first one undone);
//   - msacpv: when it acts, its card pays X % of its HP (never down to 0), for an effect `msacbonus`
//     % stronger (50);
//   - mparasite: it acts against the opponent, as if it were the opponent's magic;
//   - mpartage: it acts on both cards;
//   - minstable: at each of its card's turns, X % chance that it turns into an effect drawn at
//     random (mechanics/random.ts);
//   - mverrou: it cannot be stolen, cancelled nor destroyed; it is `mverroumalus` % weaker (25);
//   - mrelais: in a relay, it stays with the next fighter of its player (relay.ts).
// And the effect `miroir_magie`: the card plays the opponent's magic as its own.
// Only minstable draws a random number, and only for a magic that has it.

import { effetOf, emit, id, opponent, raw, roll, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import { applyEffect } from '../combat/effects.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import { meetsCondition, type ScanEvent } from '../combat/traps.ts';
import type { Card, EffectData } from '../model/card.ts';
import { scaleEffect } from './power.ts';
import { undoMagic } from './theft.ts';
import { noticeFact } from './triggers.ts';

// Its part of a side: what the magic in play is doing.
export type MagicModeState = {
  card: Card | null;
  waiting: '' | 'condition' | 'aura' | 'terrain'; // waiting to act (or dormant)
  acted: number; // it acted at least once
  turns: number; // its card's turns since it first acted
  phase: number; // 1, then 2 once it turned into its second effect
};

export const newMagicMode = (): MagicModeState => ({
  card: null,
  waiting: '',
  acted: 0,
  turns: 0,
  phase: 1,
});

const n = (v: unknown): number => Math.max(0, parseInt(String(v), 10) || 0);

function modeOf(s: Side): MagicModeState {
  if (s.magicMode.card !== s.magic) s.magicMode = { ...newMagicMode(), card: s.magic };
  return s.magicMode;
}

// A magic that cannot be stolen, cancelled nor destroyed: true, and told, when it resists.
export function magicLocked(
  c: Combat,
  s: Side,
  what: 'vol' | 'annulation' | 'destruction',
): boolean {
  if (!effetOf(c, s.magic)?.mverrou) return false;
  emit(c, { type: 'magicLocked', side: id(c, s), what });
  return true;
}

const underAura = (s: Side, e: EffectData) => s.hp > 0 && (s.hp / s.maxHp) * 100 < raw(e.maura);
const onTerrain = (c: Combat, e: EffectData) => c.terrain === e.mterrain;

// How much stronger (or weaker) it plays now.
function factor(c: Combat, e: EffectData, m: MagicModeState): number {
  let f = 1;
  if (n(e.msacpv) > 0)
    f *= 1 + (e.msacbonus == null || e.msacbonus === '' ? 50 : n(e.msacbonus)) / 100;
  if (e.mterrain && onTerrain(c, e))
    f *= 1 + (e.mterrainbonus == null || e.mterrainbonus === '' ? 30 : n(e.mterrainbonus)) / 100;
  if (e.mverrou)
    f *=
      1 -
      Math.min(90, e.mverroumalus == null || e.mverroumalus === '' ? 25 : n(e.mverroumalus)) / 100;
  if (n(e.mcroit) > 0) f *= 1 + (n(e.mcroit) * m.turns) / 100;
  if (n(e.mconsume) > 0) f *= 1 + (n(e.mconsume) * (1 - m.turns)) / 100;
  return f;
}

// Plays its effect on the cards it aims at: the opponent for a parasite, both cards when shared.
// Its changes are always kept with the magic (undone with it).
function play(c: Combat, s: Side, effect: EffectData | null | undefined): void {
  const x = opponent(c, s);
  const e = effetOf(c, s.magic);
  const previous = c.source;
  c.source = 'magie';
  const onOpponent = () => {
    const first = x.magicDeltas.length;
    applyEffect(c, effect, x, s, true);
    s.magicDeltas.push(...x.magicDeltas.splice(first));
  };
  if (e?.mparasite) onOpponent();
  else {
    applyEffect(c, effect, s, x, true);
    if (e?.mpartage && x.hp > 0) onOpponent();
  }
  c.source = previous;
}

// Its effect as it plays now (second phase, made stronger or weaker).
function current(c: Combat, e: EffectData, m: MagicModeState) {
  const effect = m.phase === 2 && e.mphase2 ? e.mphase2 : e;
  return scaleEffect(effect, factor(c, e, m));
}

// Whether the magic waits instead of acting now (a condition, an aura, a terrain). Told once.
export function magicWaits(c: Combat, s: Side, e: EffectData): boolean {
  const m = modeOf(s);
  const why =
    e.mdecl && e.mdecl.type && !m.acted
      ? 'condition'
      : n(e.maura) > 0 && !underAura(s, e)
        ? 'aura'
        : e.mterrain && !onTerrain(c, e)
          ? 'terrain'
          : '';
  if (!why) return false;
  if (m.waiting !== why) emit(c, { type: 'magicWaiting', side: id(c, s), why });
  m.waiting = why;
  return true;
}

// The magic acts: its sacrifice, its targets, its strength (magic-timing.ts, when it acts).
export function actMagic(c: Combat, s: Side, e: EffectData): void {
  const m = modeOf(s);
  m.waiting = '';
  const cost = n(e.msacpv);
  if (cost > 0 && s.hp > 1) {
    const paid = Math.min(s.hp - 1, Math.max(1, Math.round((s.hp * cost) / 100)));
    s.hp -= paid;
    emit(c, { type: 'magicSacrifice', side: id(c, s), amount: paid });
  }
  if (e.mparasite || e.mpartage)
    emit(c, { type: 'magicTwist', side: id(c, s), how: e.mparasite ? 'parasite' : 'partage' });
  play(c, s, current(c, e, m));
  m.acted = 1;
  noticeFact(c, { kind: 'magicAct', who: id(c, s) });
}

// A waiting magic wakes up (its condition, its aura, its terrain).
function wake(c: Combat, s: Side, e: EffectData): void {
  emit(c, { type: 'magicActivated', side: id(c, s) });
  actMagic(c, s, e);
  c.sides.forEach((k) => (k.cardActivated = 1));
}

// A magic of aura or of terrain falls dormant: its changes undone, it waits again.
function sleep(c: Combat, s: Side, why: 'aura' | 'terrain'): void {
  undoMagic(s);
  modeOf(s).waiting = why;
  emit(c, { type: 'magicDormant', side: id(c, s), why });
}

const playing = (c: Combat, s: Side): EffectData | null => {
  const e = effetOf(c, s.magic);
  return s.magicActive && !s.magicStolen && !s.magicStartTurn && e ? e : null;
};

// Every scan (combat/traps.ts): a magic waiting for its condition; an aura crossing its threshold;
// a terrain coming or going.
export function magicConditionMet(c: Combat, s: Side, i: number, ev: ScanEvent): void {
  const e = playing(c, s);
  if (!e || s.hp <= 0) return;
  const m = modeOf(s);
  if (m.waiting === 'condition') {
    if (e.mdecl && meetsCondition(c, s, i, e.mdecl, ev) && !magicWaitsAgain(c, s, e)) wake(c, s, e);
    return;
  }
  if (n(e.maura) > 0 && (ev.kind === 'hp' || ev.kind === 'heal')) {
    if (m.waiting === 'aura' && underAura(s, e)) wake(c, s, e);
    else if (!m.waiting && m.acted && !underAura(s, e)) sleep(c, s, 'aura');
    return;
  }
  if (e.mterrain && ev.kind === 'fact' && ev.fact.kind === 'terrain') {
    if (m.waiting === 'terrain' && onTerrain(c, e)) wake(c, s, e);
    else if (!m.waiting && m.acted && !onTerrain(c, e)) sleep(c, s, 'terrain');
  }
}

// Its condition met, the magic may still wait for its aura or its terrain.
function magicWaitsAgain(c: Combat, s: Side, e: EffectData): boolean {
  modeOf(s).acted = 1; // the condition is done with
  const waits = magicWaits(c, s, e);
  if (!waits) modeOf(s).acted = 0;
  return waits;
}

// Start of its card's turn: the modes that change it as turns go by.
export function magicModesAtStart(c: Combat, s: Side): Flow {
  const e = playing(c, s);
  const m = modeOf(s);
  if (!e || !m.acted || m.waiting || s.hp <= 0) return undefined;
  m.turns++;
  const x = opponent(c, s);
  if (e.mphase2 && m.phase === 1 && m.turns >= (n(e.mphase2tours) || 2)) {
    undoMagic(s);
    m.phase = 2;
    emit(c, { type: 'magicPhase', side: id(c, s) });
    play(c, s, current(c, e, m));
  } else if (n(e.mconsume) > 0) {
    undoMagic(s);
    const f = factor(c, e, m);
    if (f <= 0) {
      s.magicActive = 0;
      emit(c, { type: 'magicExpired', side: id(c, s) });
      return s.hp <= 0 ? 'stop' : undefined;
    }
    emit(c, { type: 'magicScaled', side: id(c, s), pct: Math.round(f * 100), grows: false });
    play(c, s, current(c, e, m));
  } else if (n(e.mcroit) > 0) {
    undoMagic(s);
    emit(c, {
      type: 'magicScaled',
      side: id(c, s),
      pct: Math.round(factor(c, e, m) * 100),
      grows: true,
    });
    play(c, s, current(c, e, m));
  }
  const every = n(e.mpulse);
  if (every > 0 && m.turns % every === 0 && s.magicActive) {
    emit(c, { type: 'magicPulse', side: id(c, s) });
    play(c, s, current(c, e, m));
  }
  if (n(e.minstable) > 0 && s.magicActive && x.hp > 0 && roll(c, n(e.minstable))) {
    undoMagic(s);
    emit(c, { type: 'magicUnstable', side: id(c, s) });
    play(c, s, { type: 'aleatoire', nbalea: 1 });
  }
  return s.hp <= 0 ? 'stop' : undefined;
}

// The effect miroir_magie: the card plays the opponent's magic as its own.
export function mirrorEffect({ c, o, x, fromMagic }: EffectContext): void {
  const theirs = x.magicActive && !x.magicStolen ? effetOf(c, x.magic) : null;
  const mirrors = (e: EffectData | null | undefined): boolean =>
    !!e && (e.type === 'miroir_magie' || (e.briques || []).some((b) => mirrors(b)));
  if (!theirs || mirrors(theirs)) {
    emit(c, { type: 'magicMirrored', side: id(c, o), from: id(c, x), copied: false });
    return;
  }
  emit(c, { type: 'magicMirrored', side: id(c, o), from: id(c, x), copied: true });
  applyEffect(c, theirs, o, x, fromMagic);
}

// Its effects (the registry of effects.ts).
export const effects = {
  miroir_magie: { run: mirrorEffect, once: true },
} satisfies EffectRules;

// What the combat needs for the magic modes: the scans on facts (mechanics/triggers.ts).
export const usesMagicModes = (e: EffectData | null | undefined): boolean =>
  !!e && (!!e.mdecl?.type || !!e.mterrain);
