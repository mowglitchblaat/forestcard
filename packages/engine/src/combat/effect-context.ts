// What an effect's rule receives (built by applyEffect, effects.ts): the effect, who plays it and
// against whom, and how a magic's effect is undone when the magic goes (cancelled, destroyed,
// stolen).

import type { StatusKind } from '../events.ts';
import type { EffectData } from '../model/card.ts';
import type { EffectType } from '../model/types.ts';
import type { Combat } from './combat.ts';
import type { Side } from './state.ts';

export type EffectContext = {
  c: Combat;
  e: EffectData;
  o: Side; // the card playing the effect
  x: Side; // its opponent (the swallower, if the opponent is swallowed)
  fromMagic: boolean | undefined; // a magic's effect: undone if the magic goes
  returning: boolean | undefined; // a cancelled magic coming back
  target: Side; // `cible`: the opponent if 'adversaire', else itself
  statusTarget: () => Side; // `ciblem` (or `cible`): itself if 'soi', else the opponent
  // A magic's stat change, replayed backwards when the magic goes.
  delta: (s: Side, stat: 'atq' | 'maxHp', d: number) => void;
  // What to do when the magic goes (nothing if the effect is not a magic's).
  onUndo: (f: () => void) => void;
  statusEnds: (M: Side, status: StatusKind) => void;
};

// An effect's rule, declared by its mechanic:
//   run: what it does;
//   once: not replayed when a cancelled or stolen magic comes back;
//   withoutTarget: makes no sense when its target is the card playing it (a swallowed opponent:
//     whatever targets it hits the swallower);
//   undoesStatuses: a magic's status effect; if the magic goes, the statuses it added to its status
//     target ('target': itself if `ciblem` / `cible` is 'soi', else the opponent) or to the opponent
//     ('opponent') since are removed.
export type EffectRule = {
  run: (ctx: EffectContext) => void;
  once?: true;
  withoutTarget?: true;
  undoesStatuses?: 'target' | 'opponent';
};
export type EffectRules = { [K in EffectType]?: EffectRule };
