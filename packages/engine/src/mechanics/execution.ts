// Execution: marks on the target (3 max). With 3 marks, an attack leaving it under X % of its max HP
// (10 % by default) executes it, even if it should avoid death. Revive stays possible. Marks are not
// purged; they disappear when the card dies.

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
};
export const executionState = (): ExecutionState => ({ executionMarks: 0, executionThreshold: 0 });

export function mark(c: Combat, d: Side, n: number, threshold: Num): void {
  if (d.hp <= 0) return;
  const pct = parseInt(String(threshold), 10);
  if (Number.isFinite(pct) && pct > 0)
    d.status.executionThreshold = Math.max(d.status.executionThreshold, pct);
  for (let k = 0; k < n && d.status.executionMarks < 3; k++) {
    d.status.executionMarks++;
    emit(c, { type: 'markReceived', side: id(c, d), marks: d.status.executionMarks });
  }
}

export function execute(c: Combat, a: Side, d: Side): void {
  emit(c, { type: 'executed', side: id(c, d) });
  c.executing = 1;
  const n = damage(c, a, d, d.hp);
  c.executing = 0;
  d.status.executionMarks = 0;
  emit(c, { type: 'damaged', side: id(c, d), amount: n, cause: 'execution' });
}

// Execution: X % to place a mark on every hit.
export function executionMarks(c: Combat, { a, d }: Attack): StrikeFlow {
  for (const q of [...a.passives, ...a.status.attackEffects])
    if (
      q.type === 'execution' &&
      d.hp > 0 &&
      roll(c, q.chance == null || q.chance === '' ? 100 : +q.chance)
    )
      mark(c, d, 1, q.seuilexec);
  return undefined;
}

// 3 marks and below the threshold: executed (ignores avoid-death).
export function executed(c: Combat, { a, d }: Attack): StrikeFlow {
  if (
    d.hp > 0 &&
    d.status.executionMarks >= 3 &&
    d.hp < (d.maxHp * (d.status.executionThreshold || 10)) / 100
  )
    execute(c, a, d);
  return undefined;
}

// Effect execution: the card's basic attack places marks (its chance, its threshold).
export function executionEffect({ c, e, o, fromMagic }: EffectContext): void {
  const attackEffect: EffectData = {
    type: 'execution',
    chance: e.chance == null || e.chance === '' ? 100 : +e.chance || 0,
    seuilexec: e.seuilexec,
  };
  grantAttackEffect(o, attackEffect, fromMagic);
  emit(c, { type: 'executionPrepared', side: id(c, o), chance: attackEffect.chance });
}

// Effect execution_direct: marks placed now. Stolen or cancelled magic: its marks leave with it.
export function marksEffect({ c, e, x, onUndo }: EffectContext): void {
  const before = x.status.executionMarks;
  mark(c, x, Math.max(1, parseInt(String(e.nbmarques), 10) || 1), e.seuilexec);
  const added = x.status.executionMarks - before;
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
