// The opponent's magic or trap destroyed (detruire: a magic's changes undone), a magic or trap drawn
// from the card's own deck and equipped (equiper: a magic acts at once, a trap is armed).

import { draw, emit, id } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import { applyEffect } from '../combat/effects.ts';
import { undoMagic } from './theft.ts';

export function destroyEffect({ c, e, x }: EffectContext): void {
  if (e.carte === 'magie' && (x.magicActive || x.magicCancelTurns)) {
    const wasActive = x.magicActive;
    x.magicActive = 0;
    x.magicCancelTurns = 0;
    if (wasActive) undoMagic(x);
    emit(c, { type: 'magicDestroyed', side: id(c, x) });
  } else if (e.carte === 'piege' && x.trapActive) {
    x.trapActive = 0;
    emit(c, { type: 'trapDestroyed', side: id(c, x) });
  }
}

export function equipEffect({ c, e, o, x }: EffectContext): void {
  const card = draw(
    c,
    o.deck.filter((k) => k !== o.magic && k !== o.trap),
    e.carte as string,
  );
  if (!card) return;
  if (e.carte === 'magie') {
    o.magic = card;
    o.magicActive = 1;
    applyEffect(c, card.effet, o, x, true);
  } else {
    o.trap = card;
    o.trapActive = 1;
    o.trapTriggers = 0;
  }
  emit(c, { type: 'equipped', side: id(c, o), card });
}

// Its effects (the registry of effects.ts).
export const effects = {
  detruire: { run: destroyEffect, once: true, withoutTarget: true },
  equiper: { run: equipEffect, once: true },
} satisfies EffectRules;
