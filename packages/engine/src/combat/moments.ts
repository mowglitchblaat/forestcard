// The moments of a card's turn, and in what order the steps act at each one. This is the ONLY place
// the order lives, and the order is behaviour: the random draws are one sequence consumed in call
// order, over() flushes deferred effects, and an early stop changes what comes after. Moving a step
// in a list changes combats. The rule tests (packages/engine/test/moteur.test.js) are the judge.
//
// Where a moment walks the card's own passives (the "every turn" passives, the statuses an attack
// lays), the order is the card's, not a list here: the step walks them.

import {
  hit,
  landed,
  statusesOnHit,
  strikePower,
  type Attack,
  type AttackStep,
  type Strike,
  type StrikeStep,
} from './attack.ts';
import { emit, id, opponent, type Combat } from './combat.ts';
import { run, type Flow, type Step } from './flow.ts';
import type { Side } from './state.ts';
import { scan } from './traps.ts';
import { bleedTicks } from '../mechanics/bleed.ts';
import { blockOrReduce, blockedAttack, cancelled } from '../mechanics/block.ts';
import { counterAtStart } from '../mechanics/counter.ts';
import { detonationOnHit } from '../mechanics/detonation.ts';
import { delayedDamages } from '../mechanics/direct-damage.ts';
import { dodge } from '../mechanics/dodge.ts';
import { executionMarks } from '../mechanics/execution.ts';
import { doubleDamageEnd } from '../mechanics/double-damage.ts';
import { lifeStealOnHit } from '../mechanics/life-steal.ts';
import { reflected, reflectsEnd } from '../mechanics/reflect.ts';
import { chain, multiStrike } from '../mechanics/strikes.ts';
import { curseFading, curseTicks } from '../mechanics/curse.ts';
import { dotTicks } from '../mechanics/dot.ts';
import { fatiguesEnd } from '../mechanics/fatigue.ts';
import { fracturesEnd, selfFracture } from '../mechanics/fracture.ts';
import { regensAtStart } from '../mechanics/healing.ts';
import { magicCancelEnd } from '../mechanics/magic-cancel.ts';
import { frostsEnd, frozen } from '../mechanics/frost.ts';
import { programmingAtStart } from '../mechanics/programming.ts';
import { purificationPassives, scheduledPurifications } from '../mechanics/purification.ts';
import { ragesEnd } from '../mechanics/rage.ts';
import { opponentSolidification, solidificationAtStart } from '../mechanics/solidification.ts';
import { stunOnHit, stunned } from '../mechanics/stun.ts';
import {
  chewing,
  digesting,
  mouthFull,
  swallowAttempt,
  swallowed,
  swallowMark,
} from '../mechanics/swallow.ts';
import { theftsAtStart, timedTheftsEnd } from '../mechanics/theft.ts';
import { trapImmunityEnd } from '../mechanics/trap-immunity.ts';
import {
  transcendenceAtStart,
  transcendenceLifeSteal,
  transcendencePurifies,
} from '../mechanics/transcendence.ts';
import { ultimate } from '../mechanics/ultimates.ts';
import { aliveAtEnd, aliveAtStart, countTurn, everyTurnPassives } from './turn.ts';

type TurnStep = Step<Side>;

// 1. Start of its turn, BEFORE its attack.
const START_OF_TURN: TurnStep[] = [
  aliveAtStart,
  solidificationAtStart,
  curseFading, // losses come back before the curse ticks again
  curseTicks, // the curse lowers ATQ before the attack
  counterAtStart, // reads the hits taken since its last turn, then resets them
  regensAtStart,
  theftsAtStart,
  transcendenceAtStart, // levels before the attack
  programmingAtStart,
];

// 3. Can it attack? Each stops the attack.
const CAN_ATTACK: AttackStep[] = [
  mouthFull,
  swallowed,
  digesting,
  stunned, // a stun always skips the attack, before cancellation
  cancelled,
  blockedAttack, // not a stop: the attack happens at 0 damage
  frozen, // two draws: cancel, then paralyse
];

// How many strikes: extra strikes first, then the chain retries after them.
const STRIKE_COUNT: AttackStep[] = [multiStrike, chain];

// Once the attack is announced, before the first strike.
const BEFORE_STRIKES: AttackStep[] = [selfFracture];

