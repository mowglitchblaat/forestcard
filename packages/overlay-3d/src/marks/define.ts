// A mark on a card, as a combat shows it: something laid on the card by an event of the engine, that
// stays until the event that takes it away (docs/plans/overlay-3d.md, "État posé"). Unlike a status
// (status/), it is not a state of the card's matter: it counts something (holes, cutlery, slots…).
// A mark has a level (how many marks): 0 takes it off.
//   set   the level changes: the new marks land, the ones above the level go (they fade, or `drop`: they
//         fall off the card, a mark that failed); resolves when they have.
//   tick  the mark acts and changes how it looks for good (the programmed slots light up): optional.
// A mark does not read the engine's events: the combat scene turns an event into set(kind, level).

import type { Container } from 'pixi.js';
import type { Card } from '../card/card.ts';

// What a mark draws on: its layer over the card, in card units (W x H, the face in card.box).
export type MarkContext = { card: Card; layer: Container };

export type MarkLeave = 'fade' | 'drop';

export type MarkView = {
  set(level: number, leave: MarkLeave): Promise<void>;
  tick?(): Promise<void>;
  destroy(): void;
};

export type MarkFxDef = {
  max: number; // the highest level
  create(ctx: MarkContext): MarkView;
};

export const defineMarkFx = (def: MarkFxDef): MarkFxDef => def;
