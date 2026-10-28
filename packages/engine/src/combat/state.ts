// State of a combat: one Side per player, holding the cards in play and the running statuses.
// Field names follow docs/glossaire.md; comments give the legacy name when it helps to read
// legacy/moteur-combat.js side by side.

import { type AttackEffectsState, attackEffectsState } from '../mechanics/attack-effects.ts';
import { type AvoidDeathState, avoidDeathState } from '../mechanics/avoid-death.ts';
import { type BleedState, bleedState } from '../mechanics/bleed.ts';
import { type BlockState, blockState } from '../mechanics/block.ts';
import { type CounterState, counterState } from '../mechanics/counter.ts';
import { type CurseState, curseState } from '../mechanics/curse.ts';
import { type DirectDamageState, directDamageState } from '../mechanics/direct-damage.ts';
import { type DodgeState, dodgeState } from '../mechanics/dodge.ts';
import { type DotState, dotState } from '../mechanics/dot.ts';
import { type DoubleDamageState, doubleDamageState } from '../mechanics/double-damage.ts';
import { type ExecutionState, executionState } from '../mechanics/execution.ts';
import { type FatigueState, fatigueState } from '../mechanics/fatigue.ts';
import { type FractureState, fractureState } from '../mechanics/fracture.ts';
import { type FrostState, frostState } from '../mechanics/frost.ts';
import { type HealingState, healingState } from '../mechanics/healing.ts';
import { type KnellState, knellState } from '../mechanics/knell.ts';
import { type ProgrammingState, programmingState } from '../mechanics/programming.ts';
import { type PurificationState, purificationState } from '../mechanics/purification.ts';
import { type RageState, rageState } from '../mechanics/rage.ts';
import { type ReflectState, reflectState } from '../mechanics/reflect.ts';
import { type ReviveState, reviveState } from '../mechanics/revive.ts';
import { type SolidificationState, solidificationState } from '../mechanics/solidification.ts';
import { type StunState, stunState } from '../mechanics/stun.ts';
import { type SwallowState, swallowState } from '../mechanics/swallow.ts';
import { type TheftState, theftState } from '../mechanics/theft.ts';
import { type TranscendenceState, transcendenceState } from '../mechanics/transcendence.ts';
import { type TrapImmunityState, trapImmunityState } from '../mechanics/trap-immunity.ts';
import { type GuardState, guardState } from '../mechanics/guard.ts';
import { type HeadshotState, headshotState } from '../mechanics/headshot.ts';
import { type InsectState, insectState } from '../mechanics/insect.ts';
import { type MistState, mistState } from '../mechanics/mist.ts';
import { type ParasiteState, parasiteState } from '../mechanics/parasite.ts';
import { type ReactionState, reactionState } from '../mechanics/reaction.ts';
import { type RootingState, rootingState } from '../mechanics/rooting.ts';
import { type EarthState, earthState } from '../mechanics/earth.ts';
import { type CriticalState, criticalState } from '../mechanics/critical.ts';
import { type BladesState, bladesState } from '../mechanics/blades.ts';
import { type LightningState, lightningState } from '../mechanics/lightning.ts';
import { type ContaminationState, contaminationState } from '../mechanics/contamination.ts';
import { type BlazeState, blazeState } from '../mechanics/blaze.ts';
import type { Card, EffectData, Num } from '../model/card.ts';

// An ultimate held by a card: its own, or one stolen or copied from the opponent.
export type UltimateSlot = {
  effect: EffectData | null | undefined;
  uses: number;
  lastRound: number;
  copiedFrom?: EffectData | null | undefined;
  triggered?: number; // an event met its udecl: fires at its next chance (legacy: trg)
};

// A stat change made by an active magic, or a function undoing one. Replayed when the magic is
// cancelled, destroyed or stolen (legacy: mdelta).
export type MagicDelta =
  | { undo: () => void }
  | { side: Side; stat: 'atq' | 'maxHp'; delta: number };

