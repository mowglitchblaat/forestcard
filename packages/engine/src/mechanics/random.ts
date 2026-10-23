// Random effect: draws (with the combat seed) one effect among all the game's effects, with values
// scaled on the cards' stats, and plays it. Comes from an effect (aleatoire: `nbalea` draws) or a
// passive (aleatoire: every X rounds, with its chance).
//
// Adding an entry to POOL changes the odds of all the others, so the behaviour of every card with a
// random effect: a balance change, to decide as such.

import { emit, id, opponent, over, raw, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import { applyEffect } from '../combat/effects.ts';
import type { Side } from '../combat/state.ts';
import type { RandomEffectKey, RandomPassiveKey } from '../events.ts';
import type { EffectData } from '../model/card.ts';

export function randomEffectEffect({ c, e, o, x }: EffectContext): void {
  const k = Math.max(1, e.nbalea || e.fois || 1);
  for (let i = 0; i < k && !over(c); i++) randomEffect(c, o, x);
}

// "Every turn" passive: every X rounds, with its chance; its effect counts as a passive's.
export function randomEveryTurn(c: Combat, s: Side, p: EffectData): void {
  if (
    (!p.every || c.round % raw(p.every) === 0) &&
    roll(c, p.chance == null || p.chance === '' ? 100 : p.chance) &&
    !over(c)
  ) {
    const previousSource = c.source;
    c.source = 'passif';
    randomEffect(c, s, opponent(c, s));
    c.source = previousSource;
  }
}

// Draws a random integer in [a, b], and a value of a percent in [a, z] of b (at least 1).
const drawers = (c: Combat) => {
  const ri = (a: number, b: number) => a + Math.floor(c.random() * (b - a + 1));
  const pv = (b: number, a: number, z: number) => Math.max(1, round((b * ri(a, z)) / 100));
  return { ri, pv };
};

// All the game's effects, with values scaled on the cards' stats. Building the pool draws nothing:
// each maker draws its values, in property order, when it is called.
export function randomEffectPool(
  c: Combat,
  o: Side,
  x: Side,
): [RandomEffectKey, () => EffectData][] {
  const { ri, pv } = drawers(c);
  return [
    ['atqUp', () => ({ type: 'atq_mod', cible: 'soi', val: ri(15, 40), u: 'pct' })],
    ['atqDown', () => ({ type: 'atq_mod', cible: 'adversaire', val: -ri(15, 40), u: 'pct' })],
    ['maxHpUp', () => ({ type: 'pv_mod', cible: 'soi', val: ri(10, 30), u: 'pct' })],
    ['maxHpDown', () => ({ type: 'pv_mod', cible: 'adversaire', val: -ri(10, 30), u: 'pct' })],
    ['heal', () => ({ type: 'soin', val: ri(15, 35), u: 'pct' })],
    ['directDamage', () => ({ type: 'degats', val: pv(x.maxHp, 8, 20) })],
    ['lifeSteal', () => ({ type: 'vol_vie', val: pv(x.maxHp, 6, 15) })],
    ['attackCancelled', () => ({ type: 'annule_attaque' })],
    ['doubleDamage', () => ({ type: 'double_degats', tours: ri(1, 2) })],
    ['reflect', () => ({ type: 'renvoi', val: ri(30, 70), tours: ri(1, 3) })],
    ['trapImmunity', () => ({ type: 'insensible_piege', tours: ri(1, 3) })],
    ['delayedDamage', () => ({ type: 'degats_tours', val: pv(x.maxHp, 15, 30), tours: ri(2, 3) })],
    ['swapAtq', () => ({ type: 'echange_atq' })],
    ['swapHp', () => ({ type: 'echange_pv' })],
    ['swapAll', () => ({ type: 'echange_tout' })],
    ['swapAtqHp', () => ({ type: 'echange_atq_def', ciblem: 'adversaire' })],
    [
      'poison',
      () => ({
        type: 'poison_effet',
        ciblem: 'adversaire',
        degtour: pv(x.maxHp, 3, 6),
        tours: ri(2, 4),
      }),
    ],
    [
      'burn',
      () => ({ type: 'brulure_effet', ciblem: 'adversaire', pctpv: ri(3, 8), tours: ri(2, 4) }),
    ],
    ['stun', () => ({ type: 'etourdir_effet', ciblem: 'adversaire', tours: ri(1, 2) })],
    [
      'curse',
      () => ({
        type: 'malediction',
        ciblem: 'adversaire',
        val: pv(o.atq, 10, 25),
        tours: ri(2, 4),
      }),
    ],
    [
      'bleed',
      () => ({
        type: 'saignement',
        ciblem: 'adversaire',
        pctpv: ri(3, 7),
        reducsoin: ri(30, 60),
        tours: ri(2, 4),
      }),
    ],
    [
      'breath',
      () => ({
        type: 'souffle',
        val: pv(o.maxHp, 4, 10),
        statut: ['brulure', 'gel', 'malediction', 'poison', 'saignement', 'fatigue'][ri(0, 5)],
        chance: ri(40, 80),
        sval: ri(5, 15),
        tours: ri(2, 3),
      }),
    ],
    ['executionAttack', () => ({ type: 'execution', chance: ri(30, 60), seuilexec: ri(8, 15) })],
    [
      'executionMarks',
      () => ({ type: 'execution_direct', nbmarques: ri(1, 2), seuilexec: ri(8, 15) }),
    ],
    [
      'transcendence',
      () => ({
        type: 'transcendance',
        tours: ri(2, 4),
        patq: ri(10, 20),
        ppv: ri(10, 20),
        vv1: 10,
        vv2: 20,
        vv3: 30,
      }),
    ],
    ['solidification', () => ({ type: 'solidification', chance: ri(50, 100), tours: ri(1, 3) })],
    [
      'frost',
      () => ({
        type: 'gel',
        ciblem: 'adversaire',
        annul: ri(30, 60),
        eclat: ri(10, 30),
        tours: ri(2, 3),
      }),
    ],
    [
      'fracture',
      () => ({
        type: 'fracture',
        ciblem: 'adversaire',
        fchance: ri(40, 70),
        degfrac: pv(o.maxHp, 3, 8),
        tours: ri(2, 3),
      }),
    ],
    [
      'fatigue',
      () => ({
        type: 'fatigue',
        ciblem: 'adversaire',
        fatval: ri(15, 35),
        u: 'pct',
        fattours: ri(2, 3),
      }),
    ],
    [
      'rage',
      () => ({
        type: 'rage',
        ragev: ri(20, 50),
        u: 'pct',
        ragetours: ri(2, 3),
        fatval: ri(15, 30),
        fattours: ri(1, 2),
      }),
    ],
    ['purification', () => ({ type: 'purification', cible: 'soi' })],
    ['regen', () => ({ type: 'soin_tours', val: ri(5, 12), u: 'pct', tours: ri(2, 4) })],
    ['dodgeUp', () => ({ type: 'esquive_mod', cible: 'soi', val: ri(15, 30) })],
    ['stealUltimate', () => ({ type: 'vol_ultime' })],
    ['copyUltimate', () => ({ type: 'copie_ultime' })],
    ['resetUltimate', () => ({ type: 'reset_ultime' })],
    ['cancelMagic', () => ({ type: 'annule_magies' })],
    ['destroyMagic', () => ({ type: 'detruire', carte: 'magie' })],
    ['destroyTrap', () => ({ type: 'detruire', carte: 'piege' })],
    ['stealMagic', () => ({ type: 'voler', carte: 'magie' })],
    ['stealTrap', () => ({ type: 'voler', carte: 'piege' })],
    ['revive', () => ({ type: 'reanimation', pctrev: ri(30, 60) })],
    [
      'attackBleed',
      () => ({
        type: 'atk_saignement',
        chance: ri(30, 60),
        pctpv: ri(3, 6),
        reducsoin: ri(30, 50),
        tours: ri(2, 3),
      }),
    ],
    [
      'attackFrost',
      () => ({
        type: 'atk_gel',
        chance: ri(25, 50),
        annul: ri(30, 50),
        eclat: ri(10, 25),
        tours: 2,
      }),
    ],
    ['attackChain', () => ({ type: 'atk_enchainement', chance: ri(30, 50), max: 3 })],
  ];
}

// Random effect: draws (with the combat seed) one effect of the pool and plays it.
export function randomEffect(c: Combat, o: Side, x: Side): void {
  const POOL = randomEffectPool(c, o, x);
  const [key, make] = POOL[Math.floor(c.random() * POOL.length)] as [
    RandomEffectKey,
    () => EffectData,
  ];
  const e = make();
  emit(c, { type: 'randomEffectDrawn', side: id(c, o), effect: key });
  applyEffect(c, e, o, x, false);
}

// All the game's passives, for a programming without a list (mechanics/programming.ts). Same rules
// as randomEffectPool: building it draws nothing, and its order is balance.
export function randomPassivePool(
  c: Combat,
  o: Side,
  x: Side,
): [RandomPassiveKey, () => EffectData][] {
  const { ri, pv } = drawers(c);
  return [
    ['dodge', () => ({ type: 'esquive', chance: ri(15, 30) })],
    ['lifeSteal', () => ({ type: 'vol_pct_atq', chance: ri(40, 70), pctatq: ri(20, 40) })],
    ['burn', () => ({ type: 'brulure', chance: ri(30, 50), pctpv: ri(3, 6), tours: ri(2, 3) })],
    [
      'poison',
      () => ({ type: 'poison', chance: ri(30, 50), degtour: pv(x.maxHp, 3, 6), tours: ri(2, 3) }),
    ],
    [
      'bleed',
      () => ({
        type: 'saignement',
        chance: ri(30, 50),
        pctpv: ri(3, 5),
        reducsoin: ri(30, 50),
        tours: ri(2, 3),
      }),
    ],
    [
      'curse',
      () => ({ type: 'malediction', chance: ri(30, 50), val: pv(o.atq, 8, 15), tours: ri(2, 3) }),
    ],
    ['stun', () => ({ type: 'etourdir', chance: ri(15, 30), tours: 1 })],
    ['multiStrike', () => ({ type: 'multi_frappe', chance: ri(30, 50), frappes: 2 })],
    ['chain', () => ({ type: 'enchainement', chance: ri(30, 50), max: 3 })],
    [
      'damageReduction',
      () => ({ type: 'reduc_degats', chance: ri(30, 50), val: ri(20, 40), u: 'pct' }),
    ],
    ['reflect', () => ({ type: 'renvoi', val: ri(15, 30), u: 'pct' })],
    ['regen', () => ({ type: 'soin_tour', val: ri(3, 7), u: 'pct' })],
    ['atqRise', () => ({ type: 'atq_tours', val: ri(10, 20), u: 'pct', tours: 2 })],
    ['detonation', () => ({ type: 'detonation', chance: ri(20, 40) })],
  ];
}

// Its effects (the registry of effects.ts).
export const effects = {
  aleatoire: { run: randomEffectEffect, once: true },
} satisfies EffectRules;
