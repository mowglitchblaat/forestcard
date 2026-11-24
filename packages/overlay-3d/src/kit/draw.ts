// What the marks and the moves draw with, shared so that each costs as little as it can:
//   icons     an SVG is parsed once into a GraphicsContext; every icon drawn from it shares that
//             geometry (no parsing, no tessellation again: a new icon is a draw call, not a rebuild);
//   textures  soft shapes drawn once in Canvas 2D (engine/textures.ts and the ring, streak and shard
//             here), then tinted, stretched and faded: a sprite each, batched by Pixi;
//   bursts    particles on one ParticleContainer per move (engine/particles.ts): one draw call for all,
//             their number cut by the quality (config/quality.ts);
//   fades     a sprite that lights and dies, detached from the move, destroyed at its end.
// Everything is in card units (W x H, the face in card.box), like the marks and moves that use it.

import { Container, Graphics, GraphicsContext, Sprite, Texture, type ColorSource } from 'pixi.js';
import { particleCount } from '../config/quality.ts';
import type { Particles } from '../engine/particles.ts';
import { glowTexture } from '../engine/textures.ts';
import { detach, tween, type Easing } from '../engine/time.ts';

// ---- icons -------------------------------------------------------------------------------------------

const contexts = new Map<string, GraphicsContext>();

/**
 * An icon from an SVG, centred on (0, 0) and `size` wide (its viewBox's width). The SVG is parsed once:
 * every icon of it shares one GraphicsContext, which is never destroyed (destroy the Graphics only).
 */
export function icon(svg: string, size: number, viewW: number, viewH = viewW): Graphics {
  let ctx = contexts.get(svg);
  if (!ctx) {
    const made = new GraphicsContext();
    made.svg(svg);
    contexts.set(svg, made);
    ctx = made;
  }
  const g = new Graphics(ctx);
  g.pivot.set(viewW / 2, viewH / 2);
  g.scale.set(size / viewW);
  return g;
}

// ---- textures ----------------------------------------------------------------------------------------

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

/** A thin bright ring with a soft falloff on both sides (shockwaves, halos, a shield's rim). */
export const ringTexture = (): Texture =>
  canvasTexture('kit-ring', 256, 256, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,0)');
    r.addColorStop(0.72, 'rgba(255,255,255,0)');
    r.addColorStop(0.86, 'rgba(255,255,255,1)');
    r.addColorStop(0.93, 'rgba(255,255,255,.35)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });

/** A streak: bright along its middle line, fading to its ends and its sides (beams, slashes, speed). */
export const streakTexture = (): Texture =>
  canvasTexture('kit-streak', 256, 32, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const u = x / (w - 1),
          v = Math.abs(y / (h - 1) - 0.5) * 2;
        const along = Math.sin(Math.PI * u) ** 0.6;
        const across = Math.exp(-v * v * 7);
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = 255 * along * across;
      }
    g.putImageData(img, 0, 0);
  });

/** A shard of glass or ice: a pale sliver, lit along one edge. */
export const shardTexture = (): Texture =>
  canvasTexture('kit-shard', 64, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, 'rgba(255,255,255,.95)');
    grad.addColorStop(0.35, 'rgba(255,255,255,.55)');
    grad.addColorStop(1, 'rgba(255,255,255,.15)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(32, 0);
    g.lineTo(60, 70);
    g.lineTo(30, 128);
    g.lineTo(6, 60);
    g.closePath();
    g.fill();
  });

/** A puff of smoke or steam: a soft lumpy disc. */
export const puffTexture = (): Texture =>
  canvasTexture('kit-puff', 128, 128, (g, w) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2,
        rr = w * 0.16;
      const x = w / 2 + Math.cos(a) * rr * 0.9,
        y = w / 2 + Math.sin(a) * rr * 0.9;
      const r = g.createRadialGradient(x, y, 0, x, y, w * 0.3);
      r.addColorStop(0, 'rgba(255,255,255,.35)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, w, w);
    }
  });

// ---- sprites -----------------------------------------------------------------------------------------

/** A sprite of `texture`, centred at (x, y), `w` wide (and `h` high: as wide by default), added light. */
export function lit(
  parent: Container,
  texture: Texture,
  x: number,
  y: number,
  w: number,
  tint: ColorSource,
  h = w,
  blend: 'add' | 'normal' | 'screen' = 'add',
): Sprite {
  const s = new Sprite({ texture, anchor: 0.5, tint });
  s.position.set(x, y);
  s.width = w;
  s.height = h;
  s.blendMode = blend;
  parent.addChild(s);
  return s;
}

/**
 * A light that swells from `from` to `to` times `w` while it fades from `alpha`: a flash, a ring going
 * out. Detached: it ends on its own, then is destroyed. Resolves at its end (await it or not).
 */
export function flare(
  parent: Container,
  o: {
    x: number;
    y: number;
    w: number;
    tint: ColorSource;
    texture?: Texture;
    ms?: number;
    from?: number;
    to?: number;
    alpha?: number;
    ease?: Easing;
    h?: number; // its height, for a stretched one (times w's growth)
  },
): Promise<void> {
  const s = lit(parent, o.texture ?? glowTexture(), o.x, o.y, o.w, o.tint, o.h ?? o.w);
  const from = o.from ?? 0.4,
    to = o.to ?? 1.2,
    a = o.alpha ?? 1,
    ms = o.ms ?? 500;
  const k = (o.h ?? o.w) / o.w;
  const p = tween(
    ms,
    (u) => {
      const sc = from + (to - from) * u;
      s.width = o.w * sc;
      s.height = o.w * sc * k;
      s.alpha = a * (1 - u);
    },
    o.ease ?? 'out-cubic',
    s,
  );
  return new Promise((resolve) => detach(p, () => (s.destroy(), resolve())));
}

