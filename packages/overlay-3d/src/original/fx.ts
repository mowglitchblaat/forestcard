// The legacy overlay's own drawing (apps/overlay-combat/src/combat.html), kept as it was for the effects
// whose look is the author's: one Canvas 2D over the whole screen, effects added with a duration and a
// draw(x, t, u) function, and the persistent drawings of the new mechanics (NFX: the parasitic link's
// tendril, the mist). The functions of effects.ts are the legacy's, ported nearly line for line: only the
// way they find a card (its box on screen) and move it (a Pixi card, not a DOM element) changed.
//
// Cost: the canvas is drawn and uploaded only while something runs on it (an effect, a mist, a link);
// at rest its loop stops and nothing is drawn. Its resolution: 1.5 at most at full quality (the legacy's
// fxLoop), 1 at the eco quality (the legacy's NFX canvas, "effets doux").

import { Container, Sprite, Texture, type Application } from 'pixi.js';
import { qualityLevel } from '../config/quality.ts';
import { every, type Stoppable } from '../engine/time.ts';

export type Box = { x: number; y: number; w: number; h: number; cx: number; cy: number };
export type Draw = (x: CanvasRenderingContext2D, t: number, u: number) => void;

// ---- the legacy's small helpers, unchanged ---------------------------------------------------------
export const R = (a: number, b: number): number => a + Math.random() * (b - a);
export const ez = (u: number): number => 1 - Math.pow(1 - u, 3);
export const cl = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
export function orb(x: CanvasRenderingContext2D, px: number, py: number, r: number, c0: string, c1: string): void {
  if (r <= 0) return;
  const g = x.createRadialGradient(px, py, 0, px, py, r);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  x.fillStyle = g;
  x.beginPath();
  x.arc(px, py, r, 0, 7);
  x.fill();
}
export function rr(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number): void {
  x.beginPath();
  x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r);
  x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r);
  x.arcTo(a, b, a + w, b, r);
  x.closePath();
}
// a soft round sprite of a colour (the legacy's nspr), 'fog' for the mist's
const SPR: Record<string, HTMLCanvasElement> = {};
export function nspr(col: string): HTMLCanvasElement {
  const hit = SPR[col];
  if (hit) return hit;
  const S = 64,
    cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d')!,
    g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  if (col === 'fog') {
    g.addColorStop(0, 'rgba(235,242,250,1)');
    g.addColorStop(0.5, 'rgba(225,235,245,.55)');
    g.addColorStop(1, 'rgba(220,230,240,0)');
  } else {
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
  }
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return (SPR[col] = cv);
}

type Fx = { t0: number; dur: number; draw: Draw; done: () => void };

/** The legacy canvas over the screen: one per page. */
export class LegacyCanvas {
  readonly canvas = document.createElement('canvas');
  private readonly x: CanvasRenderingContext2D;
  private readonly sprite: Sprite;
  private readonly texture: Texture;
  private fx: Fx[] = [];
  private persist = new Set<(x: CanvasRenderingContext2D) => boolean>();
  private loop: Stoppable | null = null;
  private res = 1;
  private now = 0;

  private readonly app: Application;

  constructor(app: Application, parent: Container = app.stage) {
    this.app = app;
    this.x = this.canvas.getContext('2d')!;
    this.resize();
    this.texture = Texture.from(this.canvas);
    this.sprite = new Sprite(this.texture);
    this.sprite.label = 'legacy-fx';
    this.sprite.eventMode = 'none';
    this.sprite.visible = false;
    parent.addChild(this.sprite);
  }

  /** The screen's height / 100 (the legacy's vh). */
  get vh(): number {
    return this.app.screen.height / 100;
  }

  private resize(): void {
    this.res = qualityLevel() === 'eco' ? 1 : Math.min(1.5, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.app.screen.width * this.res)),
      h = Math.max(1, Math.round(this.app.screen.height * this.res));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** The legacy's addFx: `draw` runs every frame for `dur` seconds. Resolves at its end. */
  add(dur: number, draw: Draw): Promise<void> {
    return new Promise((done) => {
      this.fx.push({ t0: this.now, dur, draw, done });
      this.start();
    });
  }

  /** A drawing that lasts while `draw` returns true (the mist, a link): drawn every frame. */
  keep(draw: (x: CanvasRenderingContext2D) => boolean): void {
    this.persist.add(draw);
    this.start();
  }

