// Small textures drawn once with Canvas 2D, then tinted and stretched by the effects; colour helpers.

import { Color, Texture, type ColorSource } from 'pixi.js';

const cache = new Map<string, Texture>();
function canvasTexture(
  key: string,
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('no 2D context');
  draw(g, w, h);
  const tex = Texture.from(c);
  cache.set(key, tex);
  return tex;
}

const radial =
  (stops: readonly (readonly [number, string])[]) => (g: CanvasRenderingContext2D, w: number) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    for (const [o, c] of stops) r.addColorStop(o, c);
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  };

// soft round glow
export const glowTexture = (): Texture =>
  canvasTexture(
    'glow',
    256,
    256,
    radial([
      [0, 'rgba(255,255,255,1)'],
      [0.25, 'rgba(255,255,255,.6)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  );

// spark: hot core, soft falloff (stretched along its speed to read as a streak)
export const sparkTexture = (): Texture =>
  canvasTexture(
    'spark',
    64,
    64,
    radial([
      [0, 'rgba(255,255,255,1)'],
      [0.15, 'rgba(255,255,255,.9)'],
      [0.4, 'rgba(255,255,255,.25)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  );

// smooth tileable noise for displacement maps (sums of sines: every frequency is a whole number of periods)
export const noiseTexture = (): Texture => {
  const tex = canvasTexture('noise', 256, 256, (g, n) => {
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = (x / n) * Math.PI * 2,
          v = (y / n) * Math.PI * 2;
        const r = 0.5 + 0.3 * Math.sin(u + Math.sin(v) * 1.2) + 0.2 * Math.sin(v * 2 + Math.cos(u));
        const gc =
          0.5 + 0.3 * Math.cos(v + Math.sin(u) * 1.2) + 0.2 * Math.cos(u * 2 + Math.sin(v));
        const i = (y * n + x) * 4;
        img.data[i] = r * 255;
        img.data[i + 1] = gc * 255;
        img.data[i + 2] = 128;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
  tex.source.addressMode = 'repeat';
  return tex;
};

// A dark panel with soft edges: stretched as a NineSliceSprite (borders of `feather` px), the edges fade
// over `feather` px whatever the panel's size, the corners round off. White: tinted by the caller.
export const softPanelTexture = (feather: number): Texture => {
  const f = Math.max(1, Math.round(feather)),
    n = 2 * f + 1;
  return canvasTexture(`soft-panel-${f}`, n, n, (g) => {
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const d = Math.min(1, Math.hypot(x - f, y - f) / f),
          a = 1 - d * d * (3 - 2 * d);
        const i = (y * n + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
};

// Lighter version of a colour (sparks read as hot, not flat). t: 0 = the colour, 1 = white.
export function hot(colour: ColorSource, t = 0.45): number {
  const [r, g, b] = rgb(colour);
  const m = (v: number) => Math.round((v + (1 - v) * t) * 255);
  return (m(r) << 16) | (m(g) << 8) | m(b);
}

// colour -> [r, g, b] in 0..1, for a vec3 uniform
export function rgb(colour: ColorSource): [number, number, number] {
  const c = new Color(colour);
  return [c.red, c.green, c.blue];
}