// A card's running statuses: each mechanic declares its part (mechanics/*.ts), plus the turns it
// played (the durations count them).
export type Status = { turnsPlayed: number } & RageState &
  FatigueState &
  PurificationState &
  ReviveState &
  HealingState &
  CurseState &
  BleedState &
  FrostState &
  KnellState &
  FractureState &
  StunState &
  BlockState &
  DoubleDamageState &
  SolidificationState &
  ExecutionState &
  TranscendenceState &
  DotState &
  AttackEffectsState &
  DodgeState &
  ReflectState &
  TrapImmunityState &
  DirectDamageState &
  TheftState &
  SwallowState &
  AvoidDeathState &
  CounterState &
  ProgrammingState &
  HeadshotState &
  GuardState &
  MistState &
  ParasiteState &
  InsectState &
  ReactionState &
  RootingState &
  ContaminationState &
  EarthState &
  CriticalState &
  BladesState &
  LightningState &
  BlazeState;

export type Side = {
  pseudo: string;
  deck: Card[];
  dos: string | null;
  fighter: Card;
  magic: Card;
  trap: Card;
  atq: number;
  hp: number;
  maxHp: number;
  passives: EffectData[];
  ultimates: UltimateSlot[];
  magicActive: number;
  trapActive: number;
  trapTriggers: number;
  magicDeltas: MagicDelta[];
  status: Status;
  damageDealt: number;
  attacks: number;
  hitsTaken: number; // since its last turn
  cardActivated: number; // a card activated: ultimates with sur_carte may fire
  magicCancelStage: number; // 1: cancelled before acting, 2: shown then crossed out
  magicCancelTurns: number; // 0: the whole combat
  magicNeverActed: number;
  magicStolen: number;
  trapBlocked: number; // blocked by immunity, may re-arm
  magicStartTurn: number; // a waiting magic acts at the start of this turn of its card (0: none)
  magicTurnsLeft: number; // turns before the magic is spent (0: no duration)
};

// Placeholders for a deck without magic or without trap.
export const NO_MAGIC: Card = { type: 'magie', nom: 'Aucune magie', effet: null, vide: 1 };
export const NO_TRAP: Card = { type: 'piege', nom: 'Aucun piège', effet: null, vide: 1 };

// Admin-created ("perso_") effect whose key mentions a stun: its "Valeur" field is the chance.
const customStunChance = (e: EffectData): Num =>
  (e.chance == null || e.chance === '') && e.val != null && e.val !== '' ? e.val : e.chance;
const isCustomStun = (e: EffectData | null | undefined): e is EffectData =>
  !!e && typeof e.type === 'string' && e.type.indexOf('perso_') === 0 && /etourd/.test(e.type);

// Custom stun effects run as the engine's own stun.
export const canonEffect = <T extends EffectData | null | undefined>(e: T): T | EffectData =>
  isCustomStun(e) ? { ...e, type: 'etourdir_effet', chance: customStunChance(e) } : e;
export const canonPassive = <T extends EffectData | null | undefined>(p: T): T | EffectData =>
  isCustomStun(p) ? { ...p, type: 'etourdir', chance: customStunChance(p) } : p;

// A single passive (old format) or several passives { briques: [...] }.
export const normalizePassives = (p: EffectData | null | undefined): EffectData[] =>
  !p
    ? []
    : p.briques
      ? (p.briques.filter((b) => b && b.type) as EffectData[]).map((b) => canonPassive(b))
      : p.type
        ? [canonPassive(p)]
        : [];

export const newStatus = (passives: EffectData[]): Status => ({
  turnsPlayed: 0,
  ...rageState(),
  ...fatigueState(),
  ...purificationState(),
  ...reviveState(),
  ...healingState(),
  ...curseState(),
  ...bleedState(),
  ...frostState(),
  ...knellState(),
  ...fractureState(),
  ...stunState(),
  ...blockState(),
  ...doubleDamageState(),
  ...solidificationState(),
  ...executionState(),
  ...transcendenceState(),
  ...dotState(),
  ...attackEffectsState(),
  ...dodgeState(),
  ...reflectState(),
  ...trapImmunityState(),
  ...directDamageState(),
  ...theftState(),
  ...swallowState(),
  ...avoidDeathState(passives),
  ...counterState(),
  ...programmingState(),
  ...headshotState(),
  ...guardState(),
  ...mistState(),
  ...parasiteState(),
  ...insectState(),
  ...reactionState(passives),
  ...rootingState(),
  ...contaminationState(),
  ...earthState(),
  ...criticalState(),
  ...bladesState(),
  ...lightningState(),
  ...blazeState(),
});