// A drop of liquid, white to be tinted (normal blending): a full round body, a darker rim, a highlight up
// left. Stretched along its speed by the particles, it reads as a flying drop.
export const dropTexture = (): Texture =>
  canvasTexture('kit-drop', 64, 64, (g, w) => {
    const m = w / 2;
    const body = g.createRadialGradient(m - 6, m - 6, 2, m, m, m - 2);
    body.addColorStop(0, 'rgba(255,255,255,1)');
    body.addColorStop(0.75, 'rgba(205,205,205,1)');
    body.addColorStop(0.92, 'rgba(150,150,150,.9)');
    body.addColorStop(1, 'rgba(150,150,150,0)');
    g.fillStyle = body;
    g.beginPath();
    g.arc(m, m, m - 2, 0, Math.PI * 2);
    g.fill();
  });

// A splash of blood, red (not tinted): an uneven blot, its arms thrown out, droplets around. Seeded: the
// same splash each time it is drawn, turned and flipped by its sprite.
export const splatTexture = (): Texture =>
  canvasTexture('kit-splat', 256, 256, (g, w) => {
    const m = w / 2;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    g.fillStyle = '#b3101c';
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2,
        r = w * (0.17 + 0.07 * rnd());
      g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
    }
    g.fill();
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2,
        len = w * (0.22 + 0.2 * rnd()),
        wd = w * (0.025 + 0.03 * rnd());
      g.save();
      g.translate(m, m);
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, -wd);
      g.quadraticCurveTo(len * 0.6, -wd * 0.4, len, 0);
      g.quadraticCurveTo(len * 0.6, wd * 0.4, 0, wd);
      g.fill();
      g.beginPath();
      g.arc(len, 0, wd * 0.9, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2,
        r = w * (0.2 + 0.27 * rnd());
      g.beginPath();
      g.arc(m + Math.cos(a) * r, m + Math.sin(a) * r, w * (0.006 + 0.016 * rnd()), 0, Math.PI * 2);
      g.fill();
    }
    // wet: a darker heart and a light catch
    const h = g.createRadialGradient(m - w * 0.05, m - w * 0.05, 0, m, m, w * 0.2);
    h.addColorStop(0, 'rgba(255,120,120,.55)');
    h.addColorStop(0.3, 'rgba(120,0,10,.0)');
    h.addColorStop(1, 'rgba(70,0,6,.5)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = h;
    g.fillRect(0, 0, w, w);
  });

// ---- particles ---------------------------------------------------------------------------------------

export type BurstSpec = {
  x: number;
  y: number;
  count: number; // at full quality
  speed: number; // card units per second, at most
  size: number;
  tint: number | readonly number[]; // one of them each
  life?: number; // seconds, at most
  angle?: number; // the burst's direction (radians); omitted: all around
  spread?: number; // around `angle` (radians)
  gravity?: number;
  drag?: number;
  stretch?: number;
  jitter?: number; // how far from (x, y) a particle may start
};

/** Throws a burst of particles (fewer at the eco quality). */
export function burst(particles: Particles, b: BurstSpec): void {
  const n = particleCount(b.count);
  const tints = typeof b.tint === 'number' ? [b.tint] : b.tint;
  for (let i = 0; i < n; i++) {
    const a =
      b.angle === undefined
        ? Math.random() * Math.PI * 2
        : b.angle + (Math.random() - 0.5) * (b.spread ?? Math.PI / 3);
    const v = b.speed * (0.35 + 0.65 * Math.random());
    const j = b.jitter ?? 0;
    particles.add({
      x: b.x + (Math.random() - 0.5) * j,
      y: b.y + (Math.random() - 0.5) * j,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: (b.life ?? 0.8) * (0.5 + 0.5 * Math.random()),
      size: b.size * (0.6 + 0.6 * Math.random()),
      tint: tints[i % tints.length]!,
      gravity: b.gravity ?? 0,
      drag: b.drag ?? 2.5,
      stretch: b.stretch ?? 0,
    });
  }
}

// ---- lines -------------------------------------------------------------------------------------------

/**
 * A jagged line from a to b (lightning, a crack): `segments` points, each pushed aside by up to `jag`
 * (card units), less near the ends. Returns the points, flat [x0, y0, x1, y1…].
 */
export function jagged(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  segments: number,
  jag: number,
): number[] {
  const out: number[] = [];
  const dx = bx - ax,
    dy = by - ay,
    len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len,
    ny = dx / len;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const off =
      i === 0 || i === segments ? 0 : (Math.random() - 0.5) * 2 * jag * Math.sin(Math.PI * u);
    out.push(ax + dx * u + nx * off, ay + dy * u + ny * off);
  }
  return out;
}

/** Strokes a polyline (flat points) on `g`: a wide soft pass, then a thin bright core. */
export function glowLine(
  g: Graphics,
  pts: readonly number[],
  colour: ColorSource,
  width: number,
  alpha = 1,
): void {
  const path = () => {
    g.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
  };
  path();
  g.stroke({ color: colour, width: width * 3, alpha: 0.25 * alpha, cap: 'round', join: 'round' });
  path();
  g.stroke({ color: colour, width, alpha: 0.9 * alpha, cap: 'round', join: 'round' });
  path();
  g.stroke({ color: 0xffffff, width: width * 0.4, alpha, cap: 'round', join: 'round' });
}

// ---- small maths -------------------------------------------------------------------------------------

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Where u is in [a, b], 0..1 (clamped). */
export const span = (u: number, a: number, b: number): number => clamp01((u - a) / (b - a));
/** 0 -> 1 -> 0 over [a, b]. */
export const bump = (u: number, a: number, b: number): number => Math.sin(Math.PI * span(u, a, b));
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
