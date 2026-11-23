// One layer of the layout (@forestcard/layout) -> one Pixi display object. Card units throughout.

import {
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
  type Container,
  type TextStyleOptions,
} from 'pixi.js';
import type { Layer } from '@forestcard/layout';

export type Textures = Readonly<Record<string, Texture>>;

// 'rgba(r,g,b,a)' or '#hex' -> { color, alpha } for Pixi fills
function paint(c: string): { color: string | number; alpha: number } {
  const m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (!m?.[1]) return { color: c, alpha: 1 };
  const [r = 0, g = 0, b = 0, a = 1] = m[1].split(',').map(Number);
  return { color: (r << 16) | (g << 8) | b, alpha: a };
}

function textStyle(l: Extract<Layer, { kind: 'text' }>): TextStyleOptions {
  return {
    fontFamily: [...l.font.family],
    fontSize: l.font.size,
    fontWeight: String(l.font.weight) as TextStyleOptions['fontWeight'],
    fontStyle: l.font.italic ? 'italic' : 'normal',
    fill: paint(l.fill).color,
    ...(l.stroke
      ? { stroke: { ...paint(l.stroke.color), width: l.stroke.width, join: 'round' as const } }
      : {}),
    ...(l.shadow
      ? {
          dropShadow: {
            color: 0x000000,
            alpha: l.shadow.alpha,
            blur: l.shadow.blur,
            distance: l.shadow.dy,
            angle: Math.PI / 2,
          },
        }
      : {}),
    ...(l.glow
      ? { dropShadow: { ...paint(l.glow.color), blur: l.glow.blur, distance: 0, angle: 0 } }
      : {}),
  };
}

// The gradient of a common's plaque, drawn in bands (no gradient fill: same look on every renderer).
function bands(l: Extract<Layer, { kind: 'gradient' }>): Graphics {
  const g = new Graphics(),
    n = 48,
    [r, gg, b] = l.colour,
    col = (r << 16) | (gg << 8) | b;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    let a = 0;
    for (let j = 1; j < l.stops.length; j++) {
      const [t0, a0] = l.stops[j - 1]!,
        [t1, a1] = l.stops[j]!;
      if (t >= t0 && t <= t1) {
        a = a0 + ((a1 - a0) * (t - t0)) / (t1 - t0);
        break;
      }
    }
    g.rect(l.x, l.y + (i * l.h) / n, l.w, l.h / n + 1).fill({ color: col, alpha: a });
  }
  return g;
}

/**
 * Draws a layer. Returns the display object, or null for a slot or a missing texture.
 * `frame` is set to the frame texture used, when the layer is the frame.
 */
export function drawLayer(
  l: Layer,
  size: { width: number; height: number }, // the layout's card size: its frame set's units
  textures: Textures,
  drawing: string,
  textResolution: number,
  out: { frame: Texture | null },
): Container | null {
  switch (l.kind) {
    case 'background':
      return new Graphics().roundRect(0, 0, size.width, size.height, 60).fill(l.colour);
    case 'drawing': {
      const tex = textures[drawing];
      if (!tex) return null;
      const s = new Sprite(tex);
      s.position.set(l.x, l.y);
      s.width = l.w;
      s.height = l.h;
      return s;
    }
    case 'slot':
      return null;
    case 'frame': {
      const key = l.candidates.find((k) => textures[k]);
      const tex = key ? textures[key] : undefined;
      if (!tex) return null;
      out.frame = tex;
      const s = new Sprite(tex);
      s.width = size.width;
      s.height = size.height;
      return s;
    }
    case 'image': {
      const t = textures[l.src];
      if (!t) return null;
      const k = t.height / size.height; // the band's rows in the frame-sized image, stretched into the plaque
      const s = new Sprite(
        new Texture({
          source: t.source,
          frame: new Rectangle(0, l.from.y * k, t.width, l.from.h * k),
        }),
      );
      s.position.set(l.x, l.y);
      s.width = l.w;
      s.height = l.h;
      return s;
    }
    case 'gradient':
      return bands(l);
    case 'rect':
      return new Graphics().roundRect(l.x, l.y, l.w, l.h, l.radius).fill(paint(l.fill));
    case 'pill': {
      const p = new Graphics();
      p.roundRect(l.x, l.y + l.shadow.dy, l.w, l.h, l.h / 2).fill({ color: 0x000000, alpha: 0.35 });
      p.roundRect(l.x, l.y, l.w, l.h, l.h / 2).fill(paint(l.fill));
      if (l.border)
        p.roundRect(l.x, l.y, l.w, l.h, l.h / 2).stroke({
          ...paint(l.border.color),
          width: l.border.width,
        });
      return p;
    }
    case 'text': {
      const t = new Text({
        text: l.text,
        style: textStyle(l),
        anchor: 0.5,
        resolution: textResolution,
      });
      t.position.set(l.x, l.y);
      return t;
    }
  }
}
