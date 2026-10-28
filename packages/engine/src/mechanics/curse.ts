// Curse (rework of October 2026): no level. Each curse takes a fixed amount of ATQ (the level table's
// `malediction`, 3 by default) for its turns, then gives it back. A curse does not grow on its own;
// another curse laid on the card adds its own loss, with its own duration.
//
// It acts at the start of the cursed card's turn, BEFORE its attack: the ATQ drops then, and comes
// back at the start of its turn "duration" turns later (so it weighs on that many attacks). A
// purification gives the lost ATQ back and lifts every curse.
//
// Laid by: an effect (malediction), an attack (passive or attack effect malediction).
//
// Curse skills (October 2026):
//   - Cursed embrace (étreinte maudite, passive, or effect: magic while it acts, trap until the end of
//     the combat): each time the cursed opponent attacks, each of its curses takes `etreinte` more
//     ATQ (level table, 1 by default), given back with the curse.
//   - Will break (brisure de volonté, effect): raw damage to the opponent, `brisure` (level table, 2 by
//     default) × all the ATQ it lost to curses since the start of the combat.

import type { Attack } from '../combat/attack.ts';
import { emit, id, over, roll, round, type Combat } from '../combat/combat.ts';
import { damage } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { contaminationExtra } from './contamination.ts';
import { mistTakes } from './mist.ts';

// pending: laid, its loss comes at the start of the card's next turn; lost: ATQ it took.
export type Curse = { lost: number; turns: number; pending: boolean };

// Its part of a card's status (combat/state.ts); curseLostTotal: all the ATQ curses took from it;
// embraceGiven: effects giving it the cursed embrace.
export type CurseState = {
  curses: Curse[];
  curseLostTotal: number;
  embraceGiven: number;
};
export const curseState = (): CurseState => ({ curses: [], curseLostTotal: 0, embraceGiven: 0 });

// ATQ the curses hold right now (given back on purification).
export const atqLostToCurses = (s: Side): number => s.status.curses.reduce((q, z) => q + z.lost, 0);

export function curse(c: Combat, dst: Side, turns: number): void {
  if (mistTakes(c, dst, 'curse', (t) => curse(c, t, turns))) return;
  const stacked = dst.status.curses.length > 0;
  turns = Math.max(1, turns) + contaminationExtra(dst);
  dst.status.curses.push({ lost: 0, turns, pending: true });
  emit(c, {
    type: 'curseApplied',
    side: id(c, dst),
    stacked,
    amount: c.levels.malediction,
    count: dst.status.curses.length,
    turns,
  });
}

// One curse lets go of the ATQ it took.
export function liftCurse(c: Combat, s: Side, z: Curse, cause: 'curseFading' | 'curseRemoved') {
  s.status.curses = s.status.curses.filter((y) => y !== z);
  if (z.lost > 0) {
    s.atq += z.lost;
    emit(c, { type: 'statChanged', side: id(c, s), stat: 'atq', delta: z.lost, cause });
  }
}

// Start of its turn: the curses that ran their turns give the ATQ back.
export function curseFading(c: Combat, s: Side): Flow {
  const ending = s.status.curses.filter((z) => !z.pending && --z.turns <= 0);
  for (const z of ending) liftCurse(c, s, z, 'curseFading');
  if (ending.length && !s.status.curses.length)
    emit(c, { type: 'statusEnded', side: id(c, s), status: 'curse' });
  return undefined;
}

// Start of its turn, before the attack: the new curses take their ATQ.
export function curseTicks(c: Combat, s: Side): Flow {
  for (const z of s.status.curses) {
    if (s.hp <= 0 || over(c)) return 'stop';
    if (!z.pending) continue;
    z.pending = false;
    const loss = Math.min(c.levels.malediction, Math.max(0, s.atq));
    z.lost = loss;
    s.atq -= loss;
    s.status.curseLostTotal += loss;
    if (loss > 0)
      emit(c, {
        type: 'statChanged',
        side: id(c, s),
        stat: 'atq',
        delta: -loss,
        cause: 'curseTick',
      });
  }
  if (s.hp <= 0) return 'stop';
  return undefined;
}

const turnsOf = (e: EffectData): number => +(e.tours as number) || 1;

export function curseEffect({ c, e, statusTarget }: EffectContext): void {
  curse(c, statusTarget(), turnsOf(e));
}

export function curseOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) curse(c, d, turnsOf(q));
}

// Once the attack is announced: the opponent's cursed embrace tightens each curse of the attacker.
export function cursedEmbrace(c: Combat, { a, d, ia }: Attack): Flow {
  if (d.status.embraceGiven <= 0 && !d.passives.some((p) => p.type === 'etreinte_maudite'))
    return undefined;
  let taken = 0;
  for (const z of a.status.curses) {
    if (z.pending) continue;
    const more = Math.min(Math.max(0, c.levels.etreinte), Math.max(0, a.atq));
    if (more <= 0) continue;
    z.lost += more;
    a.atq -= more;
    a.status.curseLostTotal += more;
    taken += more;
  }
  if (taken > 0)
    emit(c, { type: 'statChanged', side: ia, stat: 'atq', delta: -taken, cause: 'curseEmbrace' });
  return undefined;
}

export function embraceEffect({ c, o, onUndo }: EffectContext): void {
  o.status.embraceGiven++;
  emit(c, { type: 'embraceGiven', side: id(c, o) });
  onUndo(() => {
    o.status.embraceGiven = Math.max(0, o.status.embraceGiven - 1);
  });
}

export function willBreakEffect({ c, o, x }: EffectContext): void {
  if (x.hp <= 0) return;
  const lost = x.status.curseLostTotal;
  const raw = Math.max(0, round(lost * c.levels.brisure));
  emit(c, { type: 'willBroken', side: id(c, o), target: id(c, x), lost, amount: raw });
  if (raw <= 0) return;
  const n = damage(c, o, x, raw);
  emit(c, { type: 'damaged', side: id(c, x), amount: n, cause: 'willBreak' });
}

// Its effects (the registry of effects.ts).
export const effects = {
  malediction: { run: curseEffect, undoesStatuses: 'target' },
  brisure_volonte: { run: willBreakEffect, withoutTarget: true },
  etreinte_maudite: { run: embraceEffect },
} satisfies EffectRules;
