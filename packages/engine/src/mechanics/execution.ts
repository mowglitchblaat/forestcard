// Execution: marks on the target (3 max), placed with the hit, before its damage. With 3 marks, a hit
// that would leave it under X % of its max HP (10 % by default) is the execution, even if it should
// avoid death. Revive stays possible. Marks are not purged; they disappear when the card dies.
//
// Marking status (`statmarque`, `chancemarque`): once marked by such an effect, every damage of that
// status (bleed, burn, poison, or all three) on the target has X % chance to place one more mark,
// until the end of the combat. Like the threshold, it is carried by the target, highest chance kept.

import type { Attack } from '../combat/attack.ts';
import { emit, id, roll, type Combat } from '../combat/combat.ts';
import { damage } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { StrikeFlow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import { grantAttackEffect } from './attack-effects.ts';
import type { EffectData, Num } from '../model/card.ts';

// Its part of a card's status (combat/state.ts).
export type ExecutionState = {
  executionMarks: number; // 3 max
  executionThreshold: number; // percent of max HP
  markingStatuses: Partial<Record<MarkingStatus, number>>; // status → chance (%) of a mark per damage
};
export const executionState = (): ExecutionState => ({
  executionMarks: 0,
  executionThreshold: 0,
  markingStatuses: {},
});

// The statuses whose damage can place a mark (keys as in the database).
export const MARKING_STATUSES = ['saignement', 'brulure', 'poison'] as const;
export type MarkingStatus = (typeof MARKING_STATUSES)[number];

// The marking status an execution effect gives its target: `statmarque` (one status, or `tous`),
// `chancemarque` %. Nothing when absent, `aucun` or 0 %.
function markingStatuses(d: Side, q: EffectData | undefined): void {
  const chance = parseInt(String(q?.chancemarque), 10);
  if (!q || !Number.isFinite(chance) || chance <= 0) return;
  const kinds: readonly MarkingStatus[] =
    q.statmarque === 'tous' ? MARKING_STATUSES : MARKING_STATUSES.filter((k) => k === q.statmarque);
  for (const k of kinds)
    d.status.markingStatuses[k] = Math.max(d.status.markingStatuses[k] ?? 0, chance);
}

export function mark(c: Combat, d: Side, n: number, threshold: Num, q?: EffectData): void {
  if (d.hp <= 0) return;
  const pct = parseInt(String(threshold), 10);
  if (Number.isFinite(pct) && pct > 0)
    d.status.executionThreshold = Math.max(d.status.executionThreshold, pct);
  markingStatuses(d, q);
  for (let k = 0; k < n && d.status.executionMarks < 3; k++) {
    d.status.executionMarks++;
    emit(c, { type: 'markReceived', side: id(c, d), marks: d.status.executionMarks });
  }
}

export function execute(c: Combat, a: Side, d: Side): number {
  emit(c, { type: 'executed', side: id(c, d) });
  c.executing = 1;
  const n = damage(c, a, d, d.hp);
  c.executing = 0;
  d.status.executionMarks = 0;
  emit(c, { type: 'damaged', side: id(c, d), amount: n, cause: 'execution' });
  return n;
}

// A damage of a status on s (after it is dealt): X % chance of a mark, if a marking effect gave that
// status to s. Rolls only then, so combats without it draw the same numbers as before.
export function statusDamageMarks(c: Combat, s: Side, status: MarkingStatus): void {
  const chance = s.status.markingStatuses[status];
  if (!chance || s.hp <= 0 || s.status.executionMarks >= 3) return;
  if (roll(c, chance)) mark(c, s, 1, 0);
}

// 3 marks and this hit would leave the target under the threshold: the hit IS the execution
// (avoid-death never triggers, no heal comes in between). Revive stays possible.
export const executesNow = (d: Side, n: number): boolean =>
  d.hp > 0 &&
  d.status.executionMarks >= 3 &&
  d.hp - n < (d.maxHp * (d.status.executionThreshold || 10)) / 100;

// Execution: X % to place a mark on every hit, with the hit, before its damage.
export function executionMarks(c: Combat, { a, d }: Attack): StrikeFlow {
  for (const q of [...a.passives, ...a.status.attackEffects])
    if (
      q.type === 'execution' &&
      d.hp > 0 &&
      roll(c, q.chance == null || q.chance === '' ? 100 : +q.chance)
    )
      mark(c, d, 1, q.seuilexec, q);
  return undefined;
}

// Effect execution: the card's basic attack places marks (its chance, its threshold).
export function executionEffect({ c, e, o, fromMagic }: EffectContext): void {
  const attackEffect: EffectData = {
    type: 'execution',
    chance: e.chance == null || e.chance === '' ? 100 : +e.chance || 0,
    seuilexec: e.seuilexec,
    statmarque: e.statmarque,
    chancemarque: e.chancemarque,
  };
  grantAttackEffect(o, attackEffect, fromMagic);
  emit(c, { type: 'executionPrepared', side: id(c, o), chance: attackEffect.chance });
}

// Effect execution_direct: marks placed now. Stolen or cancelled magic: its marks leave with it.
export function marksEffect({ c, e, x, onUndo }: EffectContext): void {
  const before = x.status.executionMarks;
  const marking = { ...x.status.markingStatuses };
  mark(c, x, Math.max(1, parseInt(String(e.nbmarques), 10) || 1), e.seuilexec, e);
  const added = x.status.executionMarks - before;
  if (JSON.stringify(marking) !== JSON.stringify(x.status.markingStatuses))
    onUndo(() => {
      x.status.markingStatuses = marking;
    });
  if (added > 0)
    onUndo(() => {
      if (x.hp <= 0) return;
      x.status.executionMarks = Math.max(0, x.status.executionMarks - added);
      emit(c, {
        type: 'marksLost',
        side: id(c, x),
        count: added,
        marks: x.status.executionMarks,
      });
    });
}

// Its effects (the registry of effects.ts).
export const effects = {
  execution: { run: executionEffect },
  execution_direct: { run: marksEffect, withoutTarget: true },
} satisfies EffectRules;
