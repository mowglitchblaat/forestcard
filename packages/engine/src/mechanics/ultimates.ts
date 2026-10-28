// Ultimates: the card's own, and those it stole or copied. One fires after X rounds (apres_tours),
// when a card activates (sur_carte), on an event or under X % of HP (udecl: mechanics/triggers.ts), with a delay between two uses (delai_tours) and a number of
// uses (utilisations). An inhibiting rooting holds them until it ends (mechanics/rooting.ts). Effects: steal the opponent's (vol_ultime), copy it (copie_ultime: the
// opponent keeps its own), reset a card's (reset_ultime).

import { emit, id, opponent, over, raw, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import { applyEffect } from '../combat/effects.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import { scan } from '../combat/traps.ts';
import { inhibited } from './rooting.ts';

// 2. The ultimates that can fire do, in the order the card holds them.
export function ultimate(c: Combat, s: Side): Flow {
  if (s.hp <= 0) return 'stop';
  for (const slot of s.ultimates.slice()) {
    const u = slot.effect;
    if (!u || !u.type) continue;
    if (raw(u.utilisations) > 0 && slot.uses >= raw(u.utilisations)) continue;
    if (c.round - slot.lastRound < (u.delai_tours || 0)) continue;
    // State triggers: checked at the start of its turn (mechanics/triggers.ts for the events).
    const x = opponent(c, s);
    const ux = parseInt(String(u.udx), 10) || 50;
    const state =
      u.udecl === 'pv_sous'
        ? (s.hp / s.maxHp) * 100 < ux
        : u.udecl === 'adv_pv_sous'
          ? x.hp > 0 && (x.hp / x.maxHp) * 100 < ux
          : false;
    if (
      !(
        (u.apres_tours && c.round >= u.apres_tours) ||
        (u.sur_carte && s.cardActivated) ||
        slot.triggered ||
        state
      )
    )
      continue;
    // an inhibiting rooting holds it: it waits, its conditions still met, and fires once free
    if (inhibited(s)) {
      emit(c, { type: 'ultimateHeld', side: id(c, s) });
      continue;
    }
    slot.uses++;
    slot.lastRound = c.round;
    s.cardActivated = 0;
    slot.triggered = 0;
    emit(c, { type: 'ultimateTriggered', side: id(c, s) });
    const previousSource = c.source;
    c.source = 'ultime';
    applyEffect(c, u, s, opponent(c, s));
    c.source = previousSource;
    scan(c, { kind: 'ultimate', by: id(c, s) });
    if (over(c)) break;
  }
  return undefined;
}

// Copy: the opponent KEEPS its ultimate, the card gets a fresh copy.
export function copyUltimateEffect({ c, o, x }: EffectContext): void {
  const slot = x.ultimates.find(
    (z) => z.effect && z.effect.type && z.effect.type !== 'copie_ultime',
  );
  if (!slot) emit(c, { type: 'noUltimateToCopy', side: id(c, x) });
  else if (o.ultimates.some((z) => z.effect === slot.effect || z.copiedFrom === slot.effect))
    emit(c, { type: 'ultimateAlreadyHeld', side: id(c, o) });
  else {
    o.ultimates.push({ effect: slot.effect, uses: 0, lastRound: -99, copiedFrom: slot.effect });
    emit(c, { type: 'ultimateCopied', side: id(c, o), from: id(c, x) });
  }
}

export function stealUltimateEffect({ c, o, x }: EffectContext): void {
  const slot = x.ultimates.find((z) => z.effect && z.effect.type);
  if (slot) {
    x.ultimates = x.ultimates.filter((z) => z !== slot);
    o.ultimates.push({ effect: slot.effect, uses: 0, lastRound: -99 });
    emit(c, { type: 'ultimateStolen', side: id(c, o), from: id(c, x) });
  } else emit(c, { type: 'noUltimateToSteal', side: id(c, x) });
}

export function resetUltimateEffect({ c, target: T }: EffectContext): void {
  T.ultimates.forEach((slot) => {
    slot.uses = 0;
    slot.lastRound = -99;
  });
  emit(c, { type: 'ultimateReset', side: id(c, T) });
}

// Its effects (the registry of effects.ts).
export const effects = {
  copie_ultime: { run: copyUltimateEffect, once: true, withoutTarget: true },
  vol_ultime: { run: stealUltimateEffect, once: true, withoutTarget: true },
  reset_ultime: { run: resetUltimateEffect, once: true },
} satisfies EffectRules;
