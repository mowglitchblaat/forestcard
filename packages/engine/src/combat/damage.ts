// Damage and healing, and the order of a lethal hit (legacy/docs/workflow-combat.md, schema 3):
//   1. avoid-death, BEFORE everything (revive included): magic, then passive, then trap; the card
//      stays at 1 HP, the damage line shows first, the protection right after
//      (mechanics/avoid-death.ts);
//   2. no protection: the other "owner dies" traps fire now; a trap holding a revive fires now but is
//      SHOWN after the death (mechanics/revive.ts);
//   3. revive, if a source is left; never after detonation damage (c.noRevive), the card is "reduced
//      to ashes" (mechanics/revive.ts).

import { avoidDeath } from '../mechanics/avoid-death.ts';
import { healReduction } from '../mechanics/bleed.ts';
import { reviveOnLethal, reviveTrapOnLethal } from '../mechanics/revive.ts';
import { emit, id, round, type Combat } from './combat.ts';
import type { Side } from './state.ts';
import { scan } from './traps.ts';

export function heal(c: Combat, s: Side, n: number): void {
  if (s.hp <= 0) return;
  const reduction = healReduction(s);
  if (reduction) n = round((n * (100 - reduction)) / 100);
  n = Math.min(n, s.maxHp - s.hp);
  if (n <= 0) return;
  s.hp += n;
  emit(c, { type: 'healed', side: id(c, s), amount: n, revive: !!c.reviving });
  scan(c, { kind: 'heal', who: id(c, s) });
}

// Applies n damage from src to dst and returns the damage actually dealt. The caller emits the
// `damaged` event, whose flush plays what this function deferred.
export function damage(c: Combat, src: Side, dst: Side, n: number): number {
  n = Math.max(0, round(n));
  if (dst.hp <= 0) return 0; // already down: no new damage, no avoid-death replayed
  let after: (() => void) | null = null;
  let revealTrap: (() => void) | null = null;
  if (n >= dst.hp) {
    // An execution ignores avoid-death.
    if (!c.executing) {
      after = avoidDeath(c, dst);
      if (after) n = dst.hp - 1;
    }
    if (!after) revealTrap = reviveTrapOnLethal(c, dst);
  }
  const lethal = n >= dst.hp;
  dst.hp = Math.max(0, dst.hp - n); // HP stop at 0, never negative
  src.damageDealt += n;
  if (lethal) revealTrap = reviveOnLethal(c, dst, revealTrap);
  if (revealTrap) c.pendingEffects.push(revealTrap); // no revive after all: the trap shows right after the damage
  if (after) c.pendingEffects.push(after);
  c.pendingEffects.push(() => scan(c, { kind: 'hp' })); // effects play right after the damage, not before
  return n;
}
