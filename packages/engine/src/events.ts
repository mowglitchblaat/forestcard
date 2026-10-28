// Domain events: what happens during a combat, as typed facts. No text: the French journal is a
// projection of these events (packages/journal). Rules (docs/adr/0001-un-moteur-des-evenements-une-projection.md):
//   1. no free text in an event: a variant of a sentence is a distinct type or an enumerated field;
//   2. an event carries facts, not wording (`stacked: true`, never `suffix: ' encore plus'`);
//   3. a consumer reads the CombatView only during the onEvent call, without keeping it;
//   4. a missing field shows up in the iso run: the projected text diverges.
//
// `side` is the index (0 or 1) of the card the event is about. Amounts that come straight from card
// data keep their raw value (`Num`): the journal prints them as the legacy engine did.

import type { StatusBadge } from './combat/badges.ts';
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
  // Temporary damage boosts of the card's strikes, for the live ATQ shown during a combat:
  // bonus of its strikes (sum of its rages, and its blaze; 0 without) and double damages (double_degats) still running (they
  // stack: strikes × 2 ** doublings).
  readonly rage: number;
  readonly doublings: number;
  // The statuses it carries, one badge each (combat/badges.ts), for the overlay.
  readonly statuses: readonly StatusBadge[];
};
export type CombatView = { readonly round: number; readonly sides: readonly SideView[] };

export type StatusKind =
  | 'curse'
  | 'bleed'
  | 'poison'
  | 'burn'
  | 'frost'
  | 'knell'
  | 'fracture'
  | 'stun'
  | 'rage'
  | 'fatigue'
  | 'solid'
  | 'contamination'
  | 'weakness';

// A negative status a mist takes (mechanics/mist.ts).
export type MistedStatus =
  | 'curse'
  | 'bleed'
  | 'poison'
  | 'burn'
  | 'frost'
  | 'knell'
  | 'fracture'
  | 'stun'
  | 'fatigue'
  | 'parasite'
  | 'rooting'
  | 'contamination';

// A status removed by a purification, or moved away by a swallow (legacy keys, shown as such).
export type DispelledStatus =
  | 'poison'
  | 'brulure'
  | 'malediction'
  | 'saignement'
  | 'gel'
  | 'glas'
  | 'fatigue'
  | 'fracture'
  | 'enracinement'
  | 'contamination'
  | 'foudre'
  | 'annule';

// Why an attack, max HP or ATQ changed.
export type StatCause =
  | 'effect' // atq_mod / pv_mod: signed amount
  | 'calcination' // max HP burnt away by a burn tick
  | 'growth' // atq_tours / pv_tours passives
  | 'transcendence'
  | 'fatigue' // loss when a fatigue starts or grows
  | 'fatigueRemoved' // a magic fatigue undone
  | 'fatigueEnded'
  | 'fatigueLifted' // by a purification
  | 'curseTick' // loss on a curse tick
  | 'curseFading' // a curse loss coming back
  | 'curseLifted' // by a purification
  | 'curseRemoved' // the magic that laid it is gone
  | 'statusesLeft' // statuses moved to the swallower
  | 'mutation' // insect mutation, level I
  | 'molt' // a molt: ATQ and max HP lost
  | 'reaction'; // reaction passive: a stat grows when the card takes damage or a status

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
  | 'missileReturned' // a reflected missile exploding on its shooter
  | 'shatter' // the ice of a frost shattering (glaciation, or a fracture)
  | 'thermalShock' // fire on ice: a burn laid on a frozen card
  | 'thorns' // a thorny rooting: the rooted card's own strike hurts it
  | 'seismic' // a seismic counter-strike (mechanics/earth.ts)
  | 'blades' // air blades striking (mechanics/blades.ts)
  | 'knell'; // the knell takes the card

