// Legendary: the back burns from a point like a sheet of paper, not as a growing circle:
// - the distance to the fire is measured on warped coordinates (domain warping): the front advances in
//   uneven fingers and leaves islands that burn late;
// - two more spots catch fire later (positions drawn from uSeed);
// - a thin incandescent band, charring just ahead of it, ragged embers just behind.

import { defineRevealShader } from './types.ts';

export type FireParams = {
  warp: number; // how uneven the front is
  rim: number; // width of the incandescent band
  char: number; // width of the charring ahead of it
  spotDelay: readonly [number, number]; // how late the two other spots catch fire
};

export const fire = defineRevealShader<FireParams>({
  uniforms: { warp: 'uWarp', rim: 'uRim', char: 'uChar', spotDelay: 'uSpotDelay' },
  defaults: { warp: 0.45, rim: 0.04, char: 0.13, spotDelay: [0.45, 0.7] },
  body: `
void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  vec2 q = vec2(vLocal.x, vLocal.y * uAspect);
  vec2 warp = vec2(fbm(q * 2.5 + uSeed), fbm(q * 2.5 + uSeed + 5.2)) - 0.5;
  vec2 w = q + warp * uWarp;
  float d0 = distance(w, vec2(uOrigin.x, uOrigin.y * uAspect));
  vec2 o1 = hash2(vec2(uSeed, 1.0)) * vec2(0.8, 0.8 * uAspect) + vec2(0.1, 0.1 * uAspect);
  vec2 o2 = hash2(vec2(uSeed, 2.0)) * vec2(0.8, 0.8 * uAspect) + vec2(0.1, 0.1 * uAspect);
  float d = min(d0, min(distance(w, o1) + uSpotDelay.x, distance(w, o2) + uSpotDelay.y)) / uAspect;
  float n = fbm(vLocal * vec2(6.0, 6.0 * uAspect) + uTime * 0.1);
  float field = d + n * 0.3;
  float t = uProgress * 1.45;
  float keep = smoothstep(t - 0.01, t + 0.01, field);
  float rim = 1.0 - smoothstep(t, t + uRim, field);
  float ember = smoothstep(t - 0.05, t - 0.01, field);
  float charred = 1.0 - smoothstep(t, t + uChar, field);
  vec3 heat = mix(vec3(1.0, 0.9, 0.62), uColor, 0.4);
  float flicker = 0.8 + 0.4 * noise(vLocal * 40.0 + uTime * 6.0);
  vec3 col = c.rgb * keep * (1.0 - charred * 0.75);
  col += heat * rim * rim * keep * 2.3 * flicker * c.a;
  float glow = ember * (1.0 - keep) * smoothstep(0.45, 0.75, n) * c.a;
  finalColor = vec4(col + heat * glow * 1.3, max(c.a * keep, glow * 0.9));
}`,
});
