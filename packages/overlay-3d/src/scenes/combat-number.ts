// A damage or healing number, struck on a fighter: a figure of living matter, not a text on the screen.
// A white text drawn through a filter that gives it its matter:
//   molten:    hot at its heart, darker towards its edges (how deep a pixel lies in the stroke is read
//              from the glyph around it), a grain flickering through it, a dark halo setting it off any
//              picture;
//   the hit:   it lands big and shimmers with heat, a streak of light and a star of spikes flash behind
//              it, sparks of its matter fly off (more for a heavy hit, which also trembles);
//   then:      it cools down and drifts up a little; it burns away from within, a glowing edge eating
//              through it, and its embers fly off.
// Each source of damage has its colour (MATTERS): steel for a blow, blood, acid, fire, the Knell's
// violet, ice…; healing is mint light.

import { Container, Text } from 'pixi.js';
import { COMBAT } from '../config/combat.ts';
import { destroyWith } from '../engine/dispose.ts';
import type { Particles } from '../engine/particles.ts';
import { makeFilter, makeMesh } from '../engine/shader.ts';
import { detach, easing, tween } from '../engine/time.ts';

type RGB = [number, number, number];
export type Matter = { hot: RGB; mid: RGB; cool: RGB };

const hex = (c: number): RGB => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const matter = (hot: number, mid: number, cool: number): Matter => ({
  hot: hex(hot),
  mid: hex(mid),
  cool: hex(cool),
});

// By the damage's source (the damage line's `k`), each its own colour: `hit` for a plain attack (no
// `k`), `heavy` for a heavy one, `heal` for healing.
export const MATTERS = {
  hit: matter(0xffffff, 0xc9d6e4, 0x2c3644), // steel white
  heavy: matter(0xffffff, 0xffd27a, 0x6a3c06), // white, a golden heart
  saignement: matter(0xffc4c4, 0xd8121e, 0x3a0006), // blood red
  poison: matter(0xf2ffc0, 0x7ee21e, 0x1c4606), // acid green
  brulure: matter(0xfff0b0, 0xff8a14, 0x6e1800), // fire orange
  detonation: matter(0xffffe0, 0xffd21e, 0x6a4200), // explosion yellow
  glas: matter(0xf0e4ff, 0xa278ff, 0x2a0a5a), // the Knell's violet
  gel: matter(0xf2fbff, 0x7fd4ff, 0x0c3a60), // ice blue
  fracture: matter(0xfffbe8, 0xeed68a, 0x584410), // bone
  choc: matter(0xfff0ea, 0xff8f78, 0x6a1a14), // thermal shock
  renvoi: matter(0xffffff, 0xa8c8ff, 0x1e3260), // mirror silver-blue
  execution: matter(0xffb4b4, 0x8a0a14, 0x160004), // near-black red
  souffle: matter(0xf0ffff, 0x8eeef0, 0x0e4a52), // pale breath
  mache: matter(0xffd8f0, 0xc8287e, 0x40062a), // the swallower's
  heal: matter(0xeafff6, 0x4ee6b0, 0x0a4a3a), // mint
} as const satisfies Record<string, Matter>;

const MOLTEN = `
void main(void){
  vec2 uv = vTextureCoord;
  // heat shimmer, strong as it lands
  vec2 wob = vec2(noise(vLocal * 9.0 + vec2(0.0, uTime * 4.0)), noise(vLocal * 9.0 + vec2(5.2, uTime * 3.3))) - 0.5;
  uv += toTex(wob * 0.018 * uHeat);
  float a = sampleAt(uv).a;
  // how deep in the stroke: the glyph around this pixel, near and further
  float near = 0.0, far = 0.0;
  for (int i = 0; i < 8; i++) {
    float t = float(i) * 0.7854;
    vec2 d = vec2(cos(t), sin(t) * 2.2);
    near += sampleAt(uv + toTex(d * 0.012)).a;
    far += sampleAt(uv + toTex(d * 0.035)).a;
  }
  near /= 8.0; far /= 8.0;
  float depth = a * (0.5 * near + 0.5 * far);
  // it burns away from within: a noise threshold rising, a glowing edge where it eats
  float n = fbm(vLocal * vec2(16.0, 8.0) + uSeed) * 0.75 + noise(vLocal * vec2(60.0, 30.0)) * 0.25;
  float eaten = uBurn > 0.0 ? 1.0 - smoothstep(uBurn - 0.012, uBurn + 0.012, n) : 0.0;
  float rim = uBurn > 0.0 ? (1.0 - smoothstep(0.0, 0.035, n - uBurn)) * step(uBurn - 0.012, n) : 0.0;
  // molten: hot at its heart, cooler to its edges; the heat fades as it cools
  vec3 col = mix(uCool, uMid, smoothstep(0.1, 0.45, depth));
  col = mix(col, uHot, smoothstep(0.4, 0.85, depth) * (0.45 + 0.55 * uHeat));
  col *= 0.82 + 0.36 * noise(vLocal * vec2(46.0, 22.0) + uTime * 2.5);
  // the burning edge: the matter's own glow, not white
  col = mix(col, uMid * 1.6 + uHot * 0.3, rim);
  float body = a * (1.0 - eaten) + a * rim;
  // a dark halo off the stroke: it reads on any picture
  float halo = (1.0 - a) * smoothstep(0.0, 0.5, far) * 0.55 * (1.0 - uBurn);
  float alpha = clamp(body, 0.0, 1.0);
  finalColor = vec4(col * alpha, alpha + halo * (1.0 - alpha));
}`;

