// Sparks bursting out from the card's edges, behind it, falling under gravity; plus dust that lingers
// and rises for the high rarities.

import { Particles } from '../engine/particles.ts';
import { detach, wait } from '../engine/time.ts';
import { between, tintOf } from './palette.ts';
import { defineFx } from './types.ts';

export type SparksParams = {
  count: number;
  speed: readonly [number, number]; // card heights per second
  life: readonly [number, number]; // seconds
  size: readonly [number, number]; // card widths
  gravity: number; // card heights per second²
  linger: number; // 0..1: how much dust stays after the burst
};

export const sparks = defineFx<SparksParams>({
  layer: 'behind',
  defaults: {
    count: 100,
    speed: [1.5, 4],
    life: [0.6, 1.5],
    size: [0.02, 0.07],
    gravity: 0.9,
    linger: 0,
  },
  run(ctx, p) {
    const { layer, x, y, cardW, cardH } = ctx;
    const ps = new Particles(layer);
    for (let i = 0; i < p.count; i++) {
      const a = Math.random() * Math.PI * 2,
        sp = cardH * between(p.speed);
      ps.add({
        x: x + Math.cos(a) * cardW * 0.45,
        y: y + Math.sin(a) * cardH * 0.45,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: between(p.life),
        size: cardW * between(p.size),
        tint: tintOf(ctx, i),
        drag: 3,
        gravity: cardH * p.gravity,
        stretch: 2.2,
      });
    }
    for (let i = 0; i < p.linger * 120; i++) {
      const a = Math.random() * Math.PI * 2,
        d = cardH * (0.5 + Math.random() * 0.4);
      ps.add({
        x: x + Math.cos(a) * d * 0.7,
        y: y + Math.sin(a) * d,
        vx: 0,
        vy: -cardH * (0.05 + Math.random() * 0.1),
        life: 1.5 + Math.random() * 2,
        size: cardW * (0.02 + Math.random() * 0.03),
        tint: tintOf(ctx, i),
        drag: 0.2,
      });
    }
    detach(wait(5000), () => ps.stop());
  },
});
