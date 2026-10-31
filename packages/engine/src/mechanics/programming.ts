// Programming passive (mechanical collection): on each of the card's turns, `chance` % to launch a
// programming, at the start of the turn, before the attack.
//   - The first `nbpassif` programmings are passive, then one in two (a 50 % draw). Never active
//     with nothing asleep: after an activation, at least one passive programming comes first.
//   - Passive: the card acquires at random a passive or an ultimate from its programmable lists
//     (`passifs`, `ultimes`); it sleeps (no effect) until the next activation. Without a list, it
//     draws among all the game's passives (randomPassivePool) or ultimates (randomEffectPool).
//   - Active: what sleeps is installed on the card for good. The passives wake up (each with its own
//     rules); each ultimate becomes one more ultimate of the card, with a number of uses, a delay
//     between two uses and a trigger, all drawn at random (PROGRAMMED_TRIGGERS; `pumax` and `pdmax`
//     cap the uses and the delay). It then fires like the card's own ultimate (mechanics/ultimates.ts).
// An avoid-death or a revive already used does not come back.
//
// Effect programmation (a magic's or a trap's): the card playing it gains the programming passive
// for the rest of the combat, with the effect's settings (`chance`, 50 by default; `nbpassif`, 2 by
// default, as the admin form fills the passive). A magic that goes (cancelled, destroyed, stolen)
// takes the passive back; what was already programmed stays.

import type { EffectData } from '../model/card.ts';
import { emit, id, opponent, over, roll, round, type Combat } from '../combat/combat.ts';
import { normalizePassives, type Side } from '../combat/state.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { ProgrammedDraw, ProgrammedTrigger } from '../events.ts';
import { randomEffectPool, randomPassivePool } from './random.ts';

// A programmed effect, asleep until the next activation: `n` is its rank among all that the card
// programmed (1, 2, 3…), which the overlay uses to find its icon.
export type Programmed = { q: EffectData; n: number };

// Programming passive (legacy: pgm): how many programmings were launched, how many effects were
// programmed, the passives and ultimates programmed but asleep, and what was drawn for the effects
// of a programming without a list (legacy: their lib, a label).
export type Programming = {
  count: number;
  programmedCount: number;
  asleepPassives: Programmed[];
  asleepUltimates: Programmed[];
  drawn: Map<EffectData, ProgrammedDraw>;
};

// Its part of a card's status (combat/state.ts).
export type ProgrammingState = {
  programming: Programming | null;
};
export const programmingState = (): ProgrammingState => ({ programming: null });

// A programmed ultimate once installed, on its slot (combat/state.ts): its rank and what the journal
// names it from.
export type ProgrammedSlot = {
  n: number;
  label: unknown;
  effectType: unknown;
  drawn: ProgrammedDraw | undefined;
};

// A single effect (old format) or several { briques: [...] }; ultimates are not normalized.
const bricks = (x: EffectData | null | undefined): EffectData[] =>
  !x ? [] : x.briques ? (x.briques.filter((b) => b && b.type) as EffectData[]) : x.type ? [x] : [];

export function program(c: Combat, s: Side, p: EffectData): void {
  const P = (s.status.programming ??= {
    count: 0,
    programmedCount: 0,
    asleepPassives: [],
    asleepUltimates: [],
    drawn: new Map<EffectData, ProgrammedDraw>(),
  });
  if (!roll(c, p.chance == null || p.chance === '' ? 100 : +p.chance || 0)) return;
  const firstPassive = Math.max(0, parseInt(String(p.nbpassif), 10) || 0);
  const asleep = P.asleepPassives.length + P.asleepUltimates.length;
  const passive = P.count < firstPassive || !asleep || roll(c, 50);
  P.count++;
  if (passive) {
    const pool = [
      ...normalizePassives(p.passifs as EffectData | null | undefined).map((q) => ({
        what: 'p' as const,
        q,
      })),
      ...bricks(p.ultimes as EffectData | null | undefined).map((q) => ({ what: 'u' as const, q })),
    ];
    const it = pool.length
      ? (pool[Math.floor(c.random() * pool.length)] as (typeof pool)[number])
      : drawProgrammed(c, s, P);
    const n = ++P.programmedCount;
    (it.what === 'p' ? P.asleepPassives : P.asleepUltimates).push({ q: it.q, n });
    emit(c, {
      type: 'programmed',
      side: id(c, s),
      what: it.what,
      n,
      label: it.q.lib,
      effectType: it.q.type,
      drawn: P.drawn.get(it.q),
    });
    return;
  }
  emit(c, { type: 'programmingActivated', side: id(c, s) });
  if (P.asleepPassives.length) {
    const count = P.asleepPassives.length;
    P.asleepPassives.forEach(({ q }) => s.passives.push(q));
    P.asleepPassives = [];
    emit(c, { type: 'programmedPassivesAwake', side: id(c, s), count });
  }
  const ultimates = P.asleepUltimates;
  P.asleepUltimates = [];
  for (const { q, n } of ultimates) install(c, s, p, P, q, n);
}

