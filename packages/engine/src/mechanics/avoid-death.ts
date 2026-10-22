// Avoid death: on a lethal hit, the card stays at 1 HP and is purified. Checked BEFORE everything
// (revive included), from: its active magic (mort_evitee, with its condition), then its charges
// (passive evite_mort, or granted by an ultimate or a trap), then its trap ("owner dies" trap
// holding an avoid-death). The damage line shows first, the protection right after. An execution
// ignores it and breaks it (breakAvoidDeath): a revived card is not saved by it afterwards.

import { emit, hold, id, releaseAsTheyWere, releaseNow, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Side } from '../combat/state.ts';
import { scan } from '../combat/traps.ts';
import type { EffectData } from '../model/card.ts';
import { purify } from './purification.ts';

// Its part of a card's status (combat/state.ts).
export type AvoidDeathState = {
  avoidDeathCharges: number;
  magicAvoidDeathUsed: number;
};
export const avoidDeathState = (passives: EffectData[]): AvoidDeathState => ({
  avoidDeathCharges: passives.some((p) => p.type === 'evite_mort') ? 1 : 0,
  magicAvoidDeathUsed: 0,
});

// An execution breaks avoid-death, whatever holds it: its charges (passive or granted), its active
// magic's, and its "owner dies" trap holding an avoid-death (destroyed; a trap that also revives is
// left to the revive). Spent without saving the card, it does not come back after a revive.
const has = (e: EffectData | null | undefined, type: string): boolean =>
  !!e && (e.type === type || (e.briques || []).some((b) => (b as EffectData).type === type));
export function breakAvoidDeath(c: Combat, dst: Side): void {
  const magic =
    !!dst.magicActive && !dst.status.magicAvoidDeathUsed && has(dst.magic.effet, 'mort_evitee');
  const t = dst.trap.effet;
  const trap =
    !!dst.trapActive &&
    !!t &&
    t.condition?.type === 'proprio_meurt' &&
    dst.trapTriggers < (t.declenchements || 1) &&
    has(t.effet, 'mort_evitee') &&
    !has(t.effet, 'reanimation');
  if (!magic && !trap && dst.status.avoidDeathCharges <= 0) return;
  if (magic) dst.status.magicAvoidDeathUsed = 1;
  dst.status.avoidDeathCharges = 0;
  emit(c, { type: 'avoidDeathBroken', side: id(c, dst) });
  if (trap) {
    dst.trapActive = 0;
    emit(c, { type: 'trapDestroyed', side: id(c, dst) });
  }
}

// On a lethal hit: what to show after the damage line if the card is protected (it is then left at
// 1 HP by damage()), or null.
export function avoidDeath(c: Combat, dst: Side): (() => void) | null {
  const magicEffect = dst.magicActive && dst.magic.effet ? dst.magic.effet : null;
  const avoid = magicEffect
    ? magicEffect.type === 'mort_evitee'
      ? magicEffect
      : (magicEffect.briques || []).find((b) => (b as EffectData).type === 'mort_evitee') || null
    : null;
  if (
    avoid &&
    !dst.status.magicAvoidDeathUsed &&
    (avoid.cond === 'aucune' ||
      (avoid.cond === 'pv_max'
        ? dst.maxHp >= (avoid.seuil || 0)
        : dst.damageDealt >= (avoid.seuil || 0)))
  ) {
    dst.status.magicAvoidDeathUsed = 1;
    return () => {
      emit(c, { type: 'deathAvoided', side: id(c, dst), source: 'magic' });
      purify(c, dst);
    };
  }
  if (dst.status.avoidDeathCharges > 0) {
    dst.status.avoidDeathCharges--;
    return () => {
      emit(c, { type: 'deathAvoided', side: id(c, dst), source: 'passive' });
      purify(c, dst);
    };
  }
  // Avoid-death trap: its announcement is held back, to appear AFTER the damage line.
  const captured = hold(c, () => scan(c, { kind: 'death', who: id(c, dst), only: 1 }));
  if (dst.status.avoidDeathCharges > 0) {
    dst.status.avoidDeathCharges--;
    return () => {
      releaseNow(c, captured);
      emit(c, { type: 'deathAvoided', side: id(c, dst), source: 'trap' });
      purify(c, dst);
    };
  }
  releaseAsTheyWere(c, captured);
  return null;
}

// As a magic it is read directly on a lethal hit; from an ultimate or a trap it grants a charge.
export function avoidDeathEffect({ c, o, fromMagic }: EffectContext): void {
  if (fromMagic) return;
  o.status.avoidDeathCharges = (o.status.avoidDeathCharges || 0) + 1;
  emit(c, { type: 'avoidDeathGranted', side: id(c, o) });
}

// Its effects (the registry of effects.ts).
export const effects = {
  mort_evitee: { run: avoidDeathEffect },
} satisfies EffectRules;
