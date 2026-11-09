// Storm (orage, November 2026): a combat event, switched on in the rules (rules.orage: `chance` and
// `degats`; absent, no storm, and no draw at all: combats without it are unchanged). At the start of
// each card's turn, `chance` % of chances that a bolt falls on one of the two fighters in play, drawn
// at random: it takes `degats` damage (the opponent counts as the source), then, still standing, one
// level of lightning mark (mechanics/lightning.ts). The card playing, struck down, plays no more.

import { emit, id, opponent, roll, type Combat } from '../combat/combat.ts';
import { damage } from '../combat/damage.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import { markLightning } from './lightning.ts';

export function stormAtStart(c: Combat, s: Side): Flow {
  const storm = c.rules.orage;
  if (!storm || !(storm.chance > 0) || !roll(c, storm.chance)) return undefined;
  const target = c.random() < 0.5 ? s : opponent(c, s);
  if (target.hp > 0) {
    const from = opponent(c, target);
    emit(c, { type: 'stormStruck', side: id(c, target) });
    const n = damage(c, from, target, Math.max(0, storm.degats));
    emit(c, { type: 'damaged', side: id(c, target), amount: n, cause: 'storm' });
    if (target.hp > 0) markLightning(c, from, target);
  }
  return s.hp <= 0 ? 'stop' : undefined;
}
