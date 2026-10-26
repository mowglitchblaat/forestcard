// Headshot and targeting: two mechanics that work apart or together.
//   - Headshot (critical hit): X % of chances, on each strike, to add X % of the attacker's ATQ to
//     the strike (pctcrit, 50 when empty). It comes first: right after the strike's power, before
//     a block or a reduction. Comes from a passive (headshot) or an effect given to the basic attack
//     (atk_headshot: magic, trap); several sources add their chances (one draw).
//   - Targeting (ciblage, ultimate): X % of chances to mark the opponent for X turns of the card
//     that marked it. While the mark holds, each strike of that card on it is a headshot (its pctcrit,
//     or the largest of the card's headshot sources). `consomme` 'non': the mark stays until its
//     turns run out; otherwise (default) the first headshot destroys it. A molt removes it.

import type { Attack, Strike } from '../combat/attack.ts';
import { emit, id, opponent, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow, StrikeFlow } from '../combat/flow.ts';
import { attackSources, mergedSource } from '../combat/sources.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData, Num } from '../model/card.ts';

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

// Each strike, after its power: a headshot adds X % of the ATQ.
export function headshotStrike(c: Combat, { a, d, ia, idd }: Attack, st: Strike): StrikeFlow {
  if (st.blocked || d.hp <= 0) return undefined;
  const g = attackSources(a, (q) => q.type === 'headshot')[0];
  const mark = d.status.targeted && d.status.targeted.by === a ? d.status.targeted : null;
  let pct: number;
  if (mark) {
    pct = Math.max(mark.pct, ...(g ?? []).map((q) => critPct(q.pctcrit)));
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
    pct = critPct(q.pctcrit);
  }
  const bonus = Math.max(0, round((a.atq * pct) / 100));
  st.n += bonus;
  emit(c, { type: 'headshot', side: ia, target: idd, bonus, forced: !!mark });
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
