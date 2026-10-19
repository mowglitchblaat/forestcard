// The steps of a card's turn that belong to no single mechanic: whether the card is still up, the
// turn count, the "every turn" passives dispatched to their mechanics. Their order lives in
// moments.ts.
// No effect is tied to the round in general: each one is tied to the turn of ITS card.

import { healEveryTurn } from '../mechanics/healing.ts';
import { randomEveryTurn } from '../mechanics/random.ts';
import { atqGrowth, maxHpGrowth } from '../mechanics/stats.ts';
import type { EffectData } from '../model/card.ts';
import type { Combat } from './combat.ts';
import type { Flow } from './flow.ts';
import type { Side } from './state.ts';

// A card down plays no more of its turn.
export const aliveAtStart = (_c: Combat, s: Side): Flow => (s.hp <= 0 ? 'stop' : undefined);
export const aliveAtEnd = aliveAtStart;

// The "every turn" passives, by type.
export const EVERY_TURN_PASSIVES: Record<string, (c: Combat, s: Side, p: EffectData) => void> = {
  aleatoire: randomEveryTurn,
  soin_tour: healEveryTurn,
  atq_tours: atqGrowth,
  pv_tours: maxHpGrowth,
};

// 5. Its "every turn" passives, in the order the card holds them.
export function everyTurnPassives(c: Combat, s: Side): Flow {
  if (s.hp <= 0) return 'stop';
  s.passives.forEach((p) => {
    if (s.hp <= 0) return;
    const act =
      p.type !== undefined && Object.hasOwn(EVERY_TURN_PASSIVES, p.type)
        ? EVERY_TURN_PASSIVES[p.type]
        : undefined;
    if (act) act(c, s, p);
  });
  return undefined;
}

// End of the turn: the durations depending on ITS actions drop by one (each mechanic counts its
// own). A turn where it is stunned or frozen counts too; the opponent's turn never does.
export function countTurn(_c: Combat, s: Side): Flow {
  if (s.hp > 0) s.status.turnsPlayed++;
  return undefined;
}
