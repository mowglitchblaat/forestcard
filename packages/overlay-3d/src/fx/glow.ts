// A soft bloom of the rarity colour behind the card, growing as it fades.

import { Color, Sprite } from 'pixi.js';
import { detach, tween } from '../engine/time.ts';
import { glowTexture } from '../engine/textures.ts';
import { pulse } from './palette.ts';
import { defineFx } from './types.ts';

export type GlowParams = {
  strength: number;
  duration: number; // ms
  grow: readonly [number, number]; // size, in card widths, at start and at end
};

export const glow = defineFx<GlowParams>({
  layer: 'behind',
  defaults: { strength: 0.6, duration: 900, grow: [1.4, 2.2] },
  run({ layer, x, y, cardW, cardH, colour }, p) {
    const s = new Sprite(glowTexture());
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.tint = new Color(colour).toNumber();
    s.blendMode = 'add';
    layer.addChild(s);
    const [g0, g1] = [p.grow[0] ?? 1, p.grow[1] ?? 1];
    detach(
      tween(
        p.duration,
        (u) => {
          const g = g0 + (g1 - g0) * u;
          s.width = cardW * g;
          s.height = cardH * g * 0.75;
          s.alpha = pulse(u) * p.strength;
        },
        'linear',
        s,
      ),
      () => s.destroy(),
    );
  },
});
