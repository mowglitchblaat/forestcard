// Blood spurting from a card (a bleed deals its damage, or is laid: `cut`): a splash thrown on the card
// that dries away, two jets from a wound on the upper card, drops arcing out and falling, a fine spray, a
// few heavy drops. `blood`: particles in normal blending with the drop texture (kit/draw.ts), in `layer`,
// over the cards; (x, y) the card's centre and h its height, in the layer's units.

import { Sprite, type Container } from 'pixi.js';
import type { Particles } from '../engine/particles.ts';
import { tween } from '../engine/time.ts';
import { burst, splatTexture } from '../kit/draw.ts';

const BLOOD = [0xc8101e, 0xe0182a, 0xa80c18, 0x86000f];

export function bloodSpurt(
  layer: Container,
  blood: Particles,
  x: number,
  y: number,
  h: number,
  cut = false,
): void {
  const w = h * 0.72;
  const wx = x + (Math.random() - 0.5) * w * 0.5,
    wy = y - h * (0.05 + Math.random() * 0.2);
  const side = wx < x ? -1 : 1;
  const k = cut ? 0.7 : 1;
  // the splash on the card, thrown on and drying away
  const splat = new Sprite({ texture: splatTexture(), anchor: 0.5 });
  splat.position.set(wx, wy);
  splat.rotation = Math.random() * Math.PI * 2;
  const sz = w * (cut ? 0.5 : 0.65);
  layer.addChildAt(splat, Math.max(0, layer.getChildIndex(blood.box))); // under the drops
  void tween(
    1100,
    (u) => {
      const s0 = sz / splat.texture.width;
      splat.scale.set(s0 * (u < 0.12 ? 0.4 + 0.6 * (u / 0.12) : 1));
      splat.alpha = u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45;
    },
    'linear',
    splat,
  ).then(() => splat.destroy());
  for (const a of [-Math.PI / 2 + side * 0.55, -Math.PI / 2 + side * 1.15])
    burst(blood, {
      x: wx,
      y: wy,
      count: Math.round(36 * k),
      speed: h * 2.6,
      size: h * 0.03,
      tint: BLOOD,
      life: 1.1,
      angle: a,
      spread: 0.45,
      gravity: h * 5.5,
      drag: 0.7,
      stretch: 1.1,
      jitter: w * 0.03,
    });
  burst(blood, {
    x: wx,
    y: wy,
    count: Math.round(34 * k),
    speed: h * 1.5,
    size: h * 0.014,
    tint: BLOOD,
    life: 0.7,
    gravity: h * 4,
    drag: 1.6,
    stretch: 0.8,
    jitter: w * 0.05,
  });
  burst(blood, {
    x: wx,
    y: wy,
    count: Math.round(7 * k),
    speed: h * 1.5,
    size: h * 0.05,
    tint: [0xa80c18, 0xc8101e],
    life: 1.2,
    angle: -Math.PI / 2 + side * 0.8,
    spread: 1.2,
    gravity: h * 6,
    drag: 0.4,
    stretch: 0.5,
  });
}
