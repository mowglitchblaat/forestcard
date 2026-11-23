// Caustics: light rippling over the drawing, as through water, between the drawing and the frame (so
// the frame cuts it at the window). A web of bright lines: the ridges of two layers of noise, warped by a
// slower noise and drifting apart, sharpened. A new seed and drift per card: two cards never ripple alike.

import { cornerQuad, makeMesh } from '../engine/shader.ts';
import { every } from '../engine/time.ts';
import { rgb } from '../engine/textures.ts';
import { defineFx } from './types.ts';

export type CausticsParams = {
  strength: number;
  scale: number; // cells across the card
  speed: number;
};

const BODY = `
float ridge(vec2 p) { return pow(1.0 - abs(noise(p) * 2.0 - 1.0), 4.5); }
void main(void) {
  vec2 p = vUV * vec2(uScale, uScale * uAspect);
  float t = uTime * uSpeed;
  vec2 w = vec2(fbm(p * 0.5 + uDrift * t * 0.4 + uSeed), fbm(p * 0.5 - uDrift.yx * t * 0.3 + uSeed + 3.1)) - 0.5;
  float c = ridge(p + w * 1.6 + uDrift * t) + ridge(p * 1.3 - w * 1.2 - uDrift.yx * t * 0.8 + 7.3);
  c = pow(c * 0.7, 1.5);
  // the light comes from above: a little stronger at the top of the card
  float fall = mix(0.55, 1.0, 1.0 - vUV.y);
  vec3 tint = mix(uTint, vec3(1.0), 0.35);
  finalColor = vec4(tint * c * fall * uStrength, 0.0);   // added light
}`;

export const caustics = defineFx<CausticsParams>({
  layer: 'under',
  defaults: { strength: 0.1, scale: 5, speed: 0.18 },
  run({ layer, W, H, colour }, p) {
    const angle = Math.random() * Math.PI * 2;
    const m = makeMesh(
      'fx-caustics',
      BODY,
      {
        uTime: 0,
        uSeed: Math.random() * 50,
        uDrift: [Math.cos(angle), Math.sin(angle)],
        uScale: p.scale,
        uSpeed: p.speed,
        uAspect: H / W,
        uStrength: p.strength,
        uTint: rgb(colour),
      },
      { geometry: cornerQuad() },
    );
    m.mesh.scale.set(W, H);
    layer.addChild(m.mesh);
    return every(m.mesh, (dt) => {
      m.u.uTime += dt;
    });
  },
});
