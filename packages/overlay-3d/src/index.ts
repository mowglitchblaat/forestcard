// Public entry point of the WebGL overlays.
export {
  Card,
  DEFAULT_BACK,
  measure,
  TOGGLABLE_GROUPS,
  type CardData,
  type CardOptions,
  type Face,
  type Hidden,
  type SceneLayers,
  type TogglableGroup,
} from './card/card.ts';
export type { Textures } from './card/draw.ts';
export { cardAsset, decodeImagesAsElements } from './card/assets.ts';
export { TextureStore, type Release } from './card/texture-store.ts';
export { createStage, anchored, type Stage, type Anchor, type Rect } from './engine/stage.ts';
export {
  createPlayer,
  type Player,
  type PlayerOptions,
  type OverlayEvent,
} from './engine/player.ts';
export {
  tween,
  wait,
  every,
  detach,
  easing,
  report,
  setErrorReporter,
  capFrameRate,
  DEFAULT_MAX_FPS,
  type Easing,
} from './engine/time.ts';
export { FX, isFxName, type FxEntry, type FxName, type FxParams } from './fx/registry.ts';
export { runFx, runAll } from './fx/run.ts';
export { defineFx, type FxContext, type FxDef, type LayerName } from './fx/types.ts';
export { REVEAL_SHADERS, type RevealShaderName } from './reveal/registry.ts';
export { revealCard } from './reveal/reveal.ts';
export { RARITIES, allowsType } from './config/rarities.ts';
export { BOOSTER, pacingFor, zoneFor, bySize } from './config/booster.ts';
export { checkRarity, type Checked } from './config/validate.ts';
export type {
  RarityConfig,
  Rarities,
  BoosterConfig,
  BoosterZone,
  FlipReveal,
  ShaderReveal,
  Pacing,
} from './config/types.ts';
export { playBooster, type BoosterEvent, type BoosterContext } from './scenes/booster.ts';
export { playCombat, combatTextures, type CombatContext } from './scenes/combat.ts';
export { COMBAT, type CombatConfig } from './config/combat.ts';
export {
  readCombatMessage,
  type CardRef,
  type CombatLine,
  type CombatMessage,
  type CombatPlayer,
} from './input/combat-message.ts';
export { Workbench } from './scenes/workbench.ts';
export { dressedCard, gridLayout, cardLayers, type Deps } from './scenes/common.ts';
export {
  readBoosterMessage,
  toBoosterEvent,
  toCardData,
  texturesOf,
  tierOf,
  tierOfColour,
  lookupBoosterImage,
  type BoosterMessage,
  type BoosterMessageCard,
  type TextureKeys,
} from './input/booster-message.ts';
export { CardStatuses } from './status/host.ts';
export { STATUS_FX, STATUS_LABELS, type StatusFxKind } from './status/registry.ts';
export { defineStatusFx, type StatusFxDef } from './status/define.ts';
export { CardMarks } from './marks/host.ts';
export { MARK_FX, MARK_LABELS, type MarkKind } from './marks/registry.ts';
export {
  defineMarkFx,
  type MarkFxDef,
  type MarkView,
  type MarkContext,
  type MarkLeave,
} from './marks/define.ts';
export { CardMoves } from './moves/host.ts';
export { MOVE_FX, MOVE_LABELS, type MoveKind } from './moves/registry.ts';
export { defineMoveFx, type MoveFxDef, type MoveContext } from './moves/define.ts';
export { DISPLAY, type DisplayConfig } from './config/display.ts';
export {
  quality,
  qualityLevel,
  setQuality,
  qualityFromUrl,
  shaderDefines,
  particleCount,
  type Quality,
  type QualityConfig,
} from './config/quality.ts';
export { CombatTerrain, isTerrain, type TerrainName } from './scenes/terrain.ts';
export { mechanicsOf, type MechanicsContext } from './scenes/combat-fx.ts';
