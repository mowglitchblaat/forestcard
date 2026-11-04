// Status sharing (November 2026): three effects, for magics, ultimates and traps.
//   - echange_statuts: the card and its opponent swap their negative statuses.
//   - partage_statuts: the opponent receives a copy of the card's negative statuses; the card keeps
//     its own.
//   - copie_statuts: the card receives a copy of the opponent's positive statuses; the opponent
//     keeps them.
//
// Negative statuses moved: poison, burn, curse, bleed, frost, fatigue, fracture, rooting,
// contamination (the ones a purification removes, except the knell, the lightning and a cancelled
// attack, which belong to the card that laid them). Stun stays where it is. Positive statuses
// copied: reflect, damage reduction (guard), double damage, rage, dodge bonus, mist, trap immunity.
//
// A status placed this way is not laid by an attack or an effect: no mist takes it, no fire melts
// the ice, and the contamination adds no turn. It merges with the receiver's own status of the
// same kind, as a new one would (levels add up, the longer duration stays). A curse moved gives
// its ATQ back to the card it leaves and takes it from the receiver at the start of the receiver's
// turn (like a new curse); a fatigue gives its ATQ back and takes its % of the receiver's ATQ at
// once.

import { emit, id, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Side } from '../combat/state.ts';
import type { CopiedStatus, DispelledStatus } from '../events.ts';
import { addLevels } from '../model/levels.ts';
import { atqLostToCurses, type Curse } from './curse.ts';
import type { DamageOverTime } from './dot.ts';
import type { Bleed } from './bleed.ts';
import type { Contamination } from './contamination.ts';
import { type Fatigue, fatiguePct } from './fatigue.ts';
import type { Fracture } from './fracture.ts';
import type { Frost } from './frost.ts';
import type { Rooting } from './rooting.ts';

// The negative statuses of a card, as data to place on a card.
type Negatives = {
  dots: DamageOverTime[];
  curses: Curse[];
  bleeds: Bleed[];
  frosts: Frost[];
  fatigues: Fatigue[];
  fractures: Fracture[];
  rootings: Rooting[];
  contamination: Contamination | null;
};

// A copy of s's negative statuses (curses not yet taken, fatigues without their loss).
function negativesOf(s: Side): Negatives {
  const z = s.status;
  return {
    dots: z.dots.map((d) => ({ ...d })),
    curses: z.curses.map((q) => ({ lost: 0, turns: q.turns, pending: true })),
    bleeds: z.bleeds.map((b) => ({ ...b })),
    frosts: z.frosts.map((f) => ({ ...f })),
    fatigues: z.fatigues.map((f) => ({ ...f, lost: 0 })),
    fractures: z.fractures.map((f) => ({ ...f })),
    rootings: z.rootings.map((r) => ({ ...r })),
    contamination: z.contamination ? { ...z.contamination } : null,
  };
}

// The kinds of a set of negative statuses, for the event.
function kindsOf(n: Negatives): DispelledStatus[] {
  return [
    ...new Set<DispelledStatus>([
      ...n.dots.map((d): DispelledStatus => (d.kind === 'poison' ? 'poison' : 'brulure')),
      ...(n.curses.length ? (['malediction'] as const) : []),
      ...(n.bleeds.length ? (['saignement'] as const) : []),
      ...(n.frosts.length ? (['gel'] as const) : []),
      ...(n.fatigues.length ? (['fatigue'] as const) : []),
      ...(n.fractures.length ? (['fracture'] as const) : []),
      ...(n.rootings.length ? (['enracinement'] as const) : []),
      ...(n.contamination ? (['contamination'] as const) : []),
    ]),
  ];
}

// s loses its negative statuses; the ATQ its curses and fatigue took comes back.
function clearNegatives(c: Combat, s: Side): void {
  const z = s.status;
  const curseBack = atqLostToCurses(s);
  const fatigueBack = z.fatigues.reduce((q, f) => q + (f.lost || 0), 0);
  z.dots = [];
  z.curses = [];
  z.bleeds = [];
  z.frosts = [];
  z.fatigues = [];
  z.fractures = [];
  z.rootings = [];
  z.contamination = null;
  if (curseBack > 0) {
    s.atq += curseBack;
    emit(c, {
      type: 'statChanged',
      side: id(c, s),
      stat: 'atq',
      delta: curseBack,
      cause: 'curseLifted',
    });
  }
  if (fatigueBack > 0) {
    s.atq += fatigueBack;
    emit(c, {
      type: 'statChanged',
      side: id(c, s),
      stat: 'atq',
      delta: fatigueBack,
      cause: 'fatigueLifted',
    });
  }
}

// One status of a kind per card (dots: per poison or burn; rootings: per variant): merged as a new
// one would be.
function merge<T extends { level: number; turns: number }>(
  list: T[],
  add: T,
  same: (x: T) => boolean,
) {
  const now = list.find(same);
  if (!now) list.push({ ...add });
  else {
    now.level = addLevels(now.level, add.level);
    now.turns = Math.max(now.turns, add.turns);
  }
}

