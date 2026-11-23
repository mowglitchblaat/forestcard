// The drawing ripples with heat under the frame: a displacement filter on the drawing only, fed by a
// scrolling noise map. The frame above stays sharp.
// The map is a plain Sprite moved every frame: DisplacementFilter reads the sprite's texture through the
// sprite's transform (a TilingSprite's tilePosition does not reach it), and the noise texture repeats.

import { DisplacementFilter, Sprite } from 'pixi.js';
import { every } from '../engine/time.ts';
import { noiseTexture } from '../engine/textures.ts';
import { defineFx } from './types.ts';

export type HeatParams = {
  strength: number; // displacement, pixels
  scale: number; // size of the ripples (the noise map's scale)
  speed: readonly [number, number]; // scroll of the noise, units per ms
};

export const heat = defineFx<HeatParams>({
  layer: 'drawing',
  defaults: { strength: 4, scale: 6, speed: [0.03, -0.12] },
  run({ layer, card }, p) {
    // the map lives next to the filtered drawing, not inside it
    const host = card.groups.underFrame;
    if (!host) return;
    const map = new Sprite(noiseTexture());
    map.scale.set(p.scale);
    map.renderable = false; // read by the filter, never drawn
    host.addChild(map);
    const f = new DisplacementFilter({ sprite: map, scale: p.strength });
    layer.filters = [...(layer.filters ?? []), f];
    const tick = every(map, (dt) => {
      map.x += dt * 1000 * (p.speed[0] ?? 0);
      map.y += dt * 1000 * (p.speed[1] ?? 0);
    });
    return {
      stop() {
        tick.stop();
        if (!layer.destroyed) layer.filters = (layer.filters ?? []).filter((x) => x !== f);
        f.destroy();
      },
    };
  },
});
