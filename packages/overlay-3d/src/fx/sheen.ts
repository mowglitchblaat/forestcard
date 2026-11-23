// One light sweep across the whole face (a mesh in the card's own space, clipped by the card).

import { cornerQuad, makeMesh } from '../engine/shader.ts';
import { detach, tween } from '../engine/time.ts';
import { rgb } from '../engine/textures.ts';
import { defineFx } from './types.ts';

export type SheenParams = { duration: number };

const BODY = `
void main(void) {
  float x = vUV.x + vUV.y * 0.6 - uPos;
  float band = exp(-x * x * 60.0) + 0.35 * exp(-(x + 0.12) * (x + 0.12) * 200.0);
  finalColor = vec4(mix(uSheenColor, vec3(1.0), 0.5) * band * 0.8, 0.0);
}`;

export const sheen = defineFx<SheenParams>({
  layer: 'over',
  defaults: { duration: 650 },
  run({ layer, W, H, colour }, p) {
    const m = makeMesh(
      'fx-sheen',
      BODY,
      { uPos: -0.6, uSheenColor: rgb(colour) },
      { geometry: cornerQuad() },
    );
    m.mesh.scale.set(W, H);
    layer.addChild(m.mesh);
    detach(
      tween(
        p.duration,
        (u) => {
          m.u.uPos = -0.6 + u * 2.4;
        },
        'linear',
        m.mesh,
      ),
      () => m.mesh.destroy(),
    );
  },
});
