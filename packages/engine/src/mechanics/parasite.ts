// Parasitic link (lien parasitaire): laid on a card (the carrier) for X of its turns. While it
// holds, the carrier shares its heals: X % of each heal (50 when empty) goes to the opponent
// instead. Laid again, the duration is the longest and the share the new one.
//
// Laid by: an effect (lien_parasite: ultimate, magic, trap; on the opponent), a passive (X % of
// chances on each hit, LAID_ON_HIT), the insect mutation at level III. A negative status: a mist
// takes it, a molt removes it.

import { emit, id, opponent, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData, Num } from '../model/card.ts';
import { mistTakes } from './mist.ts';

export type Parasite = { to: Side; turns: number; pct: number };

// Its part of a card's status (combat/state.ts).
export type ParasiteState = {
  parasite: Parasite | null;
};
export const parasiteState = (): ParasiteState => ({ parasite: null });

export const sharePct = (v: Num): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(100, n) : 50;
};
const turnsOf = (v: Num, d: number): number => Math.max(1, parseInt(String(v), 10) || d);

// Links the carrier to `to`: the carrier's heals feed `to`.
export function link(c: Combat, carrier: Side, to: Side, turns: number, pct: number): void {
  if (carrier.hp <= 0) return;
  if (mistTakes(c, carrier, 'parasite', (t) => link(c, t, opponent(c, t), turns, pct))) return;
  const now = carrier.status.parasite;
  carrier.status.parasite = { to, turns: Math.max(now?.turns ?? 0, turns), pct };
  emit(c, {
    type: 'parasiteLinked',
    side: id(c, carrier),
    to: id(c, to),
    turns: carrier.status.parasite.turns,
    pct,
    stacked: !!now,
  });
}

// A heal of n on s (after the bleed's reduction): the part s keeps. The shared part is healed on
// the other card right after (shareHeal), never shared again.
let sharing = false;
export function sharedPart(s: Side, n: number): number {
  const p = s.status.parasite;
  if (!p || sharing || n <= 0 || p.to.hp <= 0) return 0;
  return round((n * p.pct) / 100);
}
export function shareHeal(
  c: Combat,
  s: Side,
  share: number,
  heal: (c: Combat, s: Side, n: number) => void,
): void {
  const p = s.status.parasite;
  if (!p || share <= 0) return;
  emit(c, { type: 'parasiteFed', side: id(c, s), to: id(c, p.to), amount: share });
  sharing = true;
  try {
    heal(c, p.to, share);
  } finally {
    sharing = false;
  }
}

export function parasiteEffect({ c, e, o, x, onUndo }: EffectContext): void {
  link(c, x, o, turnsOf(e.tours, 3), sharePct(e.pctlien));
  const laid = x.status.parasite;
  onUndo(() => {
    if (!laid || x.status.parasite !== laid) return;
    x.status.parasite = null;
    emit(c, { type: 'parasiteEnded', side: id(c, x) });
  });
}

// A strike that landed (passive lien_parasite): X % of chances to link the target.
export function parasiteOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) link(c, d, opponent(c, d), turnsOf(q.tours, 3), sharePct(q.pctlien));
}

// End of its turn: the carrier's link counts down.
export function parasiteEnd(c: Combat, s: Side): Flow {
  const p = s.status.parasite;
  if (p && --p.turns <= 0) {
    s.status.parasite = null;
    emit(c, { type: 'parasiteEnded', side: id(c, s) });
  }
  return undefined;
}

export const parasiteTurns = (v: Num): number => turnsOf(v, 3);

// Its effects (the registry of effects.ts).
export const effects = {
  lien_parasite: { run: parasiteEffect },
} satisfies EffectRules;
