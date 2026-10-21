// Effects of magics, traps, ultimates and random draws (legacy: fx).
//
// applyEffect(c, effect, owner, opponent, fromMagic, returning):
//   fromMagic: a magic effect, which a cancellation, destruction or theft can undo;
//   returning: a cancelled magic coming back, whose "once" effects do not replay.

import type { StatusKind } from '../events.ts';
import { effects as attackEffects } from '../mechanics/attack-effects.ts';
import { effects as avoidDeath } from '../mechanics/avoid-death.ts';
import { effects as bleed } from '../mechanics/bleed.ts';
import { effects as block } from '../mechanics/block.ts';
import { effects as breath } from '../mechanics/breath.ts';
import { effects as cards } from '../mechanics/cards.ts';
import { effects as curse } from '../mechanics/curse.ts';
import { effects as detonation } from '../mechanics/detonation.ts';
import { effects as directDamage } from '../mechanics/direct-damage.ts';
import { effects as dodge } from '../mechanics/dodge.ts';
import { effects as dot } from '../mechanics/dot.ts';
import { effects as doubleDamage } from '../mechanics/double-damage.ts';
import { effects as execution } from '../mechanics/execution.ts';
import { effects as fatigue } from '../mechanics/fatigue.ts';
import { effects as fracture } from '../mechanics/fracture.ts';
import { effects as frost } from '../mechanics/frost.ts';
import { effects as healing } from '../mechanics/healing.ts';
import { effects as lifeSteal } from '../mechanics/life-steal.ts';
import { effects as magicCancel } from '../mechanics/magic-cancel.ts';
import { effects as programming } from '../mechanics/programming.ts';
import { effects as purification } from '../mechanics/purification.ts';
import { effects as rage } from '../mechanics/rage.ts';
import { effects as random } from '../mechanics/random.ts';
import { effects as reflect } from '../mechanics/reflect.ts';
import { effects as revive } from '../mechanics/revive.ts';
import { effects as solidification } from '../mechanics/solidification.ts';
import { effects as stats } from '../mechanics/stats.ts';
import { effects as stun } from '../mechanics/stun.ts';
import { effects as swallow } from '../mechanics/swallow.ts';
import { effects as theft } from '../mechanics/theft.ts';
import { effects as transcendence } from '../mechanics/transcendence.ts';
import { effects as trapImmunity } from '../mechanics/trap-immunity.ts';
import { effects as ultimates } from '../mechanics/ultimates.ts';
import type { EffectData } from '../model/card.ts';
import type { EffectType } from '../model/types.ts';
import { emit, id, type Combat } from './combat.ts';
import type { EffectContext, EffectRule } from './effect-context.ts';
import type { Side } from './state.ts';
import { canonEffect } from './state.ts';

// Every effect's rule, from the mechanics. Assembled on first use: the mechanics import this module,
// so their tables are not readable while the modules load. Missing a type of EFFECT_TYPES does not
// compile.
let registry: Record<EffectType, EffectRule> | undefined;
export const rules = (): Record<EffectType, EffectRule> =>
  (registry ??= {
    ...attackEffects,
    ...avoidDeath,
    ...bleed,
    ...block,
    ...breath,
    ...cards,
    ...curse,
    ...detonation,
    ...directDamage,
    ...dodge,
    ...dot,
    ...doubleDamage,
    ...execution,
    ...fatigue,
    ...fracture,
    ...frost,
    ...healing,
    ...lifeSteal,
    ...magicCancel,
    ...programming,
    ...purification,
    ...rage,
    ...random,
    ...reflect,
    ...revive,
    ...solidification,
    ...stats,
    ...stun,
    ...swallow,
    ...theft,
    ...transcendence,
    ...trapImmunity,
    ...ultimates,
  });

