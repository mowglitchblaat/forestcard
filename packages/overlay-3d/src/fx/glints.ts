// Glints twinkling over the face, clipped by the card.

import { Particles } from '../engine/particles.ts';
import { detach, wait } from '../engine/time.ts';
import { tintOf } from './palette.ts';
import { defineFx } from './types.ts';

export type GlintsParams = { count: number };

export const glints = defineFx<GlintsParams>({
  layer: 'over',
  defaults: { count: 12 },
  run(ctx, p) {
    const ps = new Particles(ctx.layer);
    for (let i = 0; i < p.count; i++) {
      ps.add({
        x: Math.random() * ctx.W,
        y: Math.random() * ctx.H,
        vx: 0,
        vy: 0,
        life: 0.4 + Math.random() * 0.9,
        size: ctx.W * (0.03 + Math.random() * 0.07),
        tint: tintOf(ctx, i),
        drag: 0,
      });
    }
    detach(wait(1500), () => ps.stop());
  },
});