// The flash behind it as it lands: a horizontal streak of light and a star of thin spikes. Added light.
const FLARE = `
void main(void){
  vec2 p = vUV * 2.0 - 1.0;
  float streak = exp(-p.y * p.y * 90.0) * exp(-abs(p.x) * 2.2);
  float ang = atan(p.y * 2.6, p.x), r = length(vec2(p.x, p.y * 2.6));
  float spikes = pow(max(0.0, cos(ang * 4.0 + uSeed)), 40.0) * exp(-r * 3.5);
  float core = exp(-r * r * 30.0);
  vec3 light = (uColour + 0.3) * (streak * 1.2 + spikes * 0.9) + vec3(1.0) * core * 0.7;
  finalColor = vec4(light * uAmt, 0.0);
}`;

export function strikeNumber(
  layer: Container,
  sparks: Particles,
  o: { x: number; y: number; label: string; matter: Matter; big: boolean; resolution: number },
): void {
  const N = COMBAT.number,
    M = o.matter,
    size = N.size * (o.big ? N.big : 1);
  const t = new Text({
    text: o.label,
    anchor: 0.5,
    resolution: o.resolution,
    style: {
      fontFamily: ['Rubik', 'Arial', 'sans-serif'],
      fontWeight: '800',
      fontSize: size,
      letterSpacing: size * 0.02,
      fill: 0xffffff,
    },
  });
  const f = makeFilter(
    'combat-number',
    MOLTEN,
    {
      uTime: 0,
      uHeat: 1,
      uBurn: 0,
      uSeed: Math.random() * 20,
      uHot: M.hot,
      uMid: M.mid,
      uCool: M.cool,
    },
    { textureHelpers: true },
  );
  f.filter.padding = size * 0.35;
  t.filters = [f.filter];
  const flare = makeMesh('combat-number-flare', FLARE, {
    uColour: M.mid,
    uAmt: 1,
    uSeed: Math.random() * 10,
  });
  flare.mesh.scale.set(size * 4.2, size * 1.6);
  const box = new Container({ label: 'number' });
  box.addChild(flare.mesh, t);
  destroyWith(box, f.filter);
  box.position.set(o.x, o.y);
  box.scale.set(N.land);
  layer.addChild(box);
  const toNumber = (c: RGB) => ((c[0] * 255) << 16) | ((c[1] * 255) << 8) | (c[2] * 255);
  const spray = (count: number, speed: number, at: () => { x: number; y: number }) => {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2,
        v = size * speed * (0.5 + Math.random());
      const p = at();
      sparks.add({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.6 - size * 1.2,
        life: 0.35 + Math.random() * 0.45,
        size: size * (0.1 + Math.random() * 0.1),
        tint: toNumber(Math.random() < 0.4 ? M.hot : M.mid),
        drag: 3.5,
        gravity: size * 8,
        stretch: 1.4,
      });
    }
  };
  spray(o.big ? 18 : 9, 4, () => ({ x: o.x, y: o.y }));
  const land = easing('out-cubic');
  let embers = 0;
  detach(
    tween(
      N.ms,
      (u) => {
        f.u.uTime = (u * N.ms) / 1000;
        box.y = o.y - N.rise * land(Math.min(1, u * 1.4));
        box.x = o.x + (o.big && u < 0.25 ? Math.sin(u * 120) * size * 0.05 * (1 - u / 0.25) : 0);
        box.scale.set(u < 0.1 ? N.land + (1 - N.land) * land(u / 0.1) : 1);
        flare.u.uAmt = Math.max(0, 1 - u / 0.22);
        f.u.uHeat = Math.max(0, 1 - u / 0.45);
        // the last third: it burns away, its embers flying off
        const burn = Math.max(0, (u - 0.62) / 0.38);
        f.u.uBurn = burn * 1.05;
        const due = Math.floor(burn * (o.big ? 16 : 10));
        if (due > embers) {
          const w = t.width * box.scale.x,
            h = t.height * box.scale.y;
          spray(due - embers, 1.2, () => ({
            x: box.x + (Math.random() - 0.5) * w,
            y: box.y + (Math.random() - 0.5) * h * 0.6,
          }));
          embers = due;
        }
      },
      'linear',
      box,
    ),
    () => box.destroy({ children: true }),
  );
}
