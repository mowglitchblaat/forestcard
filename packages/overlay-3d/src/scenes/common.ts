// Pieces shared by the scenes: a card dressed by its rarity, a row or a grid of cards, the layers
// around them.

import { AdvancedBloomFilter } from 'pixi-filters';
import { Container, type Application } from 'pixi.js';
import type { CategoryStyles, Compo } from '@forestcard/layout';
import { Card, type CardData, type Hidden } from '../card/card.ts';
import type { Textures } from '../card/draw.ts';
import { RARITIES } from '../config/rarities.ts';
import { destroyWith } from '../engine/dispose.ts';
import type { RarityConfig } from '../config/types.ts';

export type Deps = { textures: Textures; styles: CategoryStyles };

export const rarityOf = (card: CardData): RarityConfig => RARITIES[card.tier];

// A Card dressed by its rarity's configuration (colour, palette, ambient effects).
export function dressedCard(
  card: CardData,
  deps: Deps,
  o: {
    compo?: Partial<Compo> | null;
    textResolution?: number;
    hidden?: Hidden;
    back?: string;
  } = {},
): Card {
  const r = rarityOf(card);
  return new Card({
    card,
    compo: o.compo,
    styles: deps.styles,
    textures: deps.textures,
    colour: r.colour,
    rainbow: r.rainbow,
    ambient: r.ambient,
    textResolution: o.textResolution,
    hidden: o.hidden,
    back: o.back,
  });
}

// Text resolution matching the card's size on screen: big fonts at card scale, rendered at screen scale.
export const textResolutionFor = (scale: number, app: Application): number =>
  Math.max(0.25, scale * app.renderer.resolution);

/** `box`: the grid's bounding box (the cards, not the area). */
export { gridLayout, type Placement } from './grid.ts';

/**
 * The layers of a scene with cards: `behind` under every card (reveal effects never cover a neighbour),
 * `cards` above it. Both share the parent's coordinates, so an effect and its card share their origin.
 */
export function cardLayers(
  parent: Container,
  { bloom = true } = {},
): { behind: Container; cards: Container } {
  const behind = new Container({ label: 'behind' }),
    cards = new Container({ label: 'cards' });
  parent.addChild(behind, cards);
  if (bloom) {
    const f = new AdvancedBloomFilter({
      threshold: 0.2,
      bloomScale: 1.4,
      brightness: 1,
      blur: 6,
      quality: 5,
    });
    behind.filters = [f];
    destroyWith(behind, f);
  }
  return { behind, cards };
}