export type CannotAttackReason =
  | 'mouthFull'
  | 'swallowed'
  | 'digesting'
  | 'stunned'
  | 'frozen'
  | 'glaciation'; // frost level 3: caught in the ice

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
  | { type: 'combatStarted'; first: number; team?: number } // team: relay combat, fighters per player
  | { type: 'turnStarted'; side: SideIndex; turn: number }
  | { type: 'overtimeStarted'; period: number; first: number }
  // Relay combat (relay.ts): the next fighter of a player enters (index: its rank, of: team size)
  | { type: 'fighterEntered'; side: SideIndex; index: number; of: number }
  | { type: 'fighterExhausted'; side: SideIndex } // relay safety cap: falls, worn out
  | { type: 'combatEnded'; winner: number | null; rewards: number[] }
  // Cards
  | { type: 'magicRevealed'; side: SideIndex }
  | { type: 'magicCancelled'; side: SideIndex; turns: number | undefined }
  | { type: 'magicBack'; side: SideIndex }
  | { type: 'magicDestroyed'; side: SideIndex }
  | { type: 'trapFired'; side: SideIndex }
  | { type: 'trapNullified'; side: SideIndex; target: SideIndex; exhausted: boolean }
  | { type: 'trapDestroyed'; side: SideIndex; by?: 'execution' } // by: sliced by an execution
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
  | { type: 'blockRiposte'; side: SideIndex; target: SideIndex; kind: 'renvoi' | 'statut' } // side: the blocker, once per block
  // factor: the multiplier of its strikes now (2, then 4, 8… when double damages stack)
  | { type: 'damageDoubled'; side: SideIndex; factor: number }
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
  | { type: 'avoidDeathBroken'; side: SideIndex } // an execution spends it without saving the card
  | { type: 'avoidDeathGranted'; side: SideIndex }
  | { type: 'reviveGranted'; side: SideIndex; pct: Num }
  | { type: 'shattered'; side: SideIndex }
  | { type: 'revived'; side: SideIndex; hp: number; pct: Num }
  | { type: 'reviveDenied'; side: SideIndex; by?: 'knell' } // killed by a detonation or the knell: no revive
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
  // curse: no level; amount: ATQ this curse takes, count: curses on the card now
  | {
      type: 'curseApplied';
      side: SideIndex;
      stacked: boolean;
      amount: number;
      count: number;
      turns: number;
    }
  // leveled statuses (model/levels.ts): level after this one is laid (levels add up, III at most), and
  // what that level does
  | {
      type: 'bleedApplied';
      side: SideIndex;
      stacked: boolean;
      level: number;
      pct: number;
      healReduction: number;
      turns: number;
    }
  // value: poison damage per tick, or burn % of max HP per tick
  | {
      type: 'dotApplied';
      side: SideIndex;
      kind: 'poison' | 'burn';
      stacked: boolean;
      level: number;
      value: number;
      turns: number;
    }
  | {
      type: 'fatigueApplied';
      side: SideIndex;
      stacked: boolean;
      level: number;
      pct: number; // % of ATQ at that level
      amount: number; // ATQ the fatigue holds in all
      turns: number;
      afterRage: boolean;
    }
  // frost: its level (1 to 3), the chance an attack is cancelled at that level; held: a solidified card
  // stays at level 2
  | {
      type: 'frozen';
      side: SideIndex;
      level: number;
      cancelChance: number;
      turns: number;
      held: boolean;
    }
  | { type: 'frostShattered'; side: SideIndex; cause: 'glaciation' | 'fracture' }
  | { type: 'thawed'; side: SideIndex; level: number } // fire melts the ice: frost one level down
  | { type: 'fireExtinguished'; side: SideIndex } // ice puts the fire out: burn gone, no frost laid
  // the knell: laid (speed, % of max HP per turn), its shadow rising, pushed back, and taking the card
  | { type: 'knellLaid'; side: SideIndex; level: number; speed: number; stacked: boolean }
  | { type: 'knellRose'; side: SideIndex; threshold: number }
  | { type: 'knellReceded'; side: SideIndex; threshold: number; skulls: number }
  | { type: 'knelled'; side: SideIndex }
  // rooting (mechanics/rooting.ts): its variant, and its values (val: thorns damage, level: the
  // poison it lays)
  | {
      type: 'rooted';
      side: SideIndex;
      variant: 'epineux' | 'empoisonne' | 'inhibiteur';
      stacked: boolean;
      turns: number;
      val: number;
      level: number;
    }
  | { type: 'rootEnded'; side: SideIndex; variant: 'epineux' | 'empoisonne' | 'inhibiteur' }
  | { type: 'ultimateHeld'; side: SideIndex } // an inhibiting rooting holds its ultimate
  // contamination (mechanics/contamination.ts): prolonged, how many statuses gained a turn
  | { type: 'contaminated'; side: SideIndex; stacked: boolean; turns: number; prolonged: number }
  | { type: 'vaporized'; side: SideIndex } // burn + contamination: the burn is spent
  // earth skills (mechanics/earth.ts): layers and shield, charges and counter-strike
  | { type: 'layerGained'; side: SideIndex; layers: number }
  | { type: 'shieldRaised'; side: SideIndex; amount: number; total: number }
  | { type: 'shieldAbsorbed'; side: SideIndex; amount: number; left: number }
  | { type: 'chargeGained'; side: SideIndex; charges: number }
  | { type: 'seismicStrike'; side: SideIndex; target: SideIndex; dodged: boolean }
  // critical hits (mechanics/critical.ts): side is the attacker; the updraft that follows
  | { type: 'criticalHit'; side: SideIndex; target: SideIndex; bonus: number }
  | {
      type: 'updraft';
      side: SideIndex;
      amplified: number;
      stacks: number;
      power: number;
      turns: number;
    }
  | { type: 'updraftEnded'; side: SideIndex }
  // shear (mechanics/blades.ts): a packet of air blades laid on side; packets: how many it carries
  | {
      type: 'bladesLaid';
      side: SideIndex;
      blades: number;
      damage: number;
      turns: number;
      packets: number;
    }
  | { type: 'bladesStruck'; side: SideIndex; blades: number; total: number; dodged: boolean }
  // lightning mark (mechanics/lightning.ts): side is the marked card; struck: side is the attacker
  | { type: 'lightningMarked'; side: SideIndex; level: number }
  | { type: 'lightningStruck'; side: SideIndex; target: SideIndex; bonus: number }
  | {
      type: 'lightningBounced';
      side: SideIndex;
      slot: 'magie' | 'piege';
      result: 'charged' | 'destroyed' | 'empty';
    }
  | { type: 'lightningFaded'; side: SideIndex }
  // blaze (mechanics/blaze.ts): side is the card ablaze; again: it was already, its turns start again
  | {
      type: 'blazeStarted';
      side: SideIndex;
      again: boolean;
      turns: number;
      atqPct: number;
      burnLevel: number;
      burnTurns: number;
    }
  | { type: 'blazeEnded'; side: SideIndex }
  | { type: 'weakened'; side: SideIndex; stacked: boolean; pct: number; turns: number }
  // fracture: at its level, the chance to get hurt when attacking and the damage, % of its own ATQ
  | {
      type: 'fractured';
      side: SideIndex;
      stacked: boolean;
      level: number;
      chance: number;
      atqPct: number;
      turns: number;
    }
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
  // Headshot and targeting (mechanics/headshot.ts): side is the attacker for a headshot, the target
  // for a targeting mark.
  | { type: 'headshot'; side: SideIndex; target: SideIndex; bonus: number; forced: boolean }
  | { type: 'targeted'; side: SideIndex; by: SideIndex; turns: number; consume: boolean }
  | { type: 'targetMissed'; side: SideIndex; by: SideIndex }
  | { type: 'targetEnded'; side: SideIndex }
  // Mist (mechanics/mist.ts): level 1 takes the negative statuses, level 2 sends them back once.
  | { type: 'mistRaised'; side: SideIndex; level: number; turns: number }
  | { type: 'mistMissed'; side: SideIndex }
  | { type: 'mistBlocked'; side: SideIndex; status: MistedStatus }
  | { type: 'mistReturned'; side: SideIndex; to: SideIndex; status: MistedStatus }
  | { type: 'mistFaded'; side: SideIndex }
  // Parasitic link (mechanics/parasite.ts): side is the carrier, `to` the card its heals feed.
  | {
      type: 'parasiteLinked';
      side: SideIndex;
      to: SideIndex;
      turns: number;
      pct: number;
      links: number; // the carrier's links now
      stacked: boolean;
    }
  | { type: 'parasiteFed'; side: SideIndex; to: SideIndex; amount: number; links: number }
  | { type: 'parasiteEnded'; side: SideIndex; links: number } // links: those left
  // Insect mutation and molt (mechanics/insect.ts).
  | { type: 'mutated'; side: SideIndex; level: number }
  | { type: 'moltStarted'; side: SideIndex; turns: number }
  | { type: 'molted'; side: SideIndex; instant: boolean }
  // Damage reduction given by an effect (mechanics/guard.ts): value % (or points), turns 0 = whole combat.
  | {
      type: 'reductionGranted';
      side: SideIndex;
      chance: number;
      value: number;
      points: boolean;
      turns: number;
    }
  | { type: 'reductionEnded'; side: SideIndex }
  // A magic's timing (mechanics/magic-timing.ts): waiting for its turn, acting then, spent.
  | { type: 'magicDelayed'; side: SideIndex; turn: number }
  | { type: 'magicActivated'; side: SideIndex }
  | { type: 'magicExpired'; side: SideIndex }
  // Damage reduction (%) or block chance (%) gained (mutation, reaction passive).
  | { type: 'defenseChanged'; side: SideIndex; kind: 'block' | 'reduce'; delta: number }
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
