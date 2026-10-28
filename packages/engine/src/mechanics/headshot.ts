// Headshot and targeting: two mechanics that work apart or together.
//   - Headshot: a special critical hit (mechanics/critical.ts). It does not draw the critical chance:
//     X % of chances, on each strike, of its own, then the strike is critical (the common critical
//     power, and the updraft). It comes first: right after the strike's power, before a block or a
//     reduction. Comes from a passive (headshot) or an effect given to the basic attack
//     (atk_headshot: magic, trap); several sources add their chances (one draw). Since the rework,
//     the card's own power (`pctcrit`) no longer counts.
//   - Targeting (ciblage, ultimate): X % of chances to mark the opponent for X turns of the card
//     that marked it. While the mark holds, each strike of that card on it is a headshot.
//     `consomme` 'non': the mark stays until its turns run out; otherwise (default) the first
//     headshot destroys it. A molt removes it.

import type { Attack, Strike } from '../combat/attack.ts';
import { emit, id, opponent, roll, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow, StrikeFlow } from '../combat/flow.ts';
import { attackSources, mergedSource } from '../combat/sources.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData, Num } from '../model/card.ts';
import { critical } from './critical.ts';

export type Targeting = { by: Side; turns: number; pct: number; consume: boolean };

// Its part of a card's status (combat/state.ts): the mark on the targeted card.
export type HeadshotState = {
  targeted: Targeting | null;
};
export const headshotState = (): HeadshotState => ({ targeted: null });

export const critPct = (v: Num): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n : 50;
};

// Each strike, after its power: a headshot makes it critical.
export function headshotStrike(c: Combat, at: Attack, st: Strike): StrikeFlow {
  const { a, d, idd } = at;
  if (st.blocked || d.hp <= 0) return undefined;
  const g = attackSources(a, (q) => q.type === 'headshot')[0];
  const mark = d.status.targeted && d.status.targeted.by === a ? d.status.targeted : null;
  if (mark) {
    if (mark.consume) d.status.targeted = null;
  } else {
    if (!g) return undefined;
    const first = g[0] as EffectData;
    const q =
      g.length === 1
        ? roll(c, first.chance == null || first.chance === '' ? 100 : +first.chance)
          ? first
          : undefined
        : mergedSource(c, g, 100);
    if (!q) return undefined;
  }
  critical(c, at, st, true, !!mark);
  if (mark && mark.consume) emit(c, { type: 'targetEnded', side: idd });
  return undefined;
}

// Effect ciblage: marks the opponent.
export function targetingEffect({ c, e, o, x }: EffectContext): void {
  const chance = e.chance == null || e.chance === '' ? 100 : +e.chance || 0;
  if (chance < 100 && !roll(c, chance)) {
    emit(c, { type: 'targetMissed', side: id(c, x), by: id(c, o) });
    return;
  }
  const turns = Math.max(1, parseInt(String(e.tours), 10) || 1);
  const consume = e.consomme !== 'non';
  x.status.targeted = { by: o, turns, pct: critPct(e.pctcrit), consume };
  emit(c, { type: 'targeted', side: id(c, x), by: id(c, o), turns, consume });
}

// End of the marking card's turn: its mark on the opponent counts down.
export function targetingEnd(c: Combat, s: Side): Flow {
  const d = opponent(c, s);
  const mark = d.status.targeted;
  if (mark && mark.by === s && --mark.turns <= 0) {
    d.status.targeted = null;
    emit(c, { type: 'targetEnded', side: id(c, d) });
  }
  return undefined;
}

// Its effects (the registry of effects.ts). atk_headshot: attack-effects.ts.
export const effects = {
  ciblage: { run: targetingEffect, withoutTarget: true },
} satisfies EffectRules;
