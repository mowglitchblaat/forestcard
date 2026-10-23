// SWALLOWING. Fork on the 1st successful attack, knife on the 2nd, then on the 3rd the card tries to
// swallow its target. It needs current HP >= ratio x the target's ATQ (3 by default), else the marks
// drop. Once swallowed, the target is chewed on each of the swallower's turns (X % of its max or
// current HP), X times (3), then spat out; the swallower then digests X turns without attacking.
// Meanwhile neither attacks, and whatever targeted the swallowed card hits the swallower. If the
// target carries negative statuses, they move to the swallower right away (x1.5 intensity and
// duration): one bite, then the target is spat out.

import type { Attack } from '../combat/attack.ts';
import { emit, id, opponent, over, roll, round, type Combat } from '../combat/combat.ts';
import { damage } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow, StrikeFlow } from '../combat/flow.ts';
import type { Side, Status } from '../combat/state.ts';
import type { DispelledStatus } from '../events.ts';
import { grantAttackEffect } from './attack-effects.ts';
import type { EffectData } from '../model/card.ts';
import { bleed } from './bleed.ts';
import { curse } from './curse.ts';
import { damageOverTime } from './dot.ts';
import { fatigue } from './fatigue.ts';
import { freeze } from './frost.ts';

export type Swallow = {
  victim: Side;
  bites: number;
  maxBites: number;
  pct: number;
  base: 'actuels' | 'max';
  digestTurns: number;
  fresh: number; // swallowed during this turn: chewing starts next turn
  single: number; // statuses were transferred: one bite only
};

// Its part of a card's status (combat/state.ts).
export type SwallowState = {
  swallowMarks: number;
  swallowedBy: Side | null;
  swallowing: Swallow | null;
  digestTurns: number;
};
export const swallowState = (): SwallowState => ({
  swallowMarks: 0,
  swallowedBy: null,
  swallowing: null,
  digestTurns: 0,
});

const hasNegativeStatus = (z: Status) =>
  z.dots.length || z.frosts.length || z.curses.length || z.bleeds.length || z.fatigues.length;

export function markSwallow(c: Combat, d: Side, n: number): void {
  if (d.hp <= 0 || d.status.swallowedBy) return;
  for (let k = 0; k < n && d.status.swallowMarks < 2; k++) {
    d.status.swallowMarks++;
    emit(c, { type: 'swallowMarkReceived', side: id(c, d), marks: d.status.swallowMarks });
  }
}

// Returns true when the target is swallowed (the swallow replaces the hit).
export function swallow(c: Combat, a: Side, d: Side, q: EffectData): boolean {
  const ratio = Math.max(0, q.ratio == null || q.ratio === '' ? 3 : +q.ratio || 0);
  d.status.swallowMarks = 0;
  if (a.hp < ratio * d.atq) {
    emit(c, { type: 'swallowFailed', side: id(c, a), target: id(c, d), ratio });
    return false;
  }
  const state: Swallow = {
    victim: d,
    bites: 0,
    maxBites: Math.max(1, parseInt(String(q.tours), 10) || 3),
    pct: q.pctmache == null || q.pctmache === '' ? 10 : +q.pctmache || 0,
    base: q.machebase === 'actuels' ? 'actuels' : 'max',
    digestTurns: Math.max(0, parseInt(String(q.repos), 10) || 0),
    fresh: 1,
    single: 0,
  };
  d.status.swallowedBy = a;
  a.status.swallowing = state;
  emit(c, { type: 'swallowed', side: id(c, a), target: id(c, d) });
  if (hasNegativeStatus(d.status)) {
    state.single = 1;
    transferStatuses(c, a, d);
  }
  return true;
}

function transferStatuses(c: Combat, a: Side, d: Side): void {
  const z = d.status;
  const longer = (t: number) => Math.ceil((t || 1) * 1.5);
  const dots = z.dots.slice();
  const frosts = z.frosts.slice();
  const curses = z.curses.slice();
  const bleeds = z.bleeds.slice();
  const fatigues = z.fatigues.slice();
  const atqBack = z.atqLostToCurses + fatigues.reduce((q, f) => q + (f.lost || 0), 0);
  const kinds = [
    ...new Set<DispelledStatus>([
      ...dots.map((x): DispelledStatus => (x.kind === 'poison' ? 'poison' : 'brulure')),
      ...(frosts.length ? (['gel'] as const) : []),
      ...(curses.length ? (['malediction'] as const) : []),
      ...(bleeds.length ? (['saignement'] as const) : []),
      ...(fatigues.length ? (['fatigue'] as const) : []),
    ]),
  ];
  z.dots = [];
  z.frosts = [];
  z.curses = [];
  z.atqLostToCurses = 0;
  z.curseReturns = [];
  z.bleeds = [];
  z.fatigues = [];
  emit(c, { type: 'statusesTransferred', side: id(c, a), from: id(c, d), kinds });
  kinds.forEach((status) => emit(c, { type: 'statusLostToSwallower', side: id(c, d), status }));
  if (atqBack > 0) {
    d.atq += atqBack;
    emit(c, {
      type: 'statChanged',
      side: id(c, d),
      stat: 'atq',
      delta: atqBack,
      cause: 'statusesLeft',
    });
  }
  dots.forEach((x) => damageOverTime(c, a, x.kind, round(x.amount * 1.5), longer(x.turns)));
  frosts.forEach((f) =>
    freeze(
      c,
      a,
      Math.min(100, round(f.cancelChance * 1.5)),
      round(f.shatter * 1.5),
      longer(f.turns),
      f.level,
    ),
  );
  curses.forEach((x) => curse(c, a, round(x.amount * 1.5), longer(x.turns)));
  bleeds.forEach((b) =>
    bleed(c, a, round(b.pct * 1.5), Math.min(100, round(b.healReduction * 1.5)), longer(b.turns)),
  );
  fatigues.forEach((f) => fatigue(c, a, round(f.amount * 1.5), 'pts', longer(f.turns)));
}

