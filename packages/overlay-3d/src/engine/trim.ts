// The opaque part of an image: a texture framed on the pixels whose alpha passes `threshold`, its
// transparent margins left out. A booster image drawn on a canvas wider than the pack would otherwise
// make the pack look smaller, and its shape (dome, seals, tear line) would be laid on the empty margins.
// Measured once per image, on a small copy (256 px places a margin within half a percent). The full
// texture when the pixels cannot be read (an image from another origin without CORS taints the canvas),
// or when there is no margin.

import { Rectangle, Texture } from 'pixi.js';

const trimmed = new WeakMap<Texture, Texture>();

export function opaqueTexture(tex: Texture, threshold = 16): Texture {
  const hit = trimmed.get(tex);
  if (hit) return hit;
  let out = tex;
  try {
    const src = tex.source;
    const k = Math.min(1, 256 / Math.max(src.pixelWidth, src.pixelHeight));
    const w = Math.max(1, Math.round(src.pixelWidth * k)),
      h = Math.max(1, Math.round(src.pixelHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (g) {
      g.drawImage(src.resource as CanvasImageSource, 0, 0, w, h);
      const alpha = g.getImageData(0, 0, w, h).data;
      let x0 = w,
        y0 = h,
        x1 = -1,
        y1 = -1;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if ((alpha[(y * w + x) * 4 + 3] ?? 0) > threshold) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      const margin = x0 > 0 || y0 > 0 || x1 < w - 1 || y1 < h - 1;
      if (x1 >= x0 && y1 >= y0 && margin) {
        // small-copy pixels -> source units
        const sx = src.width / w,
          sy = src.height / h;
        out = new Texture({
          source: src,
          frame: new Rectangle(x0 * sx, y0 * sy, (x1 - x0 + 1) * sx, (y1 - y0 + 1) * sy),
        });
      }
    }
  } catch {
    out = tex;
  }
  trimmed.set(tex, out);
  return out;
}
