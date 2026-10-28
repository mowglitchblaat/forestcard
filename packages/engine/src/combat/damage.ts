// Damage and healing, and the order of a lethal hit (legacy/docs/workflow-combat.md, schema 3):
//   1. avoid-death, BEFORE everything (revive included): magic, then passive, then trap; the card
//      stays at 1 HP, the damage line shows first, the protection right after
//      (mechanics/avoid-death.ts);
//   2. no protection: the other "owner dies" traps fire now; a trap holding a revive is kept for the
//      death: the card shatters, the trap is revealed (a counter-trap may destroy or steal it), then
//      the card reforms only if the trap still holds (mechanics/revive.ts);
//   3. otherwise revive, if a source is left; never after detonation damage (c.noRevive), the card is
//      "reduced to ashes" (mechanics/revive.ts).

import { avoidDeath, breakAvoidDeath } from '../mechanics/avoid-death.ts';
import { healReduction } from '../mechanics/bleed.ts';
import { knellCheck } from '../mechanics/knell.ts';
import { weakened } from '../mechanics/contamination.ts';
import { shareHeal, sharedParts } from '../mechanics/parasite.ts';
import { reviveOnLethal, reviveTrapOnLethal, type TrapRevive } from '../mechanics/revive.ts';
import { emit, id, round, type Combat } from './combat.ts';
import type { Side } from './state.ts';
import { scan } from './traps.ts';

export function heal(c: Combat, s: Side, n: number): void {
  if (s.hp <= 0) return;
  const reduction = healReduction(c, s);
  if (reduction) n = round((n * (100 - reduction)) / 100);
  // parasitic links, both ways: a share of the heal goes to the other card (mechanics/parasite.ts)
  const parts = sharedParts(c, s, n);
  n = Math.min(n - parts.reduce((q, z) => q + z.amount, 0), s.maxHp - s.hp);
  if (n > 0) {
    s.hp += n;
    emit(c, { type: 'healed', side: id(c, s), amount: n, revive: !!c.reviving });
    scan(c, { kind: 'heal', who: id(c, s) });
  }
  shareHeal(c, s, parts, heal);
}

// Applies n damage from src to dst and returns the damage actually dealt. The caller emits the
// `damaged` event, whose flush plays what this function deferred.
export function damage(c: Combat, src: Side, dst: Side, n: number): number {
  n = Math.max(0, round(weakened(dst, n))); // a weak card takes more (mechanics/contamination.ts)
  if (dst.hp <= 0) return 0; // already down: no new damage, no avoid-death replayed
  let after: (() => void) | null = null;
  let trapRevive: TrapRevive | null = null;
  if (n >= dst.hp) {
    // An execution ignores avoid-death, and breaks it; the knell ignores it.
    if (!c.executing && !c.knelling) {
      after = avoidDeath(c, dst);
      if (after) n = dst.hp - 1;
    } else if (c.executing) breakAvoidDeath(c, dst);
    if (!after) trapRevive = reviveTrapOnLethal(c, dst);
  }
  const lethal = n >= dst.hp;
  dst.hp = Math.max(0, dst.hp - n); // HP stop at 0, never negative
  src.damageDealt += n;
  if (lethal) reviveOnLethal(c, dst, trapRevive);
  if (after) c.pendingEffects.push(after);
  // the knell: HP now under its shadow takes the card, right after the damage line
  if (dst.status.knell && !c.knelling && dst.hp > 0)
    c.pendingEffects.push(() => knellCheck(c, dst));
  c.pendingEffects.push(() => scan(c, { kind: 'hp' })); // effects play right after the damage, not before
  return n;
}
