// Revive: a card brought down shatters, then reforms with a percent of its max HP, purified
// (silently), execution marks gone. Sources, each used once, in order: granted by an ultimate or a
// trap, passive, active magic. Never after detonation damage (c.noRevive): the card is "reduced to
// ashes".
//
// A trap holding a revive ("owner dies") fires on the lethal hit but is SHOWN after the death: the
// card shatters, reforms, then the trap appears with its other effects.

import { applyEffect } from '../combat/effects.ts';
import { emit, id, opponent, raw, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Side } from '../combat/state.ts';
import { scan } from '../combat/traps.ts';
import type { EffectData, Num } from '../model/card.ts';
import { purify } from './purification.ts';

export type ReviveSource = { pctrev?: Num };

// Its part of a card's status (combat/state.ts).
export type ReviveState = {
  usedReviveSources: ReviveSource[];
  grantedRevives: ReviveSource[]; // revives granted by an ultimate or a trap
};
export const reviveState = (): ReviveState => ({ usedReviveSources: [], grantedRevives: [] });

// On a lethal hit no avoid-death stopped: a revive trap is prepared (its reveal returned, to show
// once the card has reformed); otherwise the other "owner dies" traps fire now.
export function reviveTrapOnLethal(c: Combat, dst: Side): (() => void) | null {
  const trapPayload = dst.trapActive && dst.trap.effet;
  const trapEffect = trapPayload && trapPayload.effet;
  // Detonation damage: no revive, so a trap holding one fires as any other "owner dies" trap.
  const reviveBrick =
    !c.noRevive &&
    trapEffect &&
    (trapEffect.type === 'reanimation'
      ? trapEffect
      : (trapEffect.briques || []).find((b) => b && b.type === 'reanimation'));
  const x = opponent(c, dst);
  if (
    reviveBrick &&
    trapPayload.condition &&
    trapPayload.condition.type === 'proprio_meurt' &&
    dst.trapTriggers < (trapPayload.declenchements || 1) &&
    !(x.status.trapImmunityTurns > 0)
  ) {
    // The whole trap plays AFTER the revive; only the revive is prepared now.
    dst.trapTriggers++;
    dst.status.grantedRevives.push({ pctrev: reviveBrick.pctrev || 0 });
    const rest = trapEffect.briques
      ? { briques: trapEffect.briques.filter((b) => b !== reviveBrick) }
      : null;
    return () => {
      emit(c, { type: 'trapFired', side: id(c, dst) });
      if (rest) {
        c.reviving = 1;
        applyEffect(c, rest, dst, x);
        c.reviving = 0;
      }
      c.sides.forEach((s) => (s.cardActivated = 1));
    };
  }
  scan(c, { kind: 'death', who: id(c, dst), skip: 1 });
  return null;
}

// Revive sources, in order: granted by an ultimate or a trap, passive, active magic.
function reviveSource(d: Side): ReviveSource | undefined {
  const sources: ReviveSource[] = [
    ...d.status.grantedRevives,
    ...d.passives.filter((p) => p.type === 'reanimation'),
  ];
  if (d.magicActive && d.magic.effet) {
    const me = d.magic.effet;
    (me.type === 'reanimation'
      ? [me]
      : (me.briques || []).filter((b) => (b as EffectData).type === 'reanimation')
    ).forEach((b) => sources.push(b as EffectData));
  }
  return sources.find((z) => !d.status.usedReviveSources.includes(z));
}

// After the HP of a lethal hit dropped: the revive is scheduled (it plays when the damage line
// flushes); a revive denied by detonation damage is announced. Returns the trap reveal still to show
// (a revive takes it along).
export function reviveOnLethal(
  c: Combat,
  dst: Side,
  revealTrap: (() => void) | null,
): (() => void) | null {
  if (c.noRevive && reviveSource(dst))
    c.pendingEffects.push(() =>
      emit(c, {
        type: 'reviveDenied',
        side: id(c, dst),
        ...(c.knelling ? { by: 'knell' as const } : {}),
      }),
    );
  if (!c.noRevive) {
    const reviveFrom = reviveSource(dst);
    if (reviveFrom) {
      dst.status.usedReviveSources.push(reviveFrom);
      dst.hp = 0;
      c.pendingRevives.push({ side: dst, pct: reviveFrom.pctrev || 0, reveal: revealTrap });
      return null;
    }
  }
  return revealTrap;
}

export function flushRevives(c: Combat): void {
  while (c.pendingRevives.length) {
    const {
      side: d,
      pct,
      reveal,
    } = c.pendingRevives.shift() as { side: Side; pct: Num; reveal: (() => void) | null };
    emit(c, { type: 'shattered', side: id(c, d) });
    d.status.executionMarks = 0;
    const hp = Math.max(1, Math.min(d.maxHp, round((d.maxHp * raw(pct)) / 100)));
    d.hp = hp;
    emit(c, { type: 'revived', side: id(c, d), hp, pct });
    purify(c, d, true);
    if (reveal) reveal(); // the revive trap appears once the card has reformed, then its other effects
  }
}

// As a magic it is read directly on death; from an ultimate or a trap it grants one.
export function reviveEffect({ c, e, o, fromMagic }: EffectContext): void {
  if (fromMagic) return;
  o.status.grantedRevives.push({ pctrev: e.pctrev || 0 });
  emit(c, { type: 'reviveGranted', side: id(c, o), pct: e.pctrev || 0 });
}

// Its effects (the registry of effects.ts).
export const effects = {
  reanimation: { run: reviveEffect },
} satisfies EffectRules;
