// Fatigue, in levels I to III (model/levels.ts): the affected card loses a % of its ATQ right away,
// given back when it ends or is purified. One per card: reapplied, the levels add up (III at most,
// the extra loss is taken at once) and the longer duration stays. It counts the affected card's
// turns. A rage ends in a fatigue whose level follows the rage's intensity (rage.ts).
//
// Laid by: an effect (fatigue), an attack (passive or attack effect fatigue), the end of a rage.

import { emit, id, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData, Num } from '../model/card.ts';
import { addLevels, at, levelOf } from '../model/levels.ts';
import { contaminationExtra } from './contamination.ts';
import { mistTakes } from './mist.ts';

// lost: attack actually removed, given back when the fatigue ends or is purified.
export type Fatigue = { level: number; lost: number; turns: number };

// Its part of a card's status (combat/state.ts).
export type FatigueState = {
  fatigues: Fatigue[];
};
export const fatigueState = (): FatigueState => ({ fatigues: [] });

export const fatiguePct = (c: Combat, level: number): number => at(c.levels.fatigue, level);

export function fatigue(
  c: Combat,
  d: Side,
  level: number,
  turnsIn: Num,
  afterRage?: boolean,
): void {
  // the fatigue after a rage is the card's own cost: no mist for it
  if (!afterRage && mistTakes(c, d, 'fatigue', (t) => fatigue(c, t, level, turnsIn))) return;
  const turns = Math.max(1, parseInt(String(turnsIn), 10) || 1) + contaminationExtra(d);
  let current = d.status.fatigues[0];
  const stacked = !!current;
  if (current) {
    current.level = addLevels(current.level, level);
    current.turns = Math.max(current.turns, turns);
  } else {
    current = { level: addLevels(0, level), lost: 0, turns };
    d.status.fatigues.push(current);
  }
  // the loss is a % of the ATQ the card would have without this fatigue
  const wanted = round(((d.atq + current.lost) * fatiguePct(c, current.level)) / 100);
  const extra = Math.min(Math.max(0, wanted - current.lost), Math.max(0, d.atq));
  current.lost += extra;
  d.atq -= extra;
  emit(c, {
    type: 'fatigueApplied',
    side: id(c, d),
    stacked,
    level: current.level,
    pct: fatiguePct(c, current.level),
    amount: current.lost,
    turns: current.turns,
    afterRage: !!afterRage,
  });
  if (extra > 0)
    emit(c, { type: 'statChanged', side: id(c, d), stat: 'atq', delta: -extra, cause: 'fatigue' });
}

// End of its turn: the ATQ comes back when the fatigue ends. Before the rage: the fatigue following
// a rage starts on the next turn.
export function fatiguesEnd(c: Combat, s: Side): Flow {
  s.status.fatigues = s.status.fatigues.filter((f) => {
    if (--f.turns > 0) return true;
    emit(c, { type: 'statusEnded', side: id(c, s), status: 'fatigue' });
    if (f.lost > 0) {
      s.atq += f.lost;
      emit(c, {
        type: 'statChanged',
        side: id(c, s),
        stat: 'atq',
        delta: f.lost,
        cause: 'fatigueEnded',
      });
    }
    return false;
  });
  return undefined;
}

const turnsOf = (e: EffectData): Num => e.fattours || e.tours || 1;

// A magic's fatigue: undone with what it took, back to the fatigue that was there before.
export function fatigueEffect({ c, e, statusTarget, onUndo, statusEnds }: EffectContext): void {
  const M = statusTarget();
  const before = M.status.fatigues[0] && { ...M.status.fatigues[0] };
  const atqBefore = M.atq;
  fatigue(c, M, levelOf('fatigue', e), turnsOf(e));
  const lost = atqBefore - M.atq;
  onUndo(() => {
    const f = M.status.fatigues[0];
    if (!f) return;
    const back = Math.min(lost, f.lost);
    M.atq += back;
    if (back > 0)
      emit(c, {
        type: 'statChanged',
        side: id(c, M),
        stat: 'atq',
        delta: back,
        cause: 'fatigueRemoved',
      });
    if (!before) {
      M.status.fatigues = [];
      statusEnds(M, 'fatigue');
    } else {
      f.level = before.level;
      f.turns = before.turns;
      f.lost = Math.max(0, f.lost - lost);
    }
  });
}

export function fatigueOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) fatigue(c, d, levelOf('fatigue', q), turnsOf(q));
}

// Its effects (the registry of effects.ts).
export const effects = {
  fatigue: { run: fatigueEffect },
} satisfies EffectRules;
