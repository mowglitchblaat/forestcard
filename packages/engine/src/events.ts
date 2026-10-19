// Domain events: what happens during a combat, as typed facts. No text: the French journal is a
// projection of these events (packages/journal). Rules (docs/adr/0001-un-moteur-des-evenements-une-projection.md):
//   1. no free text in an event: a variant of a sentence is a distinct type or an enumerated field;
//   2. an event carries facts, not wording (`stacked: true`, never `suffix: ' encore plus'`);
//   3. a consumer reads the CombatView only during the onEvent call, without keeping it;
//   4. a missing field shows up in the iso run: the projected text diverges.
//
// `side` is the index (0 or 1) of the card the event is about. Amounts that come straight from card
// data keep their raw value (`Num`): the journal prints them as the legacy engine did.

import type { Card, Num } from './model/card.ts';

export type SideIndex = number;

// Read-only view of the combat, valid during the onEvent call only.
export type SideView = {
  readonly pseudo: string;
  readonly dos: string | null;
  readonly fighter: Card;
  readonly magic: Card;
  readonly trap: Card;
  readonly hp: number;
  readonly maxHp: number;
  readonly atq: number;
};
export type CombatView = { readonly round: number; readonly sides: readonly SideView[] };

export type StatusKind =
  | 'curse'
  | 'bleed'
  | 'poison'
  | 'burn'
  | 'frost'
  | 'fracture'
  | 'stun'
  | 'rage'
  | 'fatigue'
  | 'solid';

// A status removed by a purification, or moved away by a swallow (legacy keys, shown as such).
export type DispelledStatus =
  | 'poison'
  | 'brulure'
  | 'malediction'
  | 'saignement'
  | 'gel'
  | 'fatigue'
  | 'fracture'
  | 'annule';

// Why an attack, max HP or ATQ changed.
export type StatCause =
  | 'effect' // atq_mod / pv_mod: signed amount
  | 'growth' // atq_tours / pv_tours passives
  | 'transcendence'
  | 'fatigue' // loss when a fatigue starts or grows
  | 'fatigueRemoved' // a magic fatigue undone
  | 'fatigueEnded'
  | 'fatigueLifted' // by a purification
  | 'curseTick' // loss on a curse tick
  | 'curseFading' // a curse loss coming back
  | 'curseLifted' // by a purification
  | 'statusesLeft'; // statuses moved to the swallower

export type DamageCause =
  | 'direct'
  | 'lifeSteal'
  | 'breath'
  | 'poison'
  | 'burn'
  | 'bleed'
  | 'selfFracture'
  | 'attack'
  | 'reflect'
  | 'execution'
  | 'chew'
  | 'delayed'
  | 'detonation' // a detonation's explosion
  | 'missile' // a missile's explosion
  | 'blast' // a share of an explosion, on the cards around it
  | 'missileReturned'; // a reflected missile exploding on its shooter

export type CannotAttackReason =
  | 'mouthFull'
  | 'swallowed'
  | 'digesting'
  | 'stunned'
  | 'frozen'
  | 'paralysed';

// Keys of the random effect pool (randomEffect in simulate.ts).
export type RandomEffectKey =
  | 'atqUp'
  | 'atqDown'
  | 'maxHpUp'
  | 'maxHpDown'
  | 'heal'
  | 'directDamage'
  | 'lifeSteal'
  | 'attackCancelled'
  | 'doubleDamage'
  | 'reflect'
  | 'trapImmunity'
  | 'delayedDamage'
  | 'swapAtq'
  | 'swapHp'
  | 'swapAll'
  | 'swapAtqHp'
  | 'poison'
  | 'burn'
  | 'stun'
  | 'curse'
  | 'bleed'
  | 'breath'
  | 'executionAttack'
  | 'executionMarks'
  | 'transcendence'
  | 'solidification'
  | 'frost'
  | 'fracture'
  | 'fatigue'
  | 'rage'
  | 'purification'
  | 'regen'
  | 'dodgeUp'
  | 'stealUltimate'
  | 'copyUltimate'
  | 'resetUltimate'
  | 'cancelMagic'
  | 'destroyMagic'
  | 'destroyTrap'
  | 'stealMagic'
  | 'stealTrap'
  | 'revive'
  | 'attackBleed'
  | 'attackFrost'
  | 'attackChain';

// Keys of the random passive pool (randomPassivePool, for a programming without a list).
export type RandomPassiveKey =
  | 'dodge'
  | 'lifeSteal'
  | 'burn'
  | 'poison'
  | 'bleed'
  | 'curse'
  | 'stun'
  | 'multiStrike'
  | 'chain'
  | 'damageReduction'
  | 'reflect'
  | 'regen'
  | 'atqRise'
  | 'detonation';

// What a programming without a list drew: a passive of the passive pool, or an ultimate of the
// random effect pool. The journal names it from the key.
export type ProgrammedDraw =
  | { pool: 'passives'; key: RandomPassiveKey }
  | { pool: 'effects'; key: RandomEffectKey };

