// Epic: the back crystallises into shards (Voronoi cells). Each shard leaves in turn, from the origin
// outwards; its seams light up in the rarity colour before it slides away.

import { defineRevealShader } from './types.ts';

export type CrystalParams = {
  cells: number; // shards across the card's width
  spread: number; // 0..1: how much the order follows the distance to the origin (vs chance)
  shardTime: number; // how long one shard takes to go, in progress units
  whiten: number; // 0..1: seams' colour mixed with white
};

export const crystal = defineRevealShader<CrystalParams>({
  uniforms: { cells: 'uCells', spread: 'uSpread', shardTime: 'uShardTime', whiten: 'uWhiten' },
  defaults: { cells: 8, spread: 0.75, shardTime: 0.22, whiten: 0.15 },
  body: `
void main(void) {
  vec2 g = vLocal * vec2(uCells, uCells * uAspect);
  vec2 i = floor(g), f = fract(g);
  float md = 8.0, md2 = 8.0; vec2 mc = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y)), r = o + hash2(i + o) - f;
    float d = dot(r, r);
    if (d < md) { md2 = md; md = d; mc = i + o; } else if (d < md2) md2 = d;
  }
  float seam = sqrt(md2) - sqrt(md);
  float h = hash(mc);
  vec2 cc = (mc + hash2(mc)) / vec2(uCells, uCells * uAspect);
  float d = distance(cc * vec2(1.0, uAspect), uOrigin * vec2(1.0, uAspect)) / uAspect;
  float th = d * uSpread + h * (1.0 - uSpread);
  float t = uProgress * 1.25;
  float k = clamp((t - th) / uShardTime, 0.0, 1.0);
  float charge = clamp((t + 0.25 - th) / 0.25, 0.0, 1.0) * (1.0 - k);
  vec2 drift = vec2((h - 0.5) * 0.08, 0.10 + h * 0.1) * k * k;
  vec4 c = sampleAt(vTextureCoord - toTex(drift));
  float a = c.a * (1.0 - k) * (1.0 - step(0.999, k));
  vec3 glow = mix(uColor, vec3(1.0), uWhiten);
  float line = (1.0 - smoothstep(0.0, 0.06, seam)) * charge;
  vec3 col = c.rgb * (1.0 - k) * (1.0 + charge * 0.6) + glow * line * 1.8 * c.a + glow * k * (1.0 - k) * 1.4 * c.a;
  finalColor = vec4(col, max(a, line * c.a * 0.9));
}`,
});