// Played after the swallower's attack.
export function chew(c: Combat, s: Side): void {
  const state = s.status.swallowing;
  if (!state) return;
  const victim = state.victim;
  if (victim !== opponent(c, s) || victim.hp <= 0) {
    spitOut(c, s, false);
    return;
  }
  if (state.fresh) {
    state.fresh = 0;
    return;
  }
  state.bites++;
  const n = damage(
    c,
    s,
    victim,
    ((state.base === 'actuels' ? victim.hp : victim.maxHp) * state.pct) / 100,
  );
  emit(c, {
    type: 'damaged',
    side: id(c, victim),
    amount: n,
    cause: 'chew',
    by: id(c, s),
    bite: state.bites,
    bites: state.maxBites,
    single: !!state.single,
  });
  if (over(c)) return;
  if (state.single) spitOut(c, s, false);
  else if (state.bites >= state.maxBites) spitOut(c, s, true);
}

// complete: all bites done, the swallower digests.
function spitOut(c: Combat, s: Side, complete: boolean): void {
  const state = s.status.swallowing;
  if (!state) return;
  const victim = state.victim;
  s.status.swallowing = null;
  if (victim.status.swallowedBy === s) victim.status.swallowedBy = null;
  emit(c, { type: 'spatOut', side: id(c, s), target: id(c, victim) });
  if (complete && state.digestTurns > 0) {
    s.status.digestTurns = state.digestTurns;
    emit(c, { type: 'digestionStarted', side: id(c, s), turns: state.digestTurns });
  }
}

// Swallowing: neither card attacks.
export function mouthFull(c: Combat, { a, ia }: Attack): Flow {
  if (!a.status.swallowing) return undefined;
  emit(c, { type: 'cannotAttack', side: ia, reason: 'mouthFull' });
  return 'stop';
}

export function swallowed(c: Combat, { a, ia }: Attack): Flow {
  if (!a.status.swallowedBy) return undefined;
  emit(c, {
    type: 'cannotAttack',
    side: ia,
    reason: 'swallowed',
    swallower: id(c, a.status.swallowedBy),
  });
  return 'stop';
}

export function digesting(c: Combat, { a, ia }: Attack): Flow {
  if (!(a.status.digestTurns > 0)) return undefined;
  a.status.digestTurns--;
  emit(c, { type: 'cannotAttack', side: ia, reason: 'digesting' });
  return 'stop';
}

// Third successful attack: swallowing replaces the damage (if it fails, the marks drop and the hit
// lands normally).
export function swallowAttempt(c: Combat, at: Attack): StrikeFlow {
  const { a, d } = at;
  if (
    !at.swallowTried &&
    d.hp > 0 &&
    d.status.swallowMarks >= 2 &&
    !a.status.swallowing &&
    !d.status.swallowedBy
  ) {
    const q = [...a.passives, ...a.status.attackEffects].find((q) => q.type === 'avalage');
    if (q) {
      at.swallowTried = 1;
      if (swallow(c, a, d, q)) return 'break';
    }
  }
  return undefined;
}

// Swallowing: fork on the 1st successful attack, knife on the 2nd.
export function swallowMark(c: Combat, at: Attack): StrikeFlow {
  const { a, d } = at;
  if (!at.swallowTried && d.hp > 0 && !a.status.swallowing && !d.status.swallowedBy) {
    const q = [...a.passives, ...a.status.attackEffects].find((q) => q.type === 'avalage');
    if (q) {
      at.swallowTried = 1;
      if (
        d.status.swallowMarks < 2 &&
        roll(c, q.chance == null || q.chance === '' ? 100 : +q.chance)
      )
        markSwallow(c, d, 1);
    }
  }
  if (over(c)) return 'stop';
  if (a.status.swallowing) return 'break';
  return undefined;
}

// Effect atk_avalage: the card's basic attack swallows.
export function swallowAttackEffect({ c, e, o, fromMagic }: EffectContext): void {
  grantAttackEffect(
    o,
    {
      type: 'avalage',
      chance: e.chance,
      ratio: e.ratio,
      pctmache: e.pctmache,
      machebase: e.machebase,
      tours: e.tours,
      repos: e.repos,
    },
    fromMagic,
  );
  emit(c, { type: 'swallowPrepared', side: id(c, o) });
}

// Effect marque_avalage: marks placed now.
export function swallowMarksEffect({ c, e, x }: EffectContext): void {
  markSwallow(c, x, Math.max(1, parseInt(String(e.nbmarques), 10) || 1));
}

// 4. Chewing, when swallowing.
export function chewing(c: Combat, s: Side): Flow {
  chew(c, s);
  return undefined;
}

// Its effects (the registry of effects.ts).
export const effects = {
  atk_avalage: { run: swallowAttackEffect },
  marque_avalage: { run: swallowMarksEffect, withoutTarget: true },
} satisfies EffectRules;