export type DomainEvent =
  // Combat flow
  | { type: 'combatStarted'; first: number }
  | { type: 'turnStarted'; side: SideIndex; turn: number }
  | { type: 'overtimeStarted'; period: number; first: number }
  | { type: 'combatEnded'; winner: number | null; rewards: number[] }
  // Cards
  | { type: 'magicRevealed'; side: SideIndex }
  | { type: 'magicCancelled'; side: SideIndex; turns: number | undefined }
  | { type: 'magicBack'; side: SideIndex }
  | { type: 'magicDestroyed'; side: SideIndex }
  | { type: 'trapFired'; side: SideIndex }
  | { type: 'trapNullified'; side: SideIndex; target: SideIndex; exhausted: boolean }
  | { type: 'trapDestroyed'; side: SideIndex }
  | { type: 'trapRearmed'; side: SideIndex }
  | { type: 'ultimateTriggered'; side: SideIndex }
  | { type: 'ultimateCopied'; side: SideIndex; from: SideIndex }
  | { type: 'ultimateAlreadyHeld'; side: SideIndex }
  | { type: 'noUltimateToCopy'; side: SideIndex }
  | { type: 'ultimateStolen'; side: SideIndex; from: SideIndex }
  | { type: 'noUltimateToSteal'; side: SideIndex }
  | { type: 'ultimateReset'; side: SideIndex }
  | { type: 'theftScheduled'; side: SideIndex; carte: string | undefined; turn: number }
  | {
      type: 'magicStolen';
      side: SideIndex;
      from: SideIndex;
      card: Card;
      slot: string;
      turns: number;
    }
  | { type: 'trapStolen'; side: SideIndex; from: SideIndex; card: Card; turns: number }
  | {
      type: 'magicReturned';
      side: SideIndex;
      from: SideIndex;
      card: Card;
      slot: string;
      uncovered: Card | null | undefined;
      ok: boolean;
    }
  | {
      type: 'trapReturned';
      side: SideIndex;
      from: SideIndex;
      card: Card;
      uncovered: Card | null | undefined;
      ok: boolean;
      exhausted: boolean;
    }
  | { type: 'equipped'; side: SideIndex; card: Card }
  | { type: 'unknownEffect'; effectType: string | undefined }
  | { type: 'randomEffectDrawn'; side: SideIndex; effect: RandomEffectKey }
  // Attack
  | {
      type: 'cannotAttack';
      side: SideIndex;
      reason: CannotAttackReason;
      swallower?: SideIndex;
      stillStunned?: boolean;
    }
  | { type: 'attackCancelled'; side: SideIndex; defender: SideIndex }
  | { type: 'attacked'; side: SideIndex; strikes: number }
  | { type: 'extraStrike'; side: SideIndex }
  | { type: 'strike'; side: SideIndex; index: number; of: number }
  | { type: 'dodged'; side: SideIndex }
  | { type: 'damageReduced'; side: SideIndex }
  | { type: 'nextAttackCancelled'; side: SideIndex }
  | { type: 'nextAttackBlocked'; side: SideIndex }
  | { type: 'attackBlocked'; side: SideIndex; defender: SideIndex } // the attack lands at 0 damage
  | { type: 'damageDoubled'; side: SideIndex }
  | { type: 'counterPrepared'; side: SideIndex }
  // Damage, healing, death
  | {
      type: 'damaged';
      side: SideIndex;
      amount: number;
      cause: DamageCause;
      from?: SideIndex; // reflect: the card whose reflect hit
      by?: SideIndex; // chew: the swallower
      bite?: number; // chew: bite number
      bites?: number; // chew: bites before spitting out
      single?: boolean; // chew: a single bite (statuses transferred)
    }
  | { type: 'healed'; side: SideIndex; amount: number; revive: boolean }
  | { type: 'deathAvoided'; side: SideIndex; source: 'magic' | 'passive' | 'trap' }
  | { type: 'avoidDeathGranted'; side: SideIndex }
  | { type: 'reviveGranted'; side: SideIndex; pct: Num }
  | { type: 'shattered'; side: SideIndex }
  | { type: 'revived'; side: SideIndex; hp: number; pct: Num }
  | { type: 'reviveDenied'; side: SideIndex } // killed by a detonation: no revive
  // Stats
  | { type: 'statChanged'; side: SideIndex; stat: 'atq' | 'max'; delta: number; cause: StatCause }
  | { type: 'dodgeChanged'; side: SideIndex; delta: number }
  | { type: 'statsSwapped'; side: SideIndex; with: SideIndex; what: 'atq' | 'hp' | 'all' }
  | { type: 'attackAndHpSwapped'; side: SideIndex }
  // Statuses
  | { type: 'statusEnded'; side: SideIndex; status: StatusKind }
  | { type: 'statusDispelled'; side: SideIndex; status: DispelledStatus }
  | { type: 'purified'; side: SideIndex; removedSomething: boolean; stunned: boolean }
  | { type: 'rageStarted'; side: SideIndex; bonus: number; turns: number }
  | { type: 'regenStarted'; side: SideIndex; amount: number; turns: number }
  | { type: 'regenEnded'; side: SideIndex }
  | { type: 'curseApplied'; side: SideIndex; stacked: boolean; amount: number; turns: number }
  | {
      type: 'bleedApplied';
      side: SideIndex;
      stacked: boolean;
      pct: number;
      healReduction: number;
      turns: number;
    }
  | { type: 'dotApplied'; side: SideIndex; kind: 'poison' | 'burn'; stacked: boolean }
  | {
      type: 'fatigueApplied';
      side: SideIndex;
      stacked: boolean;
      amount: number;
      turns: number;
      afterRage: boolean;
    }
  | { type: 'frozen'; side: SideIndex; cancelChance: number; stunChance: number; turns: number }
  | { type: 'fractured'; side: SideIndex; chance: number; damage: number; turns: number }
  | { type: 'solidified'; side: SideIndex; turns: number }
  | { type: 'solidBroken'; side: SideIndex }
  | { type: 'stunned'; side: SideIndex; turns: number; by: 'effect' | 'attack' }
  | { type: 'stunResisted'; side: SideIndex; chance: number; attempts: number }
  | { type: 'stunBlockedBySolid'; side: SideIndex }
  | { type: 'breathed'; side: SideIndex; target: SideIndex; element: string; index: number } // index: 1, then 2, 3… for chained breaths
  | { type: 'breathResisted'; side: SideIndex; chance: number }
  | { type: 'breathDodged'; side: SideIndex }
  | { type: 'breathBlocked'; side: SideIndex; by: SideIndex } // side: the target, by: the breather
  // Missiles and detonation
  | {
      type: 'missileFired';
      side: SideIndex; // the target
      from: SideIndex;
      index: number;
      of: number;
      returned: boolean; // reflected: it flies back to its shooter
    }
  | { type: 'missileDodged'; side: SideIndex }
  | { type: 'missileBlocked'; side: SideIndex; by: SideIndex } // side: the target, by: the shooter
  | {
      type: 'detonated';
      side: SideIndex; // where it explodes
      from: SideIndex;
      parts: ('brulure' | 'poison' | 'saignement')[]; // the statuses consumed
      explosion: 'detonation' | 'missile' | 'missileBeside' | 'missileReturned';
    }
  | { type: 'statusExploded'; side: SideIndex; status: 'brulure' | 'poison' | 'saignement' }
  | { type: 'detonationEmpty'; side: SideIndex } // no status to detonate, no raw damage
  | { type: 'detonationDampened'; side: SideIndex } // solidified: half of the status damage
  // Attack effects
  | { type: 'attackEffectGranted'; side: SideIndex; effect: string; chance: Num }
  | { type: 'executionPrepared'; side: SideIndex; chance: Num }
  | { type: 'markReceived'; side: SideIndex; marks: number }
  | { type: 'marksLost'; side: SideIndex; count: number; marks: number }
  | { type: 'executed'; side: SideIndex }
  // Swallowing
  | { type: 'swallowPrepared'; side: SideIndex }
  | { type: 'swallowMarkReceived'; side: SideIndex; marks: number }
  | { type: 'swallowFailed'; side: SideIndex; target: SideIndex; ratio: number }
  | { type: 'swallowed'; side: SideIndex; target: SideIndex }
  | { type: 'statusesTransferred'; side: SideIndex; from: SideIndex; kinds: DispelledStatus[] }
  | { type: 'statusLostToSwallower'; side: SideIndex; status: DispelledStatus }
  | { type: 'spatOut'; side: SideIndex; target: SideIndex }
  | { type: 'digestionStarted'; side: SideIndex; turns: number }
  // Transcendence
  | { type: 'transcendenceArmed'; side: SideIndex; turn: number }
  | { type: 'transcendenceLost'; side: SideIndex }
  | { type: 'transcended'; side: SideIndex; level: number; lifeSteal: number | undefined }
  // Programming passive. label / effectType: the programmed effect's own label (`lib`, card data)
  // and type, from which the journal writes its name; drawn: what a programming without a list
  // drew, named from its key instead.
  | {
      type: 'programmed';
      side: SideIndex;
      what: 'p' | 'u';
      label: unknown;
      effectType: unknown;
      drawn: ProgrammedDraw | undefined;
    }
  | { type: 'programmingActivated'; side: SideIndex }
  | { type: 'programmedPassivesAwake'; side: SideIndex; count: number }
  | {
      type: 'programmedUltimate';
      side: SideIndex;
      label: unknown;
      effectType: unknown;
      drawn: ProgrammedDraw | undefined;
    };

export type EventType = DomainEvent['type'];

export type OnEvent = (event: DomainEvent, view: CombatView) => void;
