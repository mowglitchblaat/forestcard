// Purification: removes the negative statuses (except stun and weakness) and gives back the attack
// lost to curses and fatigue. Stun is NEVER removed: it always skips the next attack.
//
// Comes from: an effect (purification: now, then "fois - 1" more, one every "every" turns), a
// passive (every X turns, X times at most, only when there is something to remove), a
// transcendence (its hits purify, its levels purify), a revive (silently), an avoid-death.

import { emit, id, raw, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side, Status } from '../combat/state.ts';
import type { DispelledStatus } from '../events.ts';
import { atqLostToCurses } from './curse.ts';
import { knellPurified } from './knell.ts';
import { liftLightning } from './lightning.ts';

export type ScheduledPurification = { target: Side; every: number; left: number; counter: number };

// Its part of a card's status (combat/state.ts).
export type PurificationState = {
  purificationUses: Record<number, number>; // the passive: uses per passive index
  scheduledPurifications: ScheduledPurification[];
};
export const purificationState = (): PurificationState => ({
  purificationUses: [],
  scheduledPurifications: [],
});

// Any negative status a purification would remove.
export const hasPurifiableStatus = (z: Status) =>
  z.dots.length ||
  z.curses.length ||
  z.bleeds.length ||
  z.frosts.length ||
  !!z.knell ||
  z.fractures.length ||
  z.fatigues.length ||
  z.rootings.length ||
  !!z.contamination ||
  !!z.lightning ||
  z.nextAttackCancelled > 0 ||
  z.nextAttackBlocked > 0;

// silent: a revive purifies without announcing it.
export function purify(c: Combat, t: Side, silent?: boolean): void {
  const z = t.status;
  const removed: DispelledStatus[] = [];
  z.dots.forEach((d) => removed.push(d.kind === 'poison' ? 'poison' : 'brulure'));
  z.curses.forEach(() => removed.push('malediction'));
  z.bleeds.forEach(() => removed.push('saignement'));
  z.frosts.forEach(() => removed.push('gel'));
  z.fatigues.forEach(() => removed.push('fatigue'));
  z.fractures.forEach(() => removed.push('fracture'));
  z.rootings.forEach(() => removed.push('enracinement'));
  if (z.contamination) removed.push('contamination');
  if (liftLightning(t)) removed.push('foudre');
  if (knellPurified(c, t)) removed.push('glas');
  const attackWasCancelled = z.nextAttackCancelled > 0 || z.nextAttackBlocked > 0;
  const curseBack = atqLostToCurses(t);
  const fatigueBack = z.fatigues.reduce((q, f) => q + (f.lost || 0), 0);
  if (attackWasCancelled) removed.push('annule');
  z.dots = [];
  z.curses = [];
  z.bleeds = [];
  z.frosts = [];
  z.fractures = [];
  z.fatigues = [];
  z.rootings = [];
  z.contamination = null;
  z.nextAttackCancelled = 0;
  z.nextAttackBlocked = 0;
  if (!silent)
    emit(c, {
      type: 'purified',
      side: id(c, t),
      removedSomething: !!(removed.length || curseBack),
      stunned: z.stunTurns > 0,
    });
  if (curseBack > 0) {
    t.atq += curseBack;
    emit(c, {
      type: 'statChanged',
      side: id(c, t),
      stat: 'atq',
      delta: curseBack,
      cause: 'curseLifted',
    });
  }
  if (fatigueBack > 0) {
    t.atq += fatigueBack;
    emit(c, {
      type: 'statChanged',
      side: id(c, t),
      stat: 'atq',
      delta: fatigueBack,
      cause: 'fatigueLifted',
    });
  }
  if (!silent)
    removed.forEach((status) => emit(c, { type: 'statusDispelled', side: id(c, t), status }));
}

// End of its turn: the purifications an effect scheduled.
export function scheduledPurifications(c: Combat, s: Side): Flow {
  s.status.scheduledPurifications = s.status.scheduledPurifications.filter((scheduled) => {
    if (scheduled.target.hp <= 0) return false;
    if (++scheduled.counter < scheduled.every) return true;
    scheduled.counter = 0;
    purify(c, scheduled.target);
    return --scheduled.left > 0;
  });
  if (s.hp <= 0) return 'stop';
  return undefined;
}

// End of its turn: the passive, every X turns (empty = each turn), X times at most (empty =
// unlimited); fires only when there is a negative status to remove.
export function purificationPassives(c: Combat, s: Side): Flow {
  s.passives.forEach((p, pi) => {
    if (
      p.type === 'purification' &&
      (!p.every || c.round % raw(p.every) === 0) &&
      (!p.fois || (s.status.purificationUses[pi] || 0) < p.fois) &&
      hasPurifiableStatus(s.status)
    ) {
      s.status.purificationUses[pi] = (s.status.purificationUses[pi] || 0) + 1;
      purify(c, s);
    }
  });
  if (s.hp <= 0) return 'stop';
  return undefined;
}

// First purification right now, then "fois - 1" more, one every "every" turns.
export function purificationEffect({ c, e, o, x, fromMagic }: EffectContext): void {
  const target = e.cible === 'adversaire' ? x : o;
  purify(c, target);
  const left = Math.max(0, (e.fois || 1) - 1);
  if (left > 0) {
    const scheduled: ScheduledPurification = {
      target,
      every: Math.max(1, e.every || 1),
      left,
      counter: 0,
    };
    o.status.scheduledPurifications.push(scheduled);
    if (fromMagic)
      o.magicDeltas.push({
        undo: () => {
          o.status.scheduledPurifications = o.status.scheduledPurifications.filter(
            (z) => z !== scheduled,
          );
        },
      });
  }
}

// Its effects (the registry of effects.ts).
export const effects = {
  purification: { run: purificationEffect, once: true },
} satisfies EffectRules;
