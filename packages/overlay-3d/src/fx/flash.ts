// A white flash over the face, clipped by the card.

import { Graphics } from 'pixi.js';
import { detach, tween } from '../engine/time.ts';
import { defineFx } from './types.ts';

export type FlashParams = { strength: number };

export const flash = defineFx<FlashParams>({
  layer: 'over',
  defaults: { strength: 0.5 },
  run({ layer, W, H }, p) {
    const g = new Graphics().rect(0, 0, W, H).fill(0xffffff);
    g.blendMode = 'add';
    layer.addChild(g);
    detach(
      tween(
        450 + p.strength * 300,
        (u) => {
          g.alpha = p.strength * (1 - u) * (1 - u);
        },
        'linear',
        g,
      ),
      () => g.destroy(),
    );
  },
});