// Each strike.
const STRIKE: StrikeStep[] = [
  dodge, // a dodge cancels the strike and its effects
  swallowAttempt, // third successful attack: swallowing replaces the damage
  strikePower,
  blockOrReduce,
  executionMarks, // the mark comes with the hit, before its damage
  hit, // with 3 marks and a hit leaving the target under the threshold, the hit is the execution
  transcendencePurifies,
  reflected,
];

// Each strike that landed (damage dealt, or blocked): what its attack brings.
const LANDED: StrikeStep[] = [
  transcendenceLifeSteal, // the level's life steal, then the passives'
  lifeStealOnHit,
  stunOnHit,
  detonationOnHit, // BEFORE the new statuses: it consumes those already laid
  statusesOnHit,
];

// After the landed steps, every strike.
const AFTER_STRIKE: StrikeStep[] = [swallowMark];

// 5. Its "every turn" passives.
const EVERY_TURN: TurnStep[] = [everyTurnPassives];

// 6. Its status damage and the end of the turn's effects.
const END_OF_TURN_EFFECTS: TurnStep[] = [
  aliveAtEnd,
  dotTicks, // burn and poison, in application order
  bleedTicks,
  scheduledPurifications,
  purificationPassives,
  delayedDamages,
];

// 7. End of its durations.
const END_OF_TURN: TurnStep[] = [
  countTurn,
  opponentSolidification,
  frostsEnd,
  fracturesEnd,
  fatiguesEnd, // before the rage: the fatigue following a rage starts on the next turn
  ragesEnd,
  doubleDamageEnd,
  magicCancelEnd,
  reflectsEnd,
  timedTheftsEnd,
  trapImmunityEnd,
];

// ── The skeletons ──

// Runs a strike's steps; the first exit taken ends them.
function strikes(c: Combat, at: Attack, steps: readonly StrikeStep[], st: Strike) {
  for (const step of steps) {
    const flow = step(c, at, st);
    if (flow) return flow;
  }
  return undefined;
}

// 3. The attack: whether it can, how many strikes, then each strike; the traps scan once it is done.
export function attack(c: Combat, a: Side): Flow {
  const d = opponent(c, a);
  const at: Attack = {
    a,
    d,
    ia: id(c, a),
    idd: id(c, d),
    blocked: false,
    strikes: 1,
    base: 1,
    swallowTried: 0,
  };
  if (run(c, at, CAN_ATTACK) || run(c, at, STRIKE_COUNT)) return 'stop';
  a.attacks++;
  emit(c, { type: 'attacked', side: at.ia, strikes: at.base });
  if (run(c, at, BEFORE_STRIKES)) return 'stop';
  for (let k = 0; k < at.strikes && d.hp > 0; k++) {
    if (k >= at.base) emit(c, { type: 'extraStrike', side: at.ia });
    else if (at.base > 1) emit(c, { type: 'strike', side: at.ia, index: k + 1, of: at.base });
    const st: Strike = { k, n: 0, blocked: false };
    let flow = strikes(c, at, STRIKE, st);
    if (!flow && landed(at, st)) flow = strikes(c, at, LANDED, st);
    if (!flow) flow = strikes(c, at, AFTER_STRIKE, st);
    if (flow === 'stop') return 'stop';
    if (flow === 'break') break;
  }
  scan(c, { kind: 'attack', by: at.ia });
  return undefined;
}

export const startTurn = (c: Combat, s: Side): Flow => run(c, s, START_OF_TURN);
export const everyTurn = (c: Combat, s: Side): Flow => run(c, s, EVERY_TURN);
export const endOfTurnEffects = (c: Combat, s: Side): Flow => run(c, s, END_OF_TURN_EFFECTS);
export const endTurn = (c: Combat, s: Side): Flow => run(c, s, END_OF_TURN);

// A card's turn, in a fixed order (the same for everyone, whether it plays first or second). The
// combat checks for a fallen card between two of them (simulate.ts).
export const TURN: ((c: Combat, s: Side) => Flow)[] = [
  startTurn, // 1. curse, regeneration, thefts, transcendence, programming
  ultimate, // 2.
  attack, // 3. and its effects: statuses, traps…
  chewing, // 4. when swallowing
  everyTurn, // 5. ATQ / HP growth, heal, random
  endOfTurnEffects, // 6. burn, poison, bleed, purifications, delayed damage
  endTurn, // 7. frost, fracture, fatigue, rage, double damage, reflect, trap immunity, timed thefts
];
