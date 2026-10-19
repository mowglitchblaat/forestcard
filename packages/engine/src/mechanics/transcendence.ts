// Transcendence in 3 levels: at the start of its X-th, 2X-th and 3X-th turns holding it (X = 4 by
// default), before its attack, the card goes up one level (I, II, III) until the end of the combat.
// Each level: purified + stun removed, ATQ +X % and max HP +X % (15 % by default, on current stats).
// From level I, each of its hits purifies the opponent and steals life: 10 / 20 / 30 % of the damage
// by default (vv1, vv2, vv3).

import type { Attack, Strike } from '../combat/attack.ts';
import { emit, id, round, type Combat } from '../combat/combat.ts';
import { heal } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow, StrikeFlow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { hasPurifiableStatus, purify } from './purification.ts';

export type Transcendence = {
  every: number; // turns between levels
  atqPct: number;
  maxHpPct: number;
  lifeSteal: number[]; // per level
  baseTurn: number; // turnsPlayed when armed
  stopped?: number; // the magic giving it was stolen: no new level
};

// Its part of a card's status (combat/state.ts).
export type TranscendenceState = {
  transcendence: Transcendence | null;
  transcendenceLevel: number;
};
export const transcendenceState = (): TranscendenceState => ({
  transcendence: null,
  transcendenceLevel: 0,
});

// silent: held from the start (passive), no announcement.
export function armTranscendence(
  c: Combat,
  s: Side,
  e: EffectData,
  silent?: boolean,
): Transcendence | null {
  if (s.status.transcendenceLevel || s.status.transcendence) return null;
  const setting = (k: 'tours' | 'patq' | 'ppv' | 'vv1' | 'vv2' | 'vv3', fallback: number) => {
    const n = parseInt(String(e[k]), 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  s.status.transcendence = {
    every: Math.max(1, setting('tours', 4)),
    atqPct: setting('patq', 15),
    maxHpPct: setting('ppv', 15),
    lifeSteal: [setting('vv1', 10), setting('vv2', 20), setting('vv3', 30)],
    baseTurn: s.status.turnsPlayed,
  };
  if (!silent)
    emit(c, { type: 'transcendenceArmed', side: id(c, s), turn: s.status.transcendence.every });
  return s.status.transcendence;
}

export function transcend(c: Combat, s: Side): void {
  const armed = s.status.transcendence as Transcendence;
  const level = ++s.status.transcendenceLevel;
  emit(c, { type: 'transcended', side: id(c, s), level, lifeSteal: armed.lifeSteal[level - 1] });
  if (s.status.stunTurns > 0) {
    s.status.stunTurns = 0;
    emit(c, { type: 'statusEnded', side: id(c, s), status: 'stun' });
  }
  purify(c, s); // visible purification: each removed status is announced
  const atqGain = round((s.atq * armed.atqPct) / 100);
  const maxHpGain = round((s.maxHp * armed.maxHpPct) / 100);
  if (atqGain) {
    s.atq += atqGain;
    emit(c, {
      type: 'statChanged',
      side: id(c, s),
      stat: 'atq',
      delta: atqGain,
      cause: 'transcendence',
    });
  }
  if (maxHpGain) {
    s.maxHp += maxHpGain;
    s.hp += maxHpGain;
    emit(c, {
      type: 'statChanged',
      side: id(c, s),
      stat: 'max',
      delta: maxHpGain,
      cause: 'transcendence',
    });
  }
}

// Transcendence: every hit that lands purifies the opponent.
export function transcendencePurifies(c: Combat, { a, d }: Attack): StrikeFlow {
  if (a.status.transcendenceLevel && d.hp > 0 && hasPurifiableStatus(d.status)) purify(c, d);
  return undefined;
}

// A strike that landed and dealt damage: the life steal of the transcendence level reached (percent of
// the damage dealt).
export function transcendenceLifeSteal(c: Combat, { a }: Attack, st: Strike): StrikeFlow {
  if (st.n > 0 && a.status.transcendenceLevel && a.status.transcendence) {
    const p = a.status.transcendence.lifeSteal[a.status.transcendenceLevel - 1] || 0;
    if (p > 0) heal(c, a, round((st.n * p) / 100));
  }
  return undefined;
}

export function transcendenceAtStart(c: Combat, s: Side): Flow {
  const nextTurn = s.status.turnsPlayed + 1;
  // Transcendence passive: held from the start of the combat.
  if (!s.status.transcendence && !s.status.transcendenceLevel) {
    const p = s.passives.find((q) => q.type === 'transcendance');
    if (p) {
      armTranscendence(c, s, p, true);
      (s.status.transcendence as Transcendence | null as Transcendence).baseTurn = 0;
    }
  }
  // Transcendence: levels I, II, III at the start of its X-th, 2X-th, 3X-th turns, BEFORE the attack.
  const armed = s.status.transcendence;
  if (
    armed &&
    !armed.stopped &&
    s.status.transcendenceLevel < 3 &&
    nextTurn - armed.baseTurn >= armed.every * (s.status.transcendenceLevel + 1)
  )
    transcend(c, s);
  return undefined;
}

// Effect transcendance. Magic stolen after a level: levels reached stay, no new level.
export function transcendenceEffect({ c, e, o, fromMagic }: EffectContext): void {
  const armed = armTranscendence(c, o, e);
  if (armed && fromMagic)
    o.magicDeltas.push({
      undo: () => {
        if (o.status.transcendence !== armed) return;
        if (!o.status.transcendenceLevel) {
          o.status.transcendence = null;
          emit(c, { type: 'transcendenceLost', side: id(c, o) });
        } else armed.stopped = 1;
      },
    });
}

// Its effects (the registry of effects.ts).
export const effects = {
  transcendance: { run: transcendenceEffect },
} satisfies EffectRules;
