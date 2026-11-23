// The whole scene refracts around the card (pixi-filters ShockwaveFilter). Nothing is drawn over the
// neighbours: they wobble.
// The filter reads its centre and lengths in screen (CSS) pixels, from the corner of the filtered area:
// its shader divides them by uInputSize, the input texture's size in CSS pixels (Pixi 8 FilterSystem:
// uInputSize = input.source.width, which TexturePool sets to its pixel width / resolution). Not physical
// pixels: multiplying by the renderer's resolution moved the wave off its card at 150-200 % display
// scaling. The area is pinned to the screen during the wave (effects pushing the scene past the screen
// edge would move its corner): filterArea is in the layer's coordinates, hence the screen's corners
// brought back into them. Lengths (amplitude in layer pixels, wavelength and speed in card heights) go to
// screen pixels through the layer's scale on screen (the stage, see engine/stage.ts).

import { Rectangle } from 'pixi.js';
import { ShockwaveFilter } from 'pixi-filters';
import { detach, tween } from '../engine/time.ts';
import { defineFx } from './types.ts';

export type ShockwaveParams = {
  amplitude: number; // pixels
  wavelength: number; // card heights
  speed: number; // card heights per second
  duration: number; // ms
  brightness: number;
};

export const shockwave = defineFx<ShockwaveParams>({
  layer: 'scene',
  defaults: { amplitude: 20, wavelength: 0.6, speed: 2.2, duration: 900, brightness: 1.15 },
  run({ layer, app, card, cardH }, p) {
    if (!app) return;
    const screen = app.renderer.screen,
      g = card.root.getGlobalPosition();
    const k = layer.worldTransform.a; // layer pixels -> screen pixels
    const f = new ShockwaveFilter({
      center: { x: g.x, y: g.y },
      amplitude: p.amplitude * k,
      wavelength: cardH * p.wavelength * k,
      speed: cardH * p.speed * k,
      brightness: p.brightness,
      radius: -1,
    });
    const tl = layer.toLocal({ x: 0, y: 0 }),
      br = layer.toLocal({ x: screen.width, y: screen.height });
    layer.filterArea = new Rectangle(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    layer.filters = [...(layer.filters ?? []), f];
    detach(
      tween(
        p.duration,
        (u) => {
          f.time = (u * p.duration) / 1000;
          f.amplitude = p.amplitude * k * (1 - u);
        },
        'linear',
        layer,
      ),
      () => {
        if (layer.destroyed) return f.destroy();
        const rest = (layer.filters ?? []).filter((x) => x !== f);
        layer.filters = rest.length ? rest : null;
        if (!rest.length) layer.filterArea = undefined;
        f.destroy();
      },
    );
  },
});
