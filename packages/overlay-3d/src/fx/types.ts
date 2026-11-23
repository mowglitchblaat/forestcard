// What an effect is, and what it receives.
//
// An effect declares:
//   layer     where it draws (LayerName below);
//   defaults  every parameter, with its default: the configuration overrides some of them by name;
//   run       draws it; returns { stop() } if it lives until stopped (ambient), nothing if it ends by itself.
// One effect per module (fx/*.ts), listed in fx/registry.ts.

import type { Application, ColorSource, Container, Texture } from 'pixi.js';
import type { Group } from '@forestcard/layout';
import type { Stoppable } from '../engine/time.ts';

// Where an effect draws:
//   under    in the card, between the drawing and the frame (clipped by the card)
//   frame    in the card, on the frame (clipped by the card)
//   drawing  the card's drawing group itself (for filters on the drawing)
//   over     in the card, above everything (clipped by the card)
//   behind   the scene layer under ALL the cards: an effect there never covers a neighbouring card
//   scene    the whole scene (distortions)
export type LayerName = 'under' | 'frame' | 'drawing' | 'over' | 'behind' | 'scene';

// What an effect may use of a card (implemented by Card, card/card.ts).
export type FxCard = {
  readonly root: Container;
  // A flat card (card.ts, Face) has only some of the groups.
  readonly groups: Readonly<Partial<Record<Group, Container>>>;
  readonly frameTexture: Texture | null;
};

export type FxContext = {
  layers: Partial<Record<LayerName, Container>>;
  card: FxCard;
  app: Application | null;
  W: number; // the card's own units, for the layers that belong to the card
  H: number;
  x: number; // centre of the card in the 'behind' / 'scene' coordinates
  y: number;
  cardW: number; // its size there
  cardH: number;
  colour: ColorSource; // the rarity colour
  rainbow: boolean; // tint with a rainbow instead of the colour
};

// A parameter is plain data: the configuration is JSON.
export type ParamValue = number | string | boolean | readonly number[];
export type Params = Readonly<Record<string, ParamValue>>;

export type FxDef<P extends Params> = {
  layer: LayerName;
  defaults: P;
  run(ctx: FxContext & { layer: Container }, p: P): Stoppable | void;
};

export const defineFx = <P extends Params>(def: FxDef<P>): FxDef<P> => def;
