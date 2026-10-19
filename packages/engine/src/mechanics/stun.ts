// Stun: the stunned card skips its next attacks (a stun always does, even purified). A
// solidification blocks a new stun.
//
// Laid by: an effect (etourdir_effet), an attack (passive or attack effect etourdir: chances add
// up, the duration is the triggering source's).

import type { Attack } from '../combat/attack.ts';
import { emit, id, raw, roll, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow, StrikeFlow } from '../combat/flow.ts';

// Its part of a card's status (combat/state.ts).
export type StunState = {
  stunTurns: number;
};
export const stunState = (): StunState => ({ stunTurns: 0 });

// Can it attack: a stun always skips the attack.
export function stunned(c: Combat, { a, ia }: Attack): Flow {
  if (!a.status.stunTurns) return undefined;
  a.status.stunTurns--;
  emit(c, {
    type: 'cannotAttack',
    side: ia,
    reason: 'stunned',
    stillStunned: a.status.stunTurns > 0,
  });
  return 'stop';
}

// A strike that landed: stun chances add up (passives + magic effects); the duration is the
// triggering source's.
export function stunOnHit(c: Combat, { a, d }: Attack): StrikeFlow {
  const sources = [...a.passives, ...a.status.attackEffects]
    .filter((q) => q.type === 'etourdir' && (+raw(q.chance) || 0) > 0)
    .map((q) => ({ ...q, chance: +raw(q.chance) }));
  const totalChance = sources.reduce((q, p) => q + p.chance, 0);
  const attempts = Math.max(1, ...sources.map((q) => parseInt(String(q.essais), 10) || 1));
  let stunnedNow = false;
  for (let k = 0; k < attempts && totalChance > 0 && !stunnedNow; k++)
    stunnedNow = roll(c, Math.min(100, totalChance));
  if (!(totalChance > 0 && stunnedNow)) return undefined;
  let u = c.random() * totalChance;
  let source = sources[sources.length - 1] as (typeof sources)[number];
  for (const q of sources) {
    if (u < q.chance) {
      source = q;
      break;
    }
    u -= q.chance;
  }
  const turns = Math.max(1, parseInt(String(source.tours), 10) || 1);
  if (d.status.solidTurns > 0) emit(c, { type: 'stunBlockedBySolid', side: id(c, d) });
  else {
    d.status.stunTurns = Math.max(d.status.stunTurns, turns);
    emit(c, { type: 'stunned', side: id(c, d), turns, by: 'attack' });
  }
  return undefined;
}

// X attempts in a row, the first success is enough; empty chance = 100 %.
export function stunEffect({ c, e, statusTarget }: EffectContext): void {
  const M = statusTarget();
  const chance = e.chance == null || e.chance === '' ? 100 : +e.chance || 0;
  const turns = Math.max(1, parseInt(String(e.tours), 10) || 1);
  const attempts = Math.max(1, parseInt(String(e.essais), 10) || 1);
  let ok = false;
  for (let k = 0; k < attempts && !ok; k++) ok = roll(c, chance);
  if (!ok) {
    emit(c, { type: 'stunResisted', side: id(c, M), chance, attempts });
    return;
  }
  if (M.status.solidTurns > 0) {
    emit(c, { type: 'stunBlockedBySolid', side: id(c, M) });
    return;
  }
  M.status.stunTurns = Math.max(M.status.stunTurns, turns);
  emit(c, { type: 'stunned', side: id(c, M), turns, by: 'effect' });
}

// Its effects (the registry of effects.ts).
export const effects = {
  etourdir_effet: { run: stunEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