function placeNegatives(c: Combat, s: Side, n: Negatives): void {
  const z = s.status;
  n.dots.forEach((d) => merge(z.dots, d, (x) => x.kind === d.kind));
  n.bleeds.forEach((b) => merge(z.bleeds, b, () => true));
  n.fractures.forEach((f) => merge(z.fractures, f, () => true));
  n.curses.forEach((q) => z.curses.push({ ...q }));
  n.frosts.forEach((f) => {
    const now = z.frosts[0];
    if (!now) z.frosts = [{ ...f }];
    else {
      now.level = Math.min(3, Math.max(now.level, f.level));
      now.cancelChance = Math.max(now.cancelChance, f.cancelChance);
      now.shatter = Math.max(now.shatter, f.shatter);
      now.turns = Math.max(now.turns, f.turns);
    }
  });
  n.rootings.forEach((r) => {
    const now = z.rootings.find((x) => x.variant === r.variant);
    if (!now) z.rootings.push({ ...r });
    else {
      now.turns = Math.max(now.turns, r.turns);
      now.val = Math.max(now.val, r.val);
      now.level = Math.max(now.level, r.level);
      now.poisonTurns = Math.max(now.poisonTurns, r.poisonTurns);
    }
  });
  if (n.contamination)
    z.contamination = {
      turns: Math.max(z.contamination?.turns ?? 0, n.contamination.turns),
    };
  n.fatigues.forEach((f) => {
    let now = z.fatigues[0];
    if (!now) {
      now = { level: f.level, lost: 0, turns: f.turns };
      z.fatigues.push(now);
    } else {
      now.level = addLevels(now.level, f.level);
      now.turns = Math.max(now.turns, f.turns);
    }
    // as a new fatigue: a % of the ATQ the card would have without it
    const wanted = round(((s.atq + now.lost) * fatiguePct(c, now.level)) / 100);
    const extra = Math.min(Math.max(0, wanted - now.lost), Math.max(0, s.atq));
    now.lost += extra;
    s.atq -= extra;
    if (extra > 0)
      emit(c, {
        type: 'statChanged',
        side: id(c, s),
        stat: 'atq',
        delta: -extra,
        cause: 'fatigue',
      });
  });
}

export function swapStatusesEffect({ c, o, x }: EffectContext): void {
  const mine = negativesOf(o);
  const theirs = negativesOf(x);
  clearNegatives(c, o);
  clearNegatives(c, x);
  placeNegatives(c, x, mine);
  placeNegatives(c, o, theirs);
  emit(c, {
    type: 'statusesShared',
    side: id(c, o),
    with: id(c, x),
    mode: 'swap',
    given: kindsOf(mine),
    taken: kindsOf(theirs),
    copied: [],
  });
}

export function shareStatusesEffect({ c, o, x }: EffectContext): void {
  const mine = negativesOf(o);
  placeNegatives(c, x, mine);
  emit(c, {
    type: 'statusesShared',
    side: id(c, o),
    with: id(c, x),
    mode: 'share',
    given: kindsOf(mine),
    taken: [],
    copied: [],
  });
}

// The opponent's positive statuses, copied on the card.
export function copyStatusesEffect({ c, o, x }: EffectContext): void {
  const z = o.status;
  const y = x.status;
  const copied: CopiedStatus[] = [];
  if (y.reflects.length) {
    z.reflects.push(...y.reflects.map((r) => ({ ...r })));
    copied.push('renvoi');
  }
  if (y.guards.length) {
    z.guards.push(...y.guards.map((g) => ({ ...g })));
    copied.push('reduction');
  }
  if (y.doublings.length) {
    z.doublings.push(...y.doublings.map((d) => ({ ...d })));
    copied.push('double');
  }
  if (y.rages.length) {
    z.rages.push(...y.rages.map((r) => ({ ...r })));
    copied.push('rage');
  }
  if (y.dodgeBonus > 0) {
    z.dodgeBonus = Math.max(z.dodgeBonus, y.dodgeBonus);
    copied.push('esquive');
  }
  if (y.mist) {
    z.mist =
      z.mist && z.mist.level >= y.mist.level
        ? { level: z.mist.level, turns: Math.max(z.mist.turns, y.mist.turns) }
        : { ...y.mist };
    copied.push('brume');
  }
  if (y.trapImmunityTurns > 0) {
    z.trapImmunityTurns = Math.max(z.trapImmunityTurns, y.trapImmunityTurns);
    copied.push('insensible');
  }
  emit(c, {
    type: 'statusesShared',
    side: id(c, o),
    with: id(c, x),
    mode: 'copy',
    given: [],
    taken: [],
    copied,
  });
}

// Its effects (the registry of effects.ts).
export const effects = {
  echange_statuts: { run: swapStatusesEffect, once: true, withoutTarget: true },
  partage_statuts: { run: shareStatusesEffect, once: true, withoutTarget: true },
  copie_statuts: { run: copyStatusesEffect, once: true, withoutTarget: true },
} satisfies EffectRules;
