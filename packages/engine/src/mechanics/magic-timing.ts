// When a magic acts, and for how long (fields of the magic's effect, `magdebut` and `magduree`):
//   - magdebut: it acts at the start of its card's X-th turn (empty, 0 or 1: at the start of the
//     combat, as before). Until then it is shown, waiting;
//   - magduree: it acts for X turns of its card, then it is spent: everything it did is undone, as
//     for a cancelled magic (empty or 0: the whole combat).

import { emit, id, opponent, type Combat } from '../combat/combat.ts';
import { applyEffect } from '../combat/effects.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { undoMagic } from './theft.ts';

// Its part of a card's state.
export type MagicTiming = { magicStartTurn: number; magicTurnsLeft: number };

const startTurn = (e: EffectData | null | undefined): number =>
  Math.max(0, parseInt(String(e?.magdebut), 10) || 0);
const duration = (e: EffectData | null | undefined): number =>
  Math.max(0, parseInt(String(e?.magduree), 10) || 0);

function act(c: Combat, s: Side): void {
  applyEffect(c, s.magic.effet, s, opponent(c, s), true);
  s.magicTurnsLeft = duration(s.magic.effet);
}

// The start of the combat (and of each overtime): the magic shows, and acts now or waits.
export function revealMagic(c: Combat, s: Side): void {
  emit(c, { type: 'magicRevealed', side: id(c, s) });
  const at = startTurn(s.magic.effet);
  if (at > s.status.turnsPlayed + 1) {
    s.magicStartTurn = at;
    emit(c, { type: 'magicDelayed', side: id(c, s), turn: at });
    return;
  }
  act(c, s);
}

// Start of its turn: a waiting magic acts when its turn comes (if it is still there).
export function delayedMagicAtStart(c: Combat, s: Side): Flow {
  if (!s.magicStartTurn || s.status.turnsPlayed + 1 < s.magicStartTurn) return undefined;
  s.magicStartTurn = 0;
  if (!s.magicActive || s.magicStolen || !s.magic.effet) return undefined;
  emit(c, { type: 'magicActivated', side: id(c, s) });
  act(c, s);
  c.sides.forEach((k) => (k.cardActivated = 1));
  if (s.hp <= 0) return 'stop';
  return undefined;
}

// End of its turn: a magic with a duration is spent when it runs out.
export function magicDurationEnd(c: Combat, s: Side): Flow {
  if (s.magicTurnsLeft > 0 && --s.magicTurnsLeft === 0 && s.magicActive) {
    s.magicActive = 0;
    undoMagic(s);
    emit(c, { type: 'magicExpired', side: id(c, s) });
  }
  return undefined;
}
