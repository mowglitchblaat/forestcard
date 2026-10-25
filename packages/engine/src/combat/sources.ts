// The sources of an attack effect: a card's passives and the effects given to its basic attack (by a
// magic, a trap or an ultimate). Sources of the same effect add their chances up.

import { raw, roll, type Combat } from './combat.ts';
import type { Side } from './state.ts';
import type { EffectData } from '../model/card.ts';

// The sources of one attack effect (passives, then the basic attack effects), grouped by type in the
// order the card holds them: a card with a frost passive and a magic giving its attack a frost has ONE
// frost source, whose chances add up.
export function attackSources(a: Side, keep: (q: EffectData) => boolean): EffectData[][] {
  const groups = new Map<string, EffectData[]>();
  for (const q of [...a.passives, ...a.status.attackEffects]) {
    const t = q.type;
    if (t === undefined || !keep(q)) continue;
    const g = groups.get(t);
    if (g) g.push(q);
    else groups.set(t, [q]);
  }
  return [...groups.values()];
}

// Several sources of one effect: their chances add up (100 % at most), one draw; on success, the
// values (duration, damage…) are those of a source drawn in proportion to its chance, as for the
// stun (mechanics/stun.ts). Returns that source, with a 100 % chance, or undefined. `empty` is the
// chance of a source that gives none (0 for a status, 100 for a detonation or an execution).
export function mergedSource(
  c: Combat,
  sources: readonly EffectData[],
  empty: number,
): EffectData | undefined {
  const chance = (q: EffectData) =>
    q.chance == null || q.chance === '' ? empty : Math.max(0, +raw(q.chance) || 0);
  const total = sources.reduce((n, q) => n + chance(q), 0);
  if (!(total > 0) || !roll(c, Math.min(100, total))) return undefined;
  let u = c.random() * total;
  let source = sources[sources.length - 1] as EffectData;
  for (const q of sources) {
    if (u < chance(q)) {
      source = q;
      break;
    }
    u -= chance(q);
  }
  return { ...source, chance: 100 };
}
