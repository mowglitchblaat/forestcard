// Blaze (embrasement, Feu, skill of October 2026): the card that plays it catches fire for 2 of its
// turns (the turn it plays it counts as the first).
//   - Its strikes deal more: + a % of its ATQ (level table: embrasementAtq, 30 by default).
//   - Each strike that lands lays a level I burn for 2 turns, at 100 % (it adds up with the card's
//     other burn sources, like any attack effect).
//   - It burns itself: no burn damage, but a calcination at the end of each of its turns while
//     ablaze, a % of its max HP (level table: embrasementCalcination, 10 by default; 1 max HP at
//     least is left).
// Played again while ablaze: its turns start again (no stacking). Its own skill, not a status: neither
// purified, nor prolonged by a contamination, nor taken by a mist. Water and ice put it out:
//   - a contamination (Eau) puts it out and leaves the card weak (vaporisation, contamination.ts);
//   - a frost (glace) puts it out, and is spent doing it (as on a burn, mechanics/frost.ts).
// An effect, offered to ultimates (how many times and how often: the ultimate's own fields), magics
// and traps. A card already contaminated is put out at once.

import { emit, id, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { vaporize } from './contamination.ts';
import { calcinate } from './dot.ts';

export const BLAZE_TURNS = 2;
export const BLAZE_BURN: EffectData = { type: 'brulure', chance: 100, niveau: 1, tours: 2 };

export type Blaze = { turns: number; burn: EffectData };

// Its part of a card's status (combat/state.ts).
export type BlazeState = {
  blaze: Blaze | null;
};
export const blazeState = (): BlazeState => ({ blaze: null });

// The bonus of its strikes while ablaze.
export const blazeBonus = (c: Combat, a: Side): number =>
  a.status.blaze ? Math.max(0, round((a.atq * c.levels.embrasementAtq) / 100)) : 0;

// by: its turns ran out, or the ice or the water put it out. Returns whether there was one.
export function putOutBlaze(c: Combat, s: Side, by: 'time' | 'ice' | 'water'): boolean {
  const b = s.status.blaze;
  if (!b) return false;
  s.status.blaze = null;
  s.status.attackEffects = s.status.attackEffects.filter((q) => q !== b.burn);
  emit(c, { type: 'blazeEnded', side: id(c, s), by });
  return true;
}

export function blazeEffect({ c, o, onUndo }: EffectContext): void {
  if (o.hp <= 0) return;
  const running = o.status.blaze;
  if (running) running.turns = BLAZE_TURNS;
  else {
    const burn: EffectData = { ...BLAZE_BURN };
    o.status.blaze = { turns: BLAZE_TURNS, burn };
    o.status.attackEffects.push(burn);
  }
  emit(c, {
    type: 'blazeStarted',
    side: id(c, o),
    again: !!running,
    turns: BLAZE_TURNS,
    atqPct: c.levels.embrasementAtq,
    burnLevel: +(BLAZE_BURN.niveau as number),
    burnTurns: +(BLAZE_BURN.tours as number),
  });
  onUndo(() => putOutBlaze(c, o, 'time'));
  vaporize(c, o); // already contaminated: the water puts it out at once
}

// End of its turn: it burns itself, then counts down.
export function blazeEnd(c: Combat, s: Side): Flow {
  const b = s.status.blaze;
  if (!b) return undefined;
  if (s.hp > 0) calcinate(c, s, round((s.maxHp * c.levels.embrasementCalcination) / 100));
  if (--b.turns <= 0) putOutBlaze(c, s, 'time');
  return undefined;
}

// Its effects (the registry of effects.ts).
export const effects = {
  embrasement: { run: blazeEffect },
} satisfies EffectRules;
