// Scythe and laser (November 2026): two strikes whose bonus depends on the target's HP, one the
// mirror of the other.
//   - Scythe (fauche): a tearing strike, as an axe or a scythe, an executioner: the more HP the
//     target has lost, the harder it hits. Bonus: up to `pctmax` % (100 when empty) of the strike,
//     in proportion to the target's missing HP (target at 40 % of its HP, pctmax 100: +60 %).
//   - Laser (laser): a laser shot, best on a target at full HP, weaker as its HP drop. Bonus: up to
//     `pctmax` % of the strike, in proportion to the HP the target has left (at full HP: +100 %).
//
// Each comes from:
//   - a passive (fauche, laser) or an effect given to the basic attack by a magic or a trap
//     (atk_fauche, atk_laser): `chance` % (100 when empty), on each strike, of that bonus. Several
//     sources add their chances (one draw). It comes after the strike's power, its critical hit
//     and a lightning mark, before a shield, the block and the reductions;
//   - an effect (fauche, laser: ultimate, magic, trap): a strike apart of `pctatq` % of its ATQ
//     (100 when empty) with the same bonus. It is not an attack: no dodge, no block, no attack
//     passive; reductions apply (damage()).

import type { Attack, Strike } from '../combat/attack.ts';
import { emit, id, roll, round, type Combat } from '../combat/combat.ts';
import { damage } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { StrikeFlow } from '../combat/flow.ts';
import { attackSources, mergedSource } from '../combat/sources.ts';
import type { Side } from '../combat/state.ts';
import type { ScalingKind } from '../events.ts';
import type { EffectData, Num } from '../model/card.ts';

const positive = (v: Num | undefined, fallback: number): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// The share (0 to 1) of the bonus on d: its missing HP (scythe), or the HP it has left (laser).
function share(kind: ScalingKind, d: Side): number {
  const left = d.maxHp > 0 ? Math.max(0, Math.min(1, d.hp / d.maxHp)) : 0;
  return kind === 'fauche' ? 1 - left : left;
}

// The bonus of source q on a strike of n damage against d.
const bonusOf = (kind: ScalingKind, q: EffectData, d: Side, n: number): number =>
  round((n * positive(q.pctmax, 100) * share(kind, d)) / 100);

// Each strike: the sources' chances (one draw), then the bonus.
function scaledStrike(
  c: Combat,
  { d, ia, idd }: Attack,
  st: Strike,
  kind: ScalingKind,
  sources: EffectData[][],
): StrikeFlow {
  if (st.blocked || st.n <= 0 || d.hp <= 0) return undefined;
  const g = sources[0];
  if (!g) return undefined;
  const first = g[0] as EffectData;
  const q =
    g.length === 1
      ? roll(c, first.chance == null || first.chance === '' ? 100 : +first.chance)
        ? first
        : undefined
      : mergedSource(c, g, 100);
  if (!q) return undefined;
  const bonus = bonusOf(kind, q, d, st.n);
  st.n += bonus;
  const pct = round(share(kind, d) * 100);
  emit(c, { type: 'scaled', kind, side: ia, target: idd, bonus, pct, active: false });
  return undefined;
}

export function scytheStrike(c: Combat, at: Attack, st: Strike): StrikeFlow {
  const sources = attackSources(at.a, (q) => q.type === 'fauche');
  return scaledStrike(c, at, st, 'fauche', sources);
}
export function laserStrike(c: Combat, at: Attack, st: Strike): StrikeFlow {
  const sources = attackSources(at.a, (q) => q.type === 'laser');
  return scaledStrike(c, at, st, 'laser', sources);
}

// The effect: a strike apart, with its bonus.
function scaledEffect(kind: ScalingKind, { c, e, o, x }: EffectContext): void {
  if (x.hp <= 0) return;
  const base = Math.max(0, round((o.atq * positive(e.pctatq, 100)) / 100));
  const bonus = bonusOf(kind, e, x, base);
  const pct = round(share(kind, x) * 100);
  emit(c, { type: 'scaled', kind, side: id(c, o), target: id(c, x), bonus, pct, active: true });
  const n = damage(c, o, x, base + bonus);
  emit(c, { type: 'damaged', side: id(c, x), amount: n, cause: kind });
}

// Its effects (the registry of effects.ts). atk_fauche, atk_laser: attack-effects.ts.
export const effects = {
  fauche: { run: (ctx: EffectContext) => scaledEffect('fauche', ctx), once: true },
  laser: { run: (ctx: EffectContext) => scaledEffect('laser', ctx), once: true },
} satisfies EffectRules;
