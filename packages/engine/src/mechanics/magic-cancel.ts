// Magic cancellation (annule_magies): the opponent's magic stops acting, its changes undone, for X
// of its turns (0 or empty: until the end of the combat); then it comes back (if it never acted, it
// acts in full; else its "once" effects do not replay).
//
// A magic that cancels is settled at the start of the combat, BEFORE magics act, so none of the
// cancelled magic's effects goes through (the first card to play has priority if both cancel); the
// cancelled magic is then shown and crossed out when the cancelling one acts.

import { emit, id, opponent, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import { applyEffect } from '../combat/effects.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { undoMagic } from './theft.ts';

const cancelsMagic = (e: EffectData | null | undefined) =>
  !!e &&
  (e.type === 'annule_magies' || (e.briques || []).some((b) => b && b.type === 'annule_magies'));

// 0 or empty: until the end of the combat.
const cancelTurns = (e: EffectData) => {
  const brick =
    e.type === 'annule_magies' ? e : (e.briques || []).find((b) => b && b.type === 'annule_magies');
  return Math.max(0, parseInt(String(brick && brick.tours), 10) || 0);
};

// Start of the combat (and of each overtime), before the magics act.
export function settleMagicCancellations(c: Combat, order: Side[]): void {
  order.forEach((s) => {
    const x = opponent(c, s);
    if (s.magicActive && cancelsMagic(s.magic.effet) && x.magicActive) {
      x.magicActive = 0;
      x.magicCancelStage = 1;
      x.magicCancelTurns = cancelTurns(s.magic.effet as EffectData);
      x.magicNeverActed = 1;
    }
  });
}

export function magicCancelEffect({ c, e, x }: EffectContext): void {
  if (x.magicCancelStage === 1) {
    // Cancelled before acting (combat start): shown, then crossed out.
    x.magicCancelStage = 2;
    if (x.magic.effet) emit(c, { type: 'magicRevealed', side: id(c, x) });
    emit(c, { type: 'magicCancelled', side: id(c, x), turns: x.magicCancelTurns });
  } else if (x.magicActive) {
    x.magicActive = 0;
    undoMagic(x);
    x.magicCancelTurns = Math.max(0, parseInt(String(e.tours), 10) || 0); // 0 or empty: until the end of the combat
    x.magicNeverActed = 0;
    emit(c, { type: 'magicCancelled', side: id(c, x), turns: x.magicCancelTurns });
  }
}

// End of its turn: the cancellation ends, the magic comes back.
export function magicCancelEnd(c: Combat, s: Side): Flow {
  if (s.magicCancelTurns > 0 && --s.magicCancelTurns === 0 && !s.magicActive && s.magic.effet) {
    const neverActed = s.magicNeverActed;
    s.magicActive = 1;
    s.magicCancelStage = 0;
    s.magicNeverActed = 0;
    emit(c, { type: 'magicBack', side: id(c, s) });
    applyEffect(c, s.magic.effet, s, opponent(c, s), true, !neverActed);
    c.sides.forEach((k) => (k.cardActivated = 1));
    if (s.hp <= 0) return 'stop';
  }
  return undefined;
}

// Its effects (the registry of effects.ts).
export const effects = {
  annule_magies: { run: magicCancelEffect, withoutTarget: true },
} satisfies EffectRules;
