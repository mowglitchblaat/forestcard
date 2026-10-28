// Public entry point of the combat engine.
export { simulate, canonEffect, canonPassive } from './simulate.ts';
export { simulateRelay, RELAY_ROUND_CAP } from './relay.ts';
export type { SimulateOptions, CombatResult } from './simulate.ts';
export type * from './events.ts';
export type { Card, CardType, EffectData, Num, Player, TrapCondition } from './model/card.ts';
export { DEFAULT_RULES, type Rules } from './model/rules.ts';
export {
  DEFAULT_LEVELS,
  MAX_LEVEL,
  levelOf,
  levelTable,
  legacyLevel,
  rageFatigueLevel,
  type LeveledStatus,
  type StatusLevels,
} from './model/levels.ts';
export {
  EFFECT_TYPES,
  PASSIVE_TYPES,
  TRAP_CONDITION_TYPES,
  ULTIMATE_TRIGGER_TYPES,
  type EffectType,
  type PassiveType,
  type TrapConditionType,
  type UltimateTriggerType,
} from './model/types.ts';
