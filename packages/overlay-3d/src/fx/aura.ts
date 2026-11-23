// Light pouring out from behind the card: soft shafts whose angles drift (angular noise), energy
// streaming outward (noise sampled along the radius), a twist growing with the rarity.
// A MESH centred on the card, not a filter: a filter's coordinates span its visible area, which the
// screen edge clips, and the aura's centre slid off the card. Random start angle and turning direction:
// two auras never start alike.

import type { ColorSource, Container } from 'pixi.js';
import { makeMesh } from '../engine/shader.ts';
import { detach, every, tween } from '../engine/time.ts';
import { hot, rgb } from '../engine/textures.ts';
import { pulse } from './palette.ts';
import { defineFx } from './types.ts';

export type AuraParams = {
  intensity: number;
  twist: number;
  size: number; // in card heights
  duration: number; // ms
};

const BODY = `
void main(void) {
  vec2 p = vUV * 2.0 - 1.0;                  // (0,0) = centre of the quad = centre of the card
  float r = length(p);
  float ang = atan(p.y, p.x) + uAngle0 + uSpin * (uTwist * r * 1.4 + uTime * 0.05);
  vec2 dir = vec2(cos(ang), sin(ang));
  float shafts = smoothstep(0.35, 0.85, fbm(dir * 2.2 + vec2(uSeed, uTime * 0.12)));
  float fine = fbm(dir * 7.0 + vec2(uTime * 0.2, uSeed));
  float stream = fbm(p * 3.0 - dir * uTime * 0.9 + uSeed);
  float fall = exp(-r * r * 3.2) * (1.0 - smoothstep(0.75, 1.0, r));
  float core = exp(-r * r * 22.0);
  vec3 col = uAuraColor;
  if (uRainbow > 0.5) col = mix(uAuraColor, hue(fract(ang / 6.2832 + uTime * 0.03)), 0.7);
  vec3 light = col * (shafts * (0.55 + 0.45 * fine) * (0.5 + 0.7 * stream)) * fall * 1.6 + mix(col, vec3(1.0), 0.6) * core * 0.9;
  finalColor = vec4(light * uIntensity, 0.0);
}`;

export type AuraHandle = { intensity: number; readonly owner: Container; destroy(): void };

// Also used by the booster's pack: an aura not tied to a card.
export function auraMesh(
  layer: Container,
  o: { x: number; y: number; size: number; colour: ColorSource; rainbow?: boolean; twist?: number },
): AuraHandle {
  const m = makeMesh('fx-aura', BODY, {
    uTime: 0,
    uIntensity: 0,
    uAuraColor: rgb(o.colour),
    uRainbow: o.rainbow ? 1 : 0,
    uTwist: o.twist ?? 0,
    uSeed: Math.random() * 50,
    uAngle0: Math.random() * Math.PI * 2,
    uSpin: Math.random() < 0.5 ? -1 : 1,
  });
  m.mesh.position.set(o.x, o.y);
  m.mesh.scale.set(o.size);
  layer.addChild(m.mesh);
  const tick = every(m.mesh, (dt) => {
    m.u.uTime += dt;
  });
  return {
    owner: m.mesh,
    get intensity() {
      return m.u.uIntensity;
    },
    set intensity(v: number) {
      m.u.uIntensity = v;
    },
    destroy() {
      tick.stop();
      m.mesh.destroy();
    },
  };
}

export const aura = defineFx<AuraParams>({
  layer: 'behind',
  defaults: { intensity: 0.8, twist: 0, size: 2.6, duration: 1600 },
  run({ layer, x, y, cardH, colour, rainbow }, p) {
    const a = auraMesh(layer, {
      x,
      y,
      size: cardH * p.size,
      colour: hot(colour, 0.15),
      rainbow,
      twist: p.twist,
    });
    detach(
      tween(
        p.duration,
        (u) => {
          a.intensity = p.intensity * pulse(u, 0.12, 1.6);
        },
        'linear',
        a.owner,
      ),
      () => a.destroy(),
    );
  },
});
