// GGEZ: a digital glitch. Slices tear sideways, colours split, blocks drop out (nearest to the origin
// first) with rainbow edges, until nothing is left.

import { defineRevealShader } from './types.ts';

export type GlitchParams = {
  blocks: readonly [number, number]; // blocks across and down
  split: number; // colour split at mid-reveal, fraction of the card
  tear: number; // sideways tearing of the slices, fraction of the card
  rate: number; // glitch changes per second
};

export const glitch = defineRevealShader<GlitchParams>({
  uniforms: { blocks: 'uBlocks', split: 'uSplit', tear: 'uTear', rate: 'uRate' },
  defaults: { blocks: [10, 14], split: 0.03, tear: 0.25, rate: 18 },
  body: `
void main(void) {
  float p = uProgress;
  float tick = floor(uTime * uRate);
  float band = floor(vLocal.y * (12.0 + 30.0 * hash(vec2(tick, 3.0))));
  float shake = (hash(vec2(band, tick)) - 0.5) * uTear * sin(p * 3.1416) * step(0.55, hash(vec2(band, tick + 7.0)));
  vec2 o = vec2(shake, 0.0);
  float split = 0.012 + uSplit * sin(p * 3.1416);
  float r = sampleAt(vTextureCoord + toTex(o + vec2(split, 0.0))).r;
  vec4 g = sampleAt(vTextureCoord + toTex(o));
  float b = sampleAt(vTextureCoord + toTex(o - vec2(split, 0.0))).b;
  vec2 blk = floor(vLocal * uBlocks);
  float d = distance(vLocal * vec2(1.0, uAspect), uOrigin * vec2(1.0, uAspect)) / uAspect;
  float gone = step(d * 0.55 + hash(blk) * 0.45, p * 1.15);
  float scan = 0.85 + 0.15 * sin(vLocal.y * 900.0);
  vec3 col = vec3(r, g.g, b) * scan;
  vec3 rb = hue(fract(vLocal.y * 2.0 + uTime * 0.8));
  float edgeBlk = step(d * 0.55 + hash(blk) * 0.45, p * 1.15 + 0.08) * (1.0 - gone);
  col = mix(col, rb * g.a, edgeBlk * 0.8);
  finalColor = vec4(col * (1.0 - gone), g.a * (1.0 - gone));
}`,
});