// The triggers a programmed ultimate can draw: those of the admin's list (udecl) that happen in
// most combats, plus "after X turns" and "when a card activates". x: its value, drawn too.
const PROGRAMMED_TRIGGERS: { key: ProgrammedTrigger; x?: (c: Combat, s: Side) => number }[] = [
  { key: 'apres_tours', x: (c) => 1 + Math.floor(c.random() * 3) },
  { key: 'sur_carte' },
  { key: 'pv_sous', x: (c) => 30 + 10 * Math.floor(c.random() * 4) },
  { key: 'adv_pv_sous', x: (c) => 30 + 10 * Math.floor(c.random() * 4) },
  { key: 'coups_recus', x: (c) => 2 + Math.floor(c.random() * 2) },
  { key: 'attaques', x: (c) => 2 + Math.floor(c.random() * 2) },
  {
    key: 'coup_fort',
    x: (c, s) => Math.max(1, round(Math.max(0, opponent(c, s).atq) * (0.8 + c.random() * 0.4))),
  },
  {
    key: 'inflige_coup_fort',
    x: (c, s) => Math.max(1, round(Math.max(0, s.atq) * (0.8 + c.random() * 0.4))),
  },
  { key: 'statut' },
  { key: 'adv_statut' },
];

// Draws a whole number between 1 and max (max: the admin's setting, d when empty).
const upTo = (c: Combat, v: unknown, d: number): number => {
  const max = Math.max(1, parseInt(String(v), 10) || d);
  return 1 + Math.floor(c.random() * max);
};

// An ultimate programmed and now installed: one more ultimate slot of the card, with its uses, its
// delay and its trigger, drawn in this order.
function install(c: Combat, s: Side, p: EffectData, P: Programming, q: EffectData, n: number) {
  const uses = upTo(c, p.pumax, 3);
  const delay = upTo(c, p.pdmax, 2);
  const k = Math.floor(c.random() * PROGRAMMED_TRIGGERS.length);
  const t = PROGRAMMED_TRIGGERS[k] as (typeof PROGRAMMED_TRIGGERS)[number];
  const x = t.x ? t.x(c, s) : 0;
  const effect: EffectData = { ...q, utilisations: uses, delai_tours: delay };
  delete effect.apres_tours;
  delete effect.sur_carte;
  delete effect.udecl;
  delete effect.udx;
  if (t.key === 'apres_tours') effect.apres_tours = c.round + x;
  else if (t.key === 'sur_carte') effect.sur_carte = true;
  else {
    effect.udecl = t.key;
    if (t.x) effect.udx = x;
    // an event trigger needs the event hook (mechanics/triggers.ts), off when no deck uses one
    c.triggers.any = true;
  }
  const drawn = P.drawn.get(q);
  s.ultimates.push({
    effect,
    uses: 0,
    lastRound: -99,
    programmed: { n, label: q.lib, effectType: q.type, drawn },
  });
  emit(c, {
    type: 'programmedUltimateInstalled',
    side: id(c, s),
    n,
    label: q.lib,
    effectType: q.type,
    drawn,
    uses,
    delay,
    trigger: t.key,
    x,
  });
}

// Without a list: a 50 % draw between a passive and an ultimate, then one entry of that pool, then
// its values (legacy order: r() < .5, the entry, the maker).
function drawProgrammed(c: Combat, s: Side, P: Programming): { what: 'p' | 'u'; q: EffectData } {
  const x = opponent(c, s);
  if (c.random() < 0.5) {
    const pool = randomPassivePool(c, s, x);
    const [key, make] = pool[Math.floor(c.random() * pool.length)] as (typeof pool)[number];
    const q = make();
    P.drawn.set(q, { pool: 'passives', key });
    return { what: 'p', q };
  }
  const pool = randomEffectPool(c, s, x);
  const [key, make] = pool[Math.floor(c.random() * pool.length)] as (typeof pool)[number];
  const q = make();
  P.drawn.set(q, { pool: 'effects', key });
  return { what: 'u', q };
}

// Programming passive: at the start of its turn, before the attack.
export function programmingAtStart(c: Combat, s: Side): Flow {
  if (s.hp <= 0 || over(c)) return 'stop';
  s.passives
    .filter((p) => p.type === 'programmation')
    .forEach((p) => {
      if (s.hp > 0 && !over(c)) program(c, s, p);
    });
  return undefined;
}

// Effect programmation: gives the programming passive to the card playing it.
export function programmingEffect({ e, o, fromMagic }: EffectContext): void {
  const empty = (v: unknown) => v == null || v === '';
  const passive: EffectData = {
    ...e,
    type: 'programmation',
    chance: empty(e.chance) ? 50 : e.chance,
    nbpassif: empty(e.nbpassif) ? 2 : e.nbpassif,
  };
  o.passives.push(passive);
  if (fromMagic)
    o.magicDeltas.push({
      undo: () => {
        const i = o.passives.indexOf(passive);
        if (i >= 0) o.passives.splice(i, 1);
      },
    });
}

// Its effects (the registry of effects.ts).
export const effects = {
  programmation: { run: programmingEffect },
} satisfies EffectRules;
