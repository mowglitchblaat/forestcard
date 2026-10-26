// Mist (brume): a mist around the card, X turns of its own. Level 1 takes every negative status
// laid on the card (curse, bleed, poison, burn, frost, knell, fracture, stun, fatigue, parasitic
// link): nothing is laid. Level 2, "vent tourné": the first status that comes is sent back to the
// card that laid it, then the mist is gone. A mist raised again on a card already in mist goes to
// level 2 (its turns: the longest).
//
// Comes from: an effect (brume: ultimate, magic, trap; X % of chances, 100 when empty). A magic's
// mist goes with the magic.
//
// The statuses ask the mist before they are laid (mistTakes, in each status's lay function); the
// fatigue that follows a rage is the card's own cost, not a status laid on it: no mist for it.

import { emit, id, opponent, roll, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { MistedStatus } from '../events.ts';

export type Mist = { level: number; turns: number };

// Its part of a card's status (combat/state.ts).
export type MistState = {
  mist: Mist | null;
};
export const mistState = (): MistState => ({ mist: null });

// Before a status is laid on dst: true when the mist takes it (then it is not laid). Level 2 lays
// it on the opponent instead (`again`), once, and fades.
export function mistTakes(
  c: Combat,
  dst: Side,
  status: MistedStatus,
  again: (t: Side) => void,
): boolean {
  const m = dst.status.mist;
  if (!m || dst.hp <= 0) return false;
  if (m.level < 2) {
    emit(c, { type: 'mistBlocked', side: id(c, dst), status });
    return true;
  }
  dst.status.mist = null;
  const back = opponent(c, dst);
  emit(c, { type: 'mistReturned', side: id(c, dst), to: id(c, back), status });
  emit(c, { type: 'mistFaded', side: id(c, dst) });
  if (back.hp > 0) again(back);
  return true;
}

export function mistEffect({ c, e, o, onUndo }: EffectContext): void {
  const chance = e.chance == null || e.chance === '' ? 100 : +e.chance || 0;
  if (chance < 100 && !roll(c, chance)) {
    emit(c, { type: 'mistMissed', side: id(c, o) });
    return;
  }
  const turns = Math.max(1, parseInt(String(e.tours), 10) || 1);
  const now = o.status.mist;
  const mist: Mist = now ? { level: 2, turns: Math.max(now.turns, turns) } : { level: 1, turns };
  o.status.mist = mist;
  emit(c, { type: 'mistRaised', side: id(c, o), level: mist.level, turns: mist.turns });
  onUndo(() => {
    if (o.status.mist !== mist) return;
    o.status.mist = null;
    emit(c, { type: 'mistFaded', side: id(c, o) });
  });
}

// End of its turn: the mist counts down.
export function mistEnd(c: Combat, s: Side): Flow {
  const m = s.status.mist;
  if (m && --m.turns <= 0) {
    s.status.mist = null;
    emit(c, { type: 'mistFaded', side: id(c, s) });
  }
  return undefined;
}

// Its effects (the registry of effects.ts).
export const effects = {
  brume: { run: mistEffect },
} satisfies EffectRules;
