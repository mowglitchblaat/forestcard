// Gag (Toon collection, November 2026): a negative status, one per card. While it lasts, the
// gagged card's own actions may turn against it, each with its own chance, drawn at the moment:
//   - hammer (marteau): when it attacks, it hits itself instead (`marteaupct` % of its ATQ, 30 by
//     default) and the attack does not happen;
//   - TNT (tnt): when its ultimate fires, a TNT goes off instead: the ultimate is spent and does
//     nothing, and the card takes `tntdeg` raw damage (15 by default);
//   - banana (banane): when it dodges a strike, it slips and takes `bananepct` % (75 by default) of
//     the attacker's ATQ anyway; when it blocks one, an anvil falls on it for the same share of the
//     blocked damage.
// Default chances: hammer 30 %, TNT 30 %, banana 25 %. It lasts `tours` turns of the gagged card
// (3 by default). Laid again, the longer duration and the stronger values stay. A purification
// removes it, a mist takes it, a contamination makes it last one turn more.
//
// Laid by: an effect (gag: ultimate, magic, trap), an attack (passive gag, or attack effect
// atk_gag given by a magic or a trap), with its chance.

import type { Attack } from '../combat/attack.ts';
import { damage } from '../combat/damage.ts';
import { emit, id, opponent, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData, Num } from '../model/card.ts';
import { contaminationExtra } from './contamination.ts';
import { mistTakes } from './mist.ts';

export type Gag = {
  turns: number;
  hammer: number; // chance, %
  hammerPct: number; // % of its ATQ
  tnt: number; // chance, %
  tntDamage: number;
  banana: number; // chance, %
  bananaPct: number; // % of the damage it avoided
};

// Its part of a card's status (combat/state.ts).
export type GagState = { gag: Gag | null };
export const gagState = (): GagState => ({ gag: null });

const value = (v: Num | undefined, fallback: number): number =>
  v == null || v === '' ? fallback : Math.max(0, +v || 0);

const gagOf = (e: EffectData): Gag => ({
  turns: Math.max(1, parseInt(String(e.tours), 10) || 3),
  hammer: value(e.marteau, 30),
  hammerPct: value(e.marteaupct, 30),
  tnt: value(e.tnt, 30),
  tntDamage: value(e.tntdeg, 15),
  banana: value(e.banane, 25),
  bananaPct: value(e.bananepct, 75),
});

export function placeGag(c: Combat, d: Side, e: EffectData): void {
  if (mistTakes(c, d, 'gag', (t) => placeGag(c, t, e))) return;
  const g = gagOf(e);
  g.turns += contaminationExtra(d);
  const now = d.status.gag;
  d.status.gag = now
    ? {
        turns: Math.max(now.turns, g.turns),
        hammer: Math.max(now.hammer, g.hammer),
        hammerPct: Math.max(now.hammerPct, g.hammerPct),
        tnt: Math.max(now.tnt, g.tnt),
        tntDamage: Math.max(now.tntDamage, g.tntDamage),
        banana: Math.max(now.banana, g.banana),
        bananaPct: Math.max(now.bananaPct, g.bananaPct),
      }
    : g;
  const z = d.status.gag;
  emit(c, {
    type: 'gagged',
    side: id(c, d),
    stacked: !!now,
    turns: z.turns,
    hammer: z.hammer,
    tnt: z.tnt,
    banana: z.banana,
  });
}

// Can it attack: the hammer comes down on the attacker instead.
export function gagHammer(c: Combat, { a, d, ia }: Attack): Flow {
  const g = a.status.gag;
  if (!g || !roll(c, g.hammer)) return undefined;
  emit(c, { type: 'gagSprung', side: ia, gag: 'marteau' });
  const n = damage(c, d, a, round((Math.max(0, a.atq) * g.hammerPct) / 100));
  emit(c, { type: 'damaged', side: ia, amount: n, cause: 'gag' });
  return 'stop';
}

// Its ultimate fires: true when a TNT goes off instead (the ultimate is spent, nothing else).
export function gagTnt(c: Combat, s: Side): boolean {
  const g = s.status.gag;
  if (!g || !roll(c, g.tnt)) return false;
  emit(c, { type: 'gagSprung', side: id(c, s), gag: 'tnt' });
  const n = damage(c, opponent(c, s), s, g.tntDamage);
  emit(c, { type: 'damaged', side: id(c, s), amount: n, cause: 'gag' });
  return true;
}

// It dodged a strike (banana) or blocked one (anvil): `avoided` is the damage it escaped. True
// when the gag played.
export function gagOnDefence(
  c: Combat,
  a: Side,
  d: Side,
  avoided: number,
  how: 'banane' | 'enclume',
): boolean {
  const g = d.status.gag;
  if (!g || d.hp <= 0 || !roll(c, g.banana)) return false;
  emit(c, { type: 'gagSprung', side: id(c, d), gag: how });
  const n = damage(c, a, d, round((Math.max(0, avoided) * g.bananaPct) / 100));
  emit(c, { type: 'damaged', side: id(c, d), amount: n, cause: 'gag' });
  return true;
}

// A dodged strike: the banana, on the attacker's ATQ.
export const gagOnDodge = (c: Combat, at: Attack): boolean =>
  gagOnDefence(c, at.a, at.d, at.a.atq, 'banane');

// A blocked strike: the anvil, on the damage the block took.
export const gagOnBlock = (c: Combat, at: Attack, blockedDamage: number): boolean =>
  gagOnDefence(c, at.a, at.d, blockedDamage, 'enclume');

export function gagEnd(c: Combat, s: Side): Flow {
  const g = s.status.gag;
  if (g && --g.turns <= 0) {
    s.status.gag = null;
    emit(c, { type: 'statusEnded', side: id(c, s), status: 'gag' });
  }
  return undefined;
}

export function gagEffect({ c, e, statusTarget }: EffectContext): void {
  placeGag(c, statusTarget(), e);
}

export function gagOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) placeGag(c, d, q);
}

// Its effects (the registry of effects.ts).
export const effects = {
  gag: { run: gagEffect },
} satisfies EffectRules;
