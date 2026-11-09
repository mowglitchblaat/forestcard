// Revive: a card brought down shatters, then reforms with a percent of its max HP, purified
// (silently), execution marks gone. Sources, each used once, in order: granted by an ultimate or a
// trap, passive, active magic. Never after detonation damage (c.noRevive): the card is "reduced to
// ashes".
//
// A trap holding a revive ("owner dies") is kept for the death: the card shatters, THEN the trap is
// revealed (its trigger is used), so a counter-trap (adv_piege) answers it before anything happens.
// Still held: the card reforms with the trap's percent, then the trap's other effects play. Destroyed
// or stolen: it does nothing, and the card reforms only from another source left (or stays down).
//
// Reconstruction (passive reconstruction, November 2026): when no other source brings the card back,
// a chance to reform, on every death: 65 % with 70 % of its max HP the first time, then 15 points
// of chance and 10 points of HP less at each reconstruction (5 % and 20 % at least). A failed
// reconstruction changes nothing (the card is down).

import { applyEffect } from '../combat/effects.ts';
import {
  effetOf,
  emit,
  id,
  opponent,
  raw,
  roll,
  round,
  type Combat,
} from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Side } from '../combat/state.ts';
import { scan } from '../combat/traps.ts';
import type { Card, EffectData, Num } from '../model/card.ts';
import { purify } from './purification.ts';

export type ReviveSource = { pctrev?: Num };
// A revive trap waiting for the death: the card it must still be, its percent, its other bricks.
export type TrapRevive = { card: Card; pct: Num; rest: EffectData | null };

// Its part of a card's status (combat/state.ts).
export type ReviveState = {
  usedReviveSources: ReviveSource[];
  grantedRevives: ReviveSource[]; // revives granted by an ultimate or a trap
  reconstructions: number; // reconstructions that brought the card back
};
export const reviveState = (): ReviveState => ({
  usedReviveSources: [],
  grantedRevives: [],
  reconstructions: 0,
});

// Reconstruction: chance and HP (% of max HP) of the first one, lost at each one, floor.
export const RECONSTRUCTION = {
  chance: 65,
  chanceStep: 15,
  chanceMin: 5,
  hp: 70,
  hpStep: 10,
  hpMin: 20,
} as const;
const hasReconstruction = (d: Side): boolean =>
  d.passives.some((p) => p.type === 'reconstruction');

// A reconstruction tried at d's death: the % of max HP it reforms with, or null (none, or failed).
// later: the failure is announced when the damage line flushes.
function reconstruct(c: Combat, d: Side, later: boolean): number | null {
  if (!hasReconstruction(d)) return null;
  const R = RECONSTRUCTION;
  const n = d.status.reconstructions;
  const chance = Math.max(R.chanceMin, R.chance - R.chanceStep * n);
  if (!roll(c, chance)) {
    const fail = () => emit(c, { type: 'reconstructionFailed', side: id(c, d), chance });
    if (later) c.pendingEffects.push(fail);
    else fail();
    return null;
  }
  d.status.reconstructions++;
  return Math.max(R.hpMin, R.hp - R.hpStep * n);
}

// On a lethal hit no avoid-death stopped: a revive trap is kept for the death (returned, nothing is
// used yet); otherwise the other "owner dies" traps fire now.
export function reviveTrapOnLethal(c: Combat, dst: Side): TrapRevive | null {
  const trapPayload = dst.trapActive && effetOf(c, dst.trap);
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
    const rest = trapEffect.briques
      ? { briques: trapEffect.briques.filter((b) => b !== reviveBrick) }
      : null;
    return { card: dst.trap, pct: reviveBrick.pctrev || 0, rest };
  }
  scan(c, { kind: 'death', who: id(c, dst), skip: 1 });
  return null;
}

// Revive sources, in order: granted by an ultimate or a trap, passive, active magic.
function reviveSource(c: Combat, d: Side): ReviveSource | undefined {
  const sources: ReviveSource[] = [
    ...d.status.grantedRevives,
    ...d.passives.filter((p) => p.type === 'reanimation'),
  ];
  const me = d.magicActive ? effetOf(c, d.magic) : null;
  if (me) {
    (me.type === 'reanimation'
      ? [me]
      : (me.briques || []).filter((b) => (b as EffectData).type === 'reanimation')
    ).forEach((b) => sources.push(b as EffectData));
  }
  return sources.find((z) => !d.status.usedReviveSources.includes(z));
}

// After the HP of a lethal hit dropped: the revive is scheduled (it plays when the damage line
// flushes), from the revive trap kept for this death first; a revive denied by detonation damage is
// announced.
export function reviveOnLethal(c: Combat, dst: Side, trap: TrapRevive | null): void {
  if (c.noRevive && (reviveSource(c, dst) || hasReconstruction(dst)))
    c.pendingEffects.push(() =>
      emit(c, {
        type: 'reviveDenied',
        side: id(c, dst),
        ...(c.knelling ? { by: 'knell' as const } : {}),
      }),
    );
  if (c.noRevive) return;
  if (trap) {
    dst.hp = 0;
    c.pendingRevives.push({ side: dst, pct: trap.pct, trap });
    return;
  }
  const reviveFrom = reviveSource(c, dst);
  if (reviveFrom) {
    dst.status.usedReviveSources.push(reviveFrom);
    dst.hp = 0;
    c.pendingRevives.push({ side: dst, pct: reviveFrom.pctrev || 0, trap: null });
    return;
  }
  const pct = reconstruct(c, dst, true);
  if (pct !== null) {
    dst.hp = 0;
    c.pendingRevives.push({ side: dst, pct, trap: null });
  }
}

function reform(c: Combat, d: Side, pct: Num): void {
  d.status.executionMarks = 0;
  const hp = Math.max(1, Math.min(d.maxHp, round((d.maxHp * raw(pct)) / 100)));
  d.hp = hp;
  emit(c, { type: 'revived', side: id(c, d), hp, pct });
  purify(c, d, true);
}

export function flushRevives(c: Combat): void {
  while (c.pendingRevives.length) {
    const {
      side: d,
      pct,
      trap,
    } = c.pendingRevives.shift() as {
      side: Side;
      pct: Num;
      trap: TrapRevive | null;
    };
    emit(c, { type: 'shattered', side: id(c, d) });
    if (!trap) {
      reform(c, d, pct);
      continue;
    }
    // The revive trap is revealed on the broken card: a counter-trap answers it at once.
    const x = opponent(c, d);
    d.trapTriggers++;
    c.trapChainDepth++;
    try {
      emit(c, { type: 'trapFired', side: id(c, d) });
      if (d.trapActive && d.trap === trap.card) {
        reform(c, d, pct);
        if (trap.rest) {
          c.reviving = 1;
          applyEffect(c, trap.rest, d, x);
          c.reviving = 0;
        }
      } else {
        // Countered: no revive from it; another source may still bring the card back.
        const from = reviveSource(c, d);
        if (from) {
          d.status.usedReviveSources.push(from);
          reform(c, d, from.pctrev || 0);
        } else {
          const pct = reconstruct(c, d, false);
          if (pct !== null) reform(c, d, pct);
        }
      }
    } finally {
      c.trapChainDepth--;
    }
    c.sides.forEach((s) => (s.cardActivated = 1));
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
