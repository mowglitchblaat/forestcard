// The core of a card's attack: what an attack and a strike carry from one step to the next, the
// strike's damage and hit, and the statuses an attack lays, dispatched to their mechanics. The
// steps' order lives in moments.ts; the steps themselves, in mechanics/.

import { bleedOnHit } from '../mechanics/bleed.ts';
import { countHit, useCounterBonus } from '../mechanics/counter.ts';
import { curseOnHit } from '../mechanics/curse.ts';
import { burnOnHit, poisonOnHit } from '../mechanics/dot.ts';
import { damageFactor } from '../mechanics/double-damage.ts';
import { execute, executesNow } from '../mechanics/execution.ts';
import { fatigueOnHit } from '../mechanics/fatigue.ts';
import { fractureOnHit } from '../mechanics/fracture.ts';
import { frostOnHit } from '../mechanics/frost.ts';
import { rageBonus } from '../mechanics/rage.ts';
import type { EffectData } from '../model/card.ts';
import type { BlockRiposte } from '../mechanics/block.ts';
import { emit, type Combat } from './combat.ts';
import { attackSources, mergedSource } from './sources.ts';
import { damage } from './damage.ts';
import type { Flow, StrikeFlow } from './flow.ts';
import type { Side } from './state.ts';
import { knellOnHit } from '../mechanics/knell.ts';
import { contaminationOnHit } from '../mechanics/contamination.ts';
import { rootingOnHit } from '../mechanics/rooting.ts';
import { shearOnHit } from '../mechanics/blades.ts';
import { lightningOnHit } from '../mechanics/lightning.ts';
import { parasiteOnHit } from '../mechanics/parasite.ts';

// What an attack carries from one step to the next (the legacy engine's local variables).
export type Attack = {
  a: Side; // the attacker
  d: Side; // its target
  ia: number;
  idd: number;
  blocked: boolean; // blocked attack: its first blockStrikes strikes land at 0 damage
  blockStrikes: number; // how many strikes the block takes (Infinity: the whole attack)
  riposte: BlockRiposte | null; // the blocker's riposte, on the first strike it blocks (then null)
  strikes: number;
  base: number; // strikes before the chain's extra ones
  swallowTried: number; // swallowing: one mark (or attempt) per attack, even with several strikes
};

// And from one step of a strike to the next.
export type Strike = {
  k: number; // index of the strike, from 0
  n: number; // damage of the strike
  blocked: boolean; // all its damage absorbed: counts as blocked, its statuses still apply
  shielded?: boolean; // all its damage taken by a shield (mechanics/earth.ts): a block does not riposte
  crit?: boolean; // a critical hit (mechanics/critical.ts)
};

export type AttackStep = (c: Combat, at: Attack) => Flow;
export type StrikeStep = (c: Combat, at: Attack, st: Strike) => StrikeFlow;

// ── Whether it can attack ──

// ── How many strikes ──

// ── Before the strikes ──

// ── Each strike ──

// double damage, counter bonus, rage; fatigue: less damage (already taken off the attack)
export function strikePower(
  _c: Combat,
  { a, blocked, blockStrikes }: Attack,
  st: Strike,
): StrikeFlow {
  st.n = Math.max(0, a.atq * damageFactor(a) + useCounterBonus(a) + rageBonus(a));
  st.blocked = blocked && st.k < blockStrikes;
  return undefined;
}

export function hit(c: Combat, { a, d, idd }: Attack, st: Strike): StrikeFlow {
  countHit(d);
  if (executesNow(d, st.n)) {
    st.n = execute(c, a, d); // the hit is the execution (mechanics/execution.ts)
    return undefined;
  }
  st.n = damage(c, a, d, st.n);
  emit(c, { type: 'damaged', side: idd, amount: st.n, cause: 'attack' });
  return undefined;
}

// What a strike that landed brings (damage dealt, or blocked: no life steal then, but stun and
// statuses apply). Run by moments.ts only when it landed.
export const landed = ({ d }: Attack, st: Strike): boolean => (st.n > 0 || st.blocked) && d.hp > 0;

// The statuses an attack lays (passives and attack effects), by type.
export const LAID_ON_HIT: Record<string, (c: Combat, q: EffectData, d: Side) => void> = {
  brulure: burnOnHit,
  poison: poisonOnHit,
  saignement: bleedOnHit,
  malediction: curseOnHit,
  fracture: fractureOnHit,
  gel: frostOnHit,
  glas: knellOnHit,
  fatigue: fatigueOnHit,
  lien_parasite: parasiteOnHit,
  enracinement: rootingOnHit,
  contamination: contaminationOnHit,
  cisaillement: shearOnHit,
  foudre: lightningOnHit,
};

// A strike that landed: the statuses given by passives and by basic attack effects, in the order the
// card holds them. A single source draws as it always did; several of the same status add up.
export function statusesOnHit(c: Combat, { a, d }: Attack): StrikeFlow {
  for (const g of attackSources(a, (q) => Object.hasOwn(LAID_ON_HIT, q.type as string))) {
    const first = g[0] as EffectData;
    const lay = LAID_ON_HIT[first.type as string] as (c: Combat, q: EffectData, d: Side) => void;
    if (g.length === 1) lay(c, first, d);
    else {
      const q = mergedSource(c, g, 0);
      if (q) lay(c, q, d);
    }
  }
  return undefined;
}
