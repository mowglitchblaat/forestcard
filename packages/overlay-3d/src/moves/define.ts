// A move: something that happens to a card once, as a combat shows it (docs/plans/overlay-3d.md, "Coup
// ponctuel"): a dodge, a block, a heal… It plays on the card, then the card is as it was. A move does not
// read the engine's events: the combat scene turns an event into play(kind).
// It draws in card units (W x H, the face in card.box), on two layers that live for the move only:
// `behind` the card (afterimages, trails) and `over` it. It may move the card itself (card.root's pivot,
// angle, skew), and puts them back when it ends.

import type { Application, Container } from 'pixi.js';
import type { Card } from '../card/card.ts';

export type MoveContext = {
  card: Card;
  app: Application;
  behind: Container;
  over: Container;
  away: -1 | 1; // the screen side away from the opponent: where a dodge steps
};

export type MoveFxDef = {
  play(ctx: MoveContext): Promise<void>;
};

export const defineMoveFx = (def: MoveFxDef): MoveFxDef => def;
