// How a card shows on stream, for every scene. Plain data, like rarities.ts.
//
// No plaque by default: its lines and explanations are small and dense, and do not read at an overlay's
// size. An effect shows when it acts instead: its short name pops on the card (Card.announce). A flat
// card keeps its plaque, which is in its image.

import type { Hidden } from '../card/card.ts';

export type DisplayConfig = {
  hidden: Hidden; // groups of a built card not drawn
};

export const DISPLAY: DisplayConfig = {
  hidden: { plaque: true },
};
