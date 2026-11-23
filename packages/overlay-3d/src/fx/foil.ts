// Light on the frame metal only: a copy of the frame, whose own alpha is the mask, lit by a shader.
//   mode 'sheen': one slow light band every `period` s, crossing in `sweep` s.
//   mode 'holo':  holographic colours + sparse slow glitter + the band.
// No pointer in OBS: the light drifts on its own, like a card held in a hand (`drift`: periods in s).

import { Sprite } from 'pixi.js';
import { destroyWith } from '../engine/dispose.ts';
import { makeFilter } from '../engine/shader.ts';
import { every } from '../engine/time.ts';
import { defineFx } from './types.ts';

export type FoilParams = {
  mode: 'sheen' | 'holo';
  strength: number;
  period: number;
  sweep: number;
  drift: readonly [number, number];
};

const BODY = `
void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  float a = c.a;
  float lum = dot(c.rgb / max(a, 0.001), vec3(0.299, 0.587, 0.114));
  vec2 p = vLocal;
  float cyc = mod(uTime, uPeriod);
  float x = p.x + p.y * 0.55 - (cyc / uSweep) * 2.4 + 0.5 - uTilt.x * 0.15;
  float band = exp(-x * x * 28.0) * step(cyc, uSweep);
  vec3 light = vec3(band) * (0.25 + 0.5 * lum);
  if (uHolo > 0.5) {
    vec3 rb = hue(fract(p.x * 0.45 + p.y * 0.65 + uTilt.x * 0.35 + uTilt.y * 0.25 + uTime * 0.012));
    float h = hash(floor(p * vec2(110.0, 150.0)));
    float glitter = step(0.988, h) * pow(max(0.0, sin(uTime * 0.9 + h * 60.0)), 10.0) * 2.0;
    light = rb * (0.2 + 0.35 * lum) + vec3(glitter) + vec3(band) * 0.7;
  }
  finalColor = vec4(light * a * uStrength, 0.0);   // premultiplied, alpha 0: pure added light
}`;

export const foil = defineFx<FoilParams>({
  layer: 'frame',
  defaults: { mode: 'sheen', strength: 0.45, period: 9, sweep: 2.6, drift: [33, 42] },
  run({ layer, card, W, H }, p) {
    if (!card.frameTexture) return;
    const metal = new Sprite(card.frameTexture);
    metal.width = W;
    metal.height = H;
    const f = makeFilter(
      'fx-foil',
      BODY,
      {
        uTime: Math.random() * 10,
        uHolo: p.mode === 'holo' ? 1 : 0,
        uStrength: p.strength,
        uPeriod: p.period,
        uSweep: p.sweep,
        uTilt: [0, 0],
      },
      { blend: 'add' },
    );
    metal.filters = [f.filter];
    destroyWith(metal, f.filter);
    layer.addChild(metal);
    const ph = Math.random() * 6.28;
    const [wx, wy] = p.drift.map((s) => (2 * Math.PI) / s) as [number, number];
    return every(metal, (dt, t) => {
      f.u.uTime += dt;
      f.set('uTilt', [Math.sin(t * wx + ph) * 0.7, Math.cos(t * wy + ph) * 0.5]);
    });
  },
});
