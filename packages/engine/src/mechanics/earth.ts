// Earth skills (rework of October 2026): two passives with a counter on the card that holds them.
//   - Sédimentation (sedimentation): each strike that lands on the card gives it a layer of rock; at
//     3 layers a shield rises (`val`, unit `u`: points, or % of its max HP; 20 % when empty) and the
//     layers start again. The shield is temporary HP: it takes a strike's damage first, before the
//     block and the reductions, until it is used up; two shields add up.
//   - Réplique sismique (replique): each strike that lands on the card gives it a seismic charge; at
//     3 charges the ground strikes back at the attacker (`pctatq` % of the card's ATQ, 50 when empty)
//     and the charges start again. The counter-strike is direct damage, not an attack: it fills no
//     counter, fires no "attacked N times" trap and is never a critical hit; the attacker can dodge it.
// A strike "lands" when it deals damage, or when the card's own defenses took it all (block,
// reduction, shield): a dodged strike, or one with no damage at all, gives nothing. A molt removes the
// layers and the charges (not a shield already up).

import type { Attack, Strike } from '../combat/attack.ts';
import { amount, emit, id, over, raw, round, type Combat } from '../combat/combat.ts';
import { damage } from '../combat/damage.ts';
import type { StrikeFlow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { dodges } from './dodge.ts';

export const EARTH_THRESHOLD = 3;

// Its part of a card's status (combat/state.ts).
export type EarthState = {
  layers: number; // sedimentation
  charges: number; // seismic counter
  shield: number; // temporary HP left
};
export const earthState = (): EarthState => ({ layers: 0, charges: 0, shield: 0 });

const shieldOf = (p: EffectData, s: Side): number =>
  p.val == null || p.val === ''
    ? round((s.maxHp * 20) / 100)
    : Math.max(0, amount({ u: p.u, val: p.val }, s.maxHp));

// Each strike, before the block and the reductions: the shield takes what it can.
export function shieldStrike(c: Combat, { d, idd }: Attack, st: Strike): StrikeFlow {
  if (st.n <= 0 || d.status.shield <= 0) return undefined;
  const taken = Math.min(d.status.shield, st.n);
  d.status.shield -= taken;
  st.n -= taken;
  emit(c, { type: 'shieldAbsorbed', side: idd, amount: taken, left: d.status.shield });
  if (st.n <= 0) {
    st.blocked = true;
    st.shielded = true;
  }
  return undefined;
}

// A breath or a missile: the shield takes what it can first. Returns what is left.
export function shieldShot(c: Combat, d: Side, n: number): number {
  if (n <= 0 || d.status.shield <= 0) return n;
  const taken = Math.min(d.status.shield, n);
  d.status.shield -= taken;
  emit(c, { type: 'shieldAbsorbed', side: id(c, d), amount: taken, left: d.status.shield });
  return n - taken;
}

// Each strike that landed: the layers and the charges of the card hit.
export function earthCounters(c: Combat, { a, d, ia, idd }: Attack, _st: Strike): StrikeFlow {
  if (d.hp <= 0) return undefined;
  const sediment = d.passives.find((p) => p.type === 'sedimentation');
  if (sediment) {
    d.status.layers++;
    emit(c, { type: 'layerGained', side: idd, layers: d.status.layers });
    if (d.status.layers >= EARTH_THRESHOLD) {
      d.status.layers = 0;
      const gain = shieldOf(sediment, d);
      d.status.shield += gain;
      emit(c, { type: 'shieldRaised', side: idd, amount: gain, total: d.status.shield });
    }
  }
  const seismic = d.passives.find((p) => p.type === 'replique');
  if (seismic && a.hp > 0) {
    d.status.charges++;
    emit(c, { type: 'chargeGained', side: idd, charges: d.status.charges });
    if (d.status.charges >= EARTH_THRESHOLD) {
      d.status.charges = 0;
      const pct = seismic.pctatq == null || seismic.pctatq === '' ? 50 : +raw(seismic.pctatq) || 0;
      const dodged = dodges(c, a);
      emit(c, { type: 'seismicStrike', side: idd, target: ia, dodged });
      if (!dodged) {
        const n = damage(c, d, a, round((Math.max(0, d.atq) * pct) / 100));
        emit(c, { type: 'damaged', side: ia, amount: n, cause: 'seismic', from: idd });
      }
      if (a.hp <= 0 || over(c)) return 'stop';
    }
  }
  return undefined;
}

// A molt: the layers and charges are gone.
export function earthMolt(s: Side): void {
  s.status.layers = 0;
  s.status.charges = 0;
}
