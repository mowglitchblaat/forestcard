// Rooting (enracinement, rework of October 2026): one status, three variants (`variante`), no level
// (its strength is set on the card). Different variants live side by side on a card; the same
// variant laid again keeps the longest duration and the strongest values.
//   - epineux (thorny): each strike the rooted card makes hurts it, `val` direct damage (5 when
//     empty), whether the strike lands or not;
//   - empoisonne (poisoned): each strike it makes lays a poison on itself (poison level `niveau`,
//     I when empty, for `ptours` turns, 2 when empty);
//   - inhibiteur (inhibiting): its ultimates cannot be launched while it runs; one that comes due
//     waits, and is launched as soon as the rooting is gone (mechanics/ultimates.ts).
// Its damage is direct damage, not an attack. It counts the rooted card's turns. A negative status:
// purified, taken by a mist, prolonged by a contamination, removed by a molt.
//
// Laid by: an effect (enracinement), an attack (passive or attack effect enracinement).

import type { Attack, Strike } from '../combat/attack.ts';
import { emit, id, over, raw, roll, type Combat } from '../combat/combat.ts';
import { damage } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow, StrikeFlow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { explicitLevel } from '../model/levels.ts';
import { contaminationExtra } from './contamination.ts';
import { damageOverTime } from './dot.ts';
import { mistTakes } from './mist.ts';

export const ROOT_VARIANTS = ['epineux', 'empoisonne', 'inhibiteur'] as const;
export type RootVariant = (typeof ROOT_VARIANTS)[number];

// val: thorns damage; level, poisonTurns: the poison it lays.
export type Rooting = {
  variant: RootVariant;
  turns: number;
  val: number;
  level: number;
  poisonTurns: number;
};

// Its part of a card's status (combat/state.ts).
export type RootingState = {
  rootings: Rooting[];
};
export const rootingState = (): RootingState => ({ rootings: [] });

export const DEFAULT_THORNS = 5;

const variantOf = (v: unknown): RootVariant =>
  ROOT_VARIANTS.includes(v as RootVariant) ? (v as RootVariant) : 'epineux';

export function root(c: Combat, d: Side, q: Omit<Rooting, 'turns'>, turnsIn: number): void {
  if (mistTakes(c, d, 'rooting', (t) => root(c, t, q, turnsIn))) return;
  const turns = Math.max(1, turnsIn) + contaminationExtra(d);
  const now = d.status.rootings.find((z) => z.variant === q.variant);
  if (now) {
    now.turns = Math.max(now.turns, turns);
    now.val = Math.max(now.val, q.val);
    now.level = Math.max(now.level, q.level);
    now.poisonTurns = Math.max(now.poisonTurns, q.poisonTurns);
  } else d.status.rootings.push({ ...q, turns });
  const r = (now ?? d.status.rootings.at(-1)) as Rooting;
  emit(c, {
    type: 'rooted',
    side: id(c, d),
    variant: r.variant,
    stacked: !!now,
    turns: r.turns,
    val: r.val,
    level: r.level,
  });
}

// Its ultimates wait while an inhibiting rooting runs.
export const inhibited = (s: Side): boolean =>
  s.status.rootings.some((z) => z.variant === 'inhibiteur');

// Each strike it makes, before the dodge: the thorns hurt it, the poison takes it.
export function rootedStrike(c: Combat, { a, d, ia }: Attack, _st: Strike): StrikeFlow {
  for (const z of a.status.rootings.slice()) {
    if (a.hp <= 0) break;
    if (z.variant === 'epineux' && z.val > 0) {
      const n = damage(c, d, a, z.val);
      emit(c, { type: 'damaged', side: ia, amount: n, cause: 'thorns' });
    } else if (z.variant === 'empoisonne') damageOverTime(c, a, 'poison', z.level, z.poisonTurns);
  }
  if (a.hp <= 0 || over(c)) return 'stop';
  return undefined;
}

// End of its turn: the rootings count down.
export function rootingsEnd(c: Combat, s: Side): Flow {
  s.status.rootings = s.status.rootings.filter((z) => {
    if (--z.turns > 0) return true;
    emit(c, { type: 'rootEnded', side: id(c, s), variant: z.variant });
    return false;
  });
  return undefined;
}

const laid = (e: EffectData): Omit<Rooting, 'turns'> => ({
  variant: variantOf(e.variante),
  val: e.val == null || e.val === '' ? DEFAULT_THORNS : Math.max(0, +raw(e.val) || 0),
  level: explicitLevel(e.niveau) || 1,
  poisonTurns: Math.max(1, parseInt(String(e.ptours), 10) || 2),
});
const turnsOf = (e: EffectData): number => +(e.tours as number) || 2;

export function rootingEffect({ c, e, statusTarget }: EffectContext): void {
  root(c, statusTarget(), laid(e), turnsOf(e));
}

export function rootingOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) root(c, d, laid(q), turnsOf(q));
}

// Its effects (the registry of effects.ts).
export const effects = {
  enracinement: { run: rootingEffect, undoesStatuses: 'target' },
} satisfies EffectRules;
