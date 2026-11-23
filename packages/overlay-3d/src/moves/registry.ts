// Every move a combat plays on a card, and how it shows (docs/plans/overlay-3d.md, "Coup ponctuel"). A
// kind without its entry here does not compile.

import type { MoveFxDef } from './define.ts';
import { blockMove, mirrorMove, thornsMove } from './defense.ts';
import { dodge } from './dodge.ts';
import { deathAvoidMove, reformMove, shatterMove, ultimateMove, victoryMove, wardBreakMove } from './fate.ts';
import { buffMove, debuffMove, drainMove, healMove, purifyMove, swapMove } from './life.ts';
import {
  cancelledMove,
  forgeCreateMove,
  forgeStrikeMove,
  gulpMove,
  iceBurstMove,
  releaseMove,
  seizeMove,
  spitMove,
  stealMove,
  steamMove,
} from './mechanics.ts';
import {
  breathMove,
  criticalMove,
  cutMove,
  detonateMove,
  executeMove,
  headshotMove,
  laserMove,
  lightningMove,
  missileMove,
  reapMove,
} from './strikes.ts';

export const MOVE_FX = {
  dodge,
  // defending
  block: blockMove,
  thorns: thornsMove,
  mirror: mirrorMove,
  // life and stats
  heal: healMove,
  drain: drainMove,
  buff: buffMove,
  debuff: debuffMove,
  swap: swapMove,
  purify: purifyMove,
  // blows
  critical: criticalMove,
  headshot: headshotMove,
  laser: laserMove,
  reap: reapMove,
  detonate: detonateMove,
  lightning: lightningMove,
  missile: missileMove,
  breath: breathMove,
  cut: cutMove,
  execute: executeMove,
  // great moments
  ultimate: ultimateMove,
  shatter: shatterMove,
  reform: reformMove,
  deathAvoid: deathAvoidMove,
  wardBreak: wardBreakMove,
  victory: victoryMove,
  // mechanics
  seize: seizeMove,
  release: releaseMove,
  gulp: gulpMove,
  spit: spitMove,
  forgeStrike: forgeStrikeMove,
  forgeCreate: forgeCreateMove,
  iceBurst: iceBurstMove,
  steam: steamMove,
  steal: stealMove,
  cancelled: cancelledMove,
} as const satisfies Readonly<Record<string, MoveFxDef>>;

export type MoveKind = keyof typeof MOVE_FX;

// The name of each move, as the bench says it.
export const MOVE_LABELS: Readonly<Record<MoveKind, string>> = {
  dodge: 'Esquive',
  block: 'Blocage',
  thorns: 'Épines / riposte',
  mirror: 'Miroir (renvoi)',
  heal: 'Soin',
  drain: 'Vol de vie',
  buff: 'Hausse de stat',
  debuff: 'Baisse de stat',
  swap: 'Échange ATQ / PV',
  purify: 'Purification',
  critical: 'Coup critique',
  headshot: 'Headshot',
  laser: 'Tir laser',
  reap: 'Fauche',
  detonate: 'Détonation',
  lightning: 'Foudre',
  missile: 'Missile',
  breath: 'Souffle',
  cut: 'Tranchant',
  execute: 'Exécution',
  ultimate: 'Ultime',
  shatter: 'Carte brisée',
  reform: 'Réanimation',
  deathAvoid: 'Évite la mort',
  wardBreak: 'Protection brisée',
  victory: 'Victoire',
  seize: 'Prise de contrôle',
  release: 'Fils rompus',
  gulp: 'Avalage',
  spit: 'Recraché',
  forgeStrike: 'Forge',
  forgeCreate: 'Forge de création',
  iceBurst: 'Éclat de glace',
  steam: 'Vapeur',
  steal: 'Vol de carte',
  cancelled: 'Magie annulée',
};
