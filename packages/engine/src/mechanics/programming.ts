// Programming passive (mechanical collection): on each of the card's turns, `chance` % to launch a
// programming, at the start of the turn, before the attack.
//   - The first `nbpassif` programmings are passive, then one in two (a 50 % draw).
//   - Passive: the card acquires at random a passive or an ultimate from its programmable lists
//     (`passifs`, `ultimes`); it sleeps (no effect) until the next activation. Without a list, it
//     draws among all the game's passives (randomPassivePool) or ultimates (randomEffectPool).
//   - Active: the programmed passives wake up (for good), and ALL the programmed ultimates (older
//     ones included) are launched.
// An avoid-death or a revive already used does not come back.

import type { EffectData } from '../model/card.ts';
import { emit, id, opponent, over, roll, type Combat } from '../combat/combat.ts';
import { applyEffect } from '../combat/effects.ts';
import { normalizePassives, type Side } from '../combat/state.ts';
import type { Flow } from '../combat/flow.ts';
import { scan } from '../combat/traps.ts';
import type { ProgrammedDraw } from '../events.ts';
import { randomEffectPool, randomPassivePool } from './random.ts';

// Programming passive (legacy: pgm): how many programmings were launched, the passives and ultimates
// programmed but asleep, the ultimates already awake (launched again at each activation), and what
// was drawn for the effects of a programming without a list (legacy: their lib, a label).
export type Programming = {
  count: number;
  asleepPassives: EffectData[];
  asleepUltimates: EffectData[];
  awakeUltimates: EffectData[];
  drawn: Map<EffectData, ProgrammedDraw>;
};

// Its part of a card's status (combat/state.ts).
export type ProgrammingState = {
  programming: Programming | null;
};
export const programmingState = (): ProgrammingState => ({ programming: null });

// A single effect (old format) or several { briques: [...] }; ultimates are not normalized.
const bricks = (x: EffectData | null | undefined): EffectData[] =>
  !x ? [] : x.briques ? (x.briques.filter((b) => b && b.type) as EffectData[]) : x.type ? [x] : [];

export function program(c: Combat, s: Side, p: EffectData): void {
  const P = (s.status.programming ??= {
    count: 0,
    asleepPassives: [],
    asleepUltimates: [],
    awakeUltimates: [],
    drawn: new Map<EffectData, ProgrammedDraw>(),
  });
  if (!roll(c, p.chance == null || p.chance === '' ? 100 : +p.chance || 0)) return;
  const firstPassive = Math.max(0, parseInt(String(p.nbpassif), 10) || 0);
  const passive = P.count < firstPassive || roll(c, 50);
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
    (it.what === 'p' ? P.asleepPassives : P.asleepUltimates).push(it.q);
    emit(c, {
      type: 'programmed',
      side: id(c, s),
      what: it.what,
      label: it.q.lib,
      effectType: it.q.type,
      drawn: P.drawn.get(it.q),
    });
    return;
  }
  emit(c, { type: 'programmingActivated', side: id(c, s) });
  if (P.asleepPassives.length) {
    const count = P.asleepPassives.length;
    P.asleepPassives.forEach((q) => s.passives.push(q));
    P.asleepPassives = [];
    emit(c, { type: 'programmedPassivesAwake', side: id(c, s), count });
  }
  P.awakeUltimates.push(...P.asleepUltimates);
  P.asleepUltimates = [];
  for (const u of P.awakeUltimates) {
    if (s.hp <= 0 || over(c)) break;
    emit(c, {
      type: 'programmedUltimate',
      side: id(c, s),
      label: u.lib,
      effectType: u.type,
      drawn: P.drawn.get(u),
    });
    const previousSource = c.source;
    c.source = 'ultime';
    applyEffect(c, u, s, opponent(c, s));
    c.source = previousSource;
    scan(c, { kind: 'ultimate', by: id(c, s) });
  }
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
