// Living weapon (arme_vivante, passive, November 2026), for the living weapons:
//   - forged more: up to LIVING_WEAPON.forgeMax forges on its fighter (6, instead of forgeMax), and
//     each forge of its fighter has LIVING_WEAPON.double % (50) of chances to be doubled
//     (mechanics/forge.ts);
//   - a burn laid on it does no damage and no calcination: it forges the fighter instead (once per
//     burn laid, not per tick). At its forge max, the burn does nothing;
//   - immune to bleed, poison, frost and the lightning mark: they are never laid on it.
//
// Each status's lay function asks livingWeaponTakes first (before the mist: an immune card never
// spends its mist).

import { emit, id, type Combat } from '../combat/combat.ts';
import type { Side } from '../combat/state.ts';
import type { LivingWeaponImmunity } from '../events.ts';
import { forgeFighter, isLivingWeapon, LIVING_WEAPON } from './forge.ts';

// Before a status is laid on dst: true when dst is a living weapon that takes it (then it is not
// laid). A burn forges it.
export function livingWeaponTakes(
  c: Combat,
  dst: Side,
  status: LivingWeaponImmunity | 'burn',
): boolean {
  if (dst.hp <= 0 || !isLivingWeapon(dst)) return false;
  if (status !== 'burn') {
    emit(c, { type: 'livingWeaponImmune', side: id(c, dst), status });
    return true;
  }
  const max = dst.status.forgeLevel >= LIVING_WEAPON.forgeMax;
  emit(c, { type: 'livingWeaponBurned', side: id(c, dst), forged: !max });
  if (!max) forgeFighter(c, dst);
  return true;
}