  private start(): void {
    if (this.loop || this.sprite.destroyed) return;
    this.sprite.visible = true;
    this.loop = every(this.sprite, (dt) => this.frame(dt));
  }

  private frame(dt: number): void {
    this.now += dt;
    this.resize();
    const x = this.x,
      d = this.res;
    x.setTransform(d, 0, 0, d, 0, 0);
    x.clearRect(0, 0, this.app.screen.width, this.app.screen.height);
    x.lineCap = 'butt';
    for (const p of [...this.persist]) {
      x.save();
      let on = false;
      try {
        on = p(x);
      } finally {
        x.restore();
      }
      if (!on) this.persist.delete(p);
    }
    for (const f of [...this.fx]) {
      const t = this.now - f.t0;
      if (t >= f.dur) {
        this.fx.splice(this.fx.indexOf(f), 1);
        f.done();
        continue;
      }
      x.save();
      try {
        f.draw(x, t, t / f.dur);
      } finally {
        x.restore();
      }
    }
    this.sprite.width = this.app.screen.width;
    this.sprite.height = this.app.screen.height;
    this.texture.source.update();
    if (!this.fx.length && !this.persist.size) {
      x.clearRect(0, 0, this.app.screen.width, this.app.screen.height);
      this.texture.source.update();
      this.sprite.visible = false;
      this.loop?.stop();
      this.loop = null;
    }
  }

  /** Brings the canvas back on top (a scene added after it). */
  raise(): void {
    const p = this.sprite.parent;
    if (p) p.addChild(this.sprite);
  }

  destroy(): void {
    this.loop?.stop();
    for (const f of this.fx) f.done();
    this.fx = [];
    this.persist.clear();
    this.sprite.destroy();
    this.texture.destroy(true);
  }
}

/** A card's box on screen (CSS pixels, the canvas's units), from what shows its face. */
export function boxOf(face: Container): Box {
  const r = face.getBounds();
  return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
}

/**
 * The legacy's flot: a big word over a player's card (GLOUPS !, CRUNCH !, EXÉCUTÉ !). Black outline,
 * pops in, rises and fades over 1.5 s. `big`: the legacy's .fl.big (15vh instead of 10vh).
 */
export function flot(fx: LegacyCanvas, K: Box, txt: string, col: string, big = false): void {
  const vh = fx.vh,
    size = (big ? 15 : 10) * vh;
  void fx.add(1.5, (x, t) => {
    const k = t / 1.5;
    // 0: scale .3, 12 %: 1.35, 25 %: 1, then it rises to -12vh while it fades after 70 %
    const s = k < 0.12 ? 0.3 + (1.35 - 0.3) * (k / 0.12) : k < 0.25 ? 1.35 - 0.35 * ((k - 0.12) / 0.13) : 1;
    const dy = k < 0.12 ? -vh * (k / 0.12) : k < 0.25 ? -vh - vh * ((k - 0.12) / 0.13) : -2 * vh - 10 * vh * ((k - 0.25) / 0.75);
    const a = k < 0.12 ? k / 0.12 : k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    x.save();
    x.globalAlpha = Math.max(0, a);
    x.translate(K.cx, K.y + K.h * 0.34 + dy);
    x.scale(s, s);
    x.font = `900 ${size}px system-ui, "Segoe UI", sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'top';
    x.shadowColor = '#000';
    x.shadowBlur = 1.6 * vh;
    x.shadowOffsetY = 0.6 * vh;
    x.lineJoin = 'round';
    x.lineWidth = 0.7 * vh;
    x.strokeStyle = '#000';
    x.strokeText(txt, 0, 0);
    x.shadowBlur = 0;
    x.shadowOffsetY = 0;
    x.fillStyle = col;
    x.fillText(txt, 0, 0);
    x.restore();
  });
}

/** An SVG drawn by the browser into a texture (the legacy's inline SVGs, gradients included). */
const svgCache = new Map<string, Promise<Texture>>();
export function svgTexture(svg: string, w: number, h: number): Promise<Texture> {
  const key = `${w}x${h}:${svg}`;
  let p = svgCache.get(key);
  if (!p) {
    p = new Promise((ok, ko) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d')!.drawImage(img, 0, 0, w, h);
        ok(Texture.from(c));
      };
      img.onerror = ko;
      // an SVG without a size gets the one asked
      const sized = svg.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" `);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
    });
    svgCache.set(key, p);
  }
  return p;
}
