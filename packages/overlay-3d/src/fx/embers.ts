// Embers drifting up through the drawing, under the frame, over a slow breathing glow.
// The card clips them: they disappear behind the frame's metal, which a flat image cannot do.

import { Color, Sprite } from 'pixi.js';
import { every } from '../engine/time.ts';
import { glowTexture, hot, sparkTexture } from '../engine/textures.ts';
import { between } from './palette.ts';
import { defineFx } from './types.ts';

export type EmbersParams = {
  count: number;
  speed: readonly [number, number]; // card units per second
  size: readonly [number, number]; // card units
  glow: number; // opacity of the glow behind them
};

export const embers = defineFx<EmbersParams>({
  layer: 'under',
  defaults: { count: 36, speed: [40, 150], size: [18, 64], glow: 0.22 },
  run({ layer, W, H, colour }, p) {
    const col = new Color(colour).toNumber();
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.position.set(W / 2, H * 0.7);
    glow.width = W * 1.3;
    glow.height = H * 0.7;
    glow.tint = col;
    glow.blendMode = 'add';
    layer.addChild(glow);
    const motes = Array.from({ length: p.count }, () => {
      const s = new Sprite(sparkTexture());
      s.anchor.set(0.5);
      s.tint = hot(col, 0.35 + Math.random() * 0.4);
      s.blendMode = 'add';
      layer.addChild(s);
      return {
        s,
        x: Math.random() * W,
        y: H * Math.random(),
        v: between(p.speed),
        size: between(p.size),
        ph: Math.random() * 6.28,
        w: 0.6 + Math.random(),
      };
    });
    return every(glow, (dt, t) => {
      glow.alpha = p.glow * (1 + 0.35 * Math.sin(t * 1.3));
      for (const m of motes) {
        m.y -= m.v * dt;
        if (m.y < -40) {
          m.y = H + 40;
          m.x = Math.random() * W;
        }
        const life = m.y / H; // brighter low, fading as it rises
        m.s.position.set(m.x + Math.sin(t * m.w + m.ph) * 30, m.y);
        m.s.width = m.s.height = m.size * (0.5 + life * 0.6);
        m.s.alpha =
          Math.max(0, Math.min(1, life * 1.4)) * (0.55 + 0.45 * Math.sin(t * 6 * m.w + m.ph));
      }
    });
  },
});
