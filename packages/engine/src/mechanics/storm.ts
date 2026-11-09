// Storm (orage, November 2026): a combat event, switched on in the rules (rules.orage: `chance` and
// `degats`; absent, no storm, and no draw at all: combats without it are unchanged). At the start of
// each card's turn, `chance` % of chances that a bolt falls on one of the two fighters in play, drawn
// at random: it loses `degats` HP, then, still standing, gets one level of lightning mark
// (mechanics/lightning.ts).
// The bolt comes from the sky, not from a card: it is not an attack (no dodge, no block, no reflect)
// and it triggers nothing: no reduction, no avoid-death, no revive, no trap, no ultimate trigger, no
// reaction to damage, no accumulator charge. It can kill. The card playing, struck down, plays no
// more.

import { emit, id, opponent, roll, type Combat } from '../combat/combat.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import { markLightning } from './lightning.ts';

export function stormAtStart(c: Combat, s: Side): Flow {
  const storm = c.rules.orage;
  if (!storm || !(storm.chance > 0) || !roll(c, storm.chance)) return undefined;
  const target = c.random() < 0.5 ? s : opponent(c, s);
  if (target.hp > 0) {
    emit(c, { type: 'stormStruck', side: id(c, target) });
    const n = Math.min(target.hp, Math.max(0, Math.round(storm.degats)));
    target.hp -= n;
    emit(c, { type: 'damaged', side: id(c, target), amount: n, cause: 'storm' });
    if (target.hp > 0) markLightning(c, opponent(c, target), target, true);
  }
  return s.hp <= 0 ? 'stop' : undefined;
}
