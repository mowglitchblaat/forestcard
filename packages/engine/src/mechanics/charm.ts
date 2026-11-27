// Charm (charme, November 2026): a negative status, one per card. While it lasts, the charmed card
// holds back its blows: each strike of its basic attack deals between 0 and CHARM_MAX % (65) of its
// damage, drawn again at each strike. Its ultimates, its magic and its trap are untouched: only its
// basic attack is charmed.
//
// It lasts `tours` turns of the charmed card (2 when empty). Laid again, the longer duration stays.
// A purification removes it, a mist takes it, a contamination makes it last one turn more, a molt
// sheds it (through the purification).
//
// Laid by:
//   - an effect (charme: ultimate, magic, trap): `chance` % (100 when empty) to charm its target (the
//     opponent, `ciblem`) for `tours` turns; a failed charm is said (the target resists);
//   - an attack (passive charme, or attack effect atk_charme given by a magic or a trap): `chance` %
//     on each strike that landed. Several sources add their chances (one draw, combat/sources.ts).
//
// Its strike step comes after the strike's power and its bonuses (critical, scythe, laser), before a
// shield, the block and the reductions: the charmed card gives less, then the target defends.

import type { Attack, Strike } from '../combat/attack.ts';
import { emit, id, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow, StrikeFlow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { contaminationExtra } from './contamination.ts';
import { mistTakes } from './mist.ts';

// The highest share of its damage a charmed card still deals, in %.
export const CHARM_MAX = 65;

export type Charm = { turns: number };

// Its part of a card's status (combat/state.ts).
export type CharmState = { charm: Charm | null };
export const charmState = (): CharmState => ({ charm: null });

const turnsOf = (e: EffectData): number => Math.max(1, parseInt(String(e.tours), 10) || 2);

export function charm(c: Combat, d: Side, turnsIn: number): void {
  if (mistTakes(c, d, 'charm', (t) => charm(c, t, turnsIn))) return;
  const turns = turnsIn + contaminationExtra(d);
  const now = d.status.charm;
  if (now) now.turns = Math.max(now.turns, turns);
  else d.status.charm = { turns };
  emit(c, {
    type: 'charmed',
    side: id(c, d),
    stacked: !!now,
    turns: (d.status.charm as Charm).turns,
  });
}

// Each strike of a charmed card: it deals only a share of its damage, drawn between 0 and CHARM_MAX %.
export function charmedStrike(c: Combat, { a, ia, idd }: Attack, st: Strike): StrikeFlow {
  if (!a.status.charm || st.blocked || st.n <= 0) return undefined;
  const pct = Math.floor(c.random() * (CHARM_MAX + 1));
  const before = st.n;
  st.n = round((st.n * pct) / 100);
  emit(c, { type: 'charmHeld', side: ia, target: idd, pct, before, after: st.n });
  return undefined;
}

// End of its turn: the charm counts down.
export function charmEnd(c: Combat, s: Side): Flow {
  const z = s.status.charm;
  if (z && --z.turns <= 0) {
    s.status.charm = null;
    emit(c, { type: 'statusEnded', side: id(c, s), status: 'charm' });
  }
  return undefined;
}

export function charmEffect({ c, e, o, statusTarget }: EffectContext): void {
  const t = statusTarget();
  if (t.hp <= 0) return;
  const chance = e.chance == null || e.chance === '' ? 100 : +e.chance || 0;
  if (chance < 100 && !roll(c, chance)) {
    emit(c, { type: 'charmResisted', side: id(c, t), by: id(c, o) });
    return;
  }
  charm(c, t, turnsOf(e));
}

export function charmOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) charm(c, d, turnsOf(q));
}

// Its effects (the registry of effects.ts). atk_charme: attack-effects.ts.
export const effects = {
  charme: { run: charmEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