export function applyEffect(
  c: Combat,
  effect: EffectData | null | undefined,
  o: Side,
  x: Side,
  fromMagic?: boolean,
  returning?: boolean,
): void {
  if (!effect) return;
  const e = canonEffect(effect) as EffectData;
  if (e.briques) {
    e.briques.forEach((b) => applyEffect(c, b, o, x, fromMagic, returning));
    return;
  }
  // An unknown type (an admin "perso_" effect, a typo) has no rule: it plays nothing.
  const rule =
    e.type !== undefined && Object.hasOwn(rules(), e.type)
      ? rules()[e.type as EffectType]
      : undefined;
  // SWALLOWING: the swallowed card receives nothing, whatever targeted it hits the swallower.
  if (x.status.swallowedBy) {
    x = x.status.swallowedBy;
    if (x === o && rule?.withoutTarget) return;
  }
  if (returning && rule?.once) return;
  const T = e.cible === 'adversaire' ? x : o;
  const delta = (s: Side, stat: 'atq' | 'maxHp', d: number) => {
    if (fromMagic) o.magicDeltas.push({ side: s, stat, delta: d });
  };
  const onUndo = (f: () => void) => {
    if (fromMagic) o.magicDeltas.push({ undo: f });
  };
  const statusEnds = (M: Side, status: StatusKind) =>
    emit(c, { type: 'statusEnded', side: id(c, M), status });
  if (fromMagic && rule?.undoesStatuses) {
    const M = rule.undoesStatuses === 'opponent' ? x : (e.ciblem || e.cible) === 'soi' ? o : x;
    undoStatusesLater(M, onUndo, statusEnds);
  }
  const statusTarget = () => ((e.ciblem || e.cible) === 'soi' ? o : x);
  const ctx: EffectContext = {
    c,
    e,
    o,
    x,
    fromMagic,
    returning,
    target: T,
    statusTarget,
    delta,
    onUndo,
    statusEnds,
  };
  if (rule) rule.run(ctx);
  else emit(c, { type: 'unknownEffect', effectType: e.type });
}

// Snapshots card M's statuses now; if the magic goes, removes what it added since (statuses still
// running).
function undoStatusesLater(
  M: Side,
  onUndo: (f: () => void) => void,
  statusEnds: (M: Side, status: StatusKind) => void,
): void {
  const before = {
    curse: M.status.curses[0] && { ...M.status.curses[0] },
    bleed: M.status.bleeds[0] && { ...M.status.bleeds[0] },
    dots: M.status.dots.map((z) => ({ ...z })),
    frosts: M.status.frosts.length,
    fractures: M.status.fractures.length,
    stunTurns: M.status.stunTurns,
    nextAttackCancelled: M.status.nextAttackCancelled,
    nextAttackBlocked: M.status.nextAttackBlocked,
    blockRiposte: M.status.blockRiposte,
  };
  onUndo(() => {
    const curseNow = M.status.curses[0];
    if (curseNow) {
      if (!before.curse) {
        M.status.curses = [];
        statusEnds(M, 'curse');
      } else curseNow.amount = before.curse.amount;
    }
    const bleedNow = M.status.bleeds[0];
    if (bleedNow) {
      if (!before.bleed) {
        M.status.bleeds = [];
        statusEnds(M, 'bleed');
      } else {
        bleedNow.pct = before.bleed.pct;
        bleedNow.healReduction = before.bleed.healReduction;
      }
    }
    M.status.dots
      .filter((z) => !before.dots.some((y) => y.kind === z.kind))
      .forEach((z) => statusEnds(M, z.kind === 'poison' ? 'poison' : 'burn'));
    M.status.dots = M.status.dots.filter((z) => before.dots.some((y) => y.kind === z.kind));
    M.status.dots.forEach((z) => {
      const y = before.dots.find((q) => q.kind === z.kind);
      if (y) z.amount = y.amount;
    });
    if (M.status.frosts.length > before.frosts && !before.frosts) statusEnds(M, 'frost');
    if (M.status.fractures.length > before.fractures && !before.fractures)
      statusEnds(M, 'fracture');
    if (M.status.stunTurns > before.stunTurns && !before.stunTurns) statusEnds(M, 'stun');
    M.status.frosts = M.status.frosts.slice(0, before.frosts);
    M.status.fractures = M.status.fractures.slice(0, before.fractures);
    M.status.stunTurns = Math.min(M.status.stunTurns, before.stunTurns);
    M.status.nextAttackCancelled = Math.min(
      M.status.nextAttackCancelled,
      before.nextAttackCancelled,
    );
    M.status.nextAttackBlocked = Math.min(M.status.nextAttackBlocked, before.nextAttackBlocked);
    M.status.blockRiposte = before.blockRiposte;
  });
}
