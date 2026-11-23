// The shield (bouclier, couche: its layers): a shell of light around the card, one rounded outline per
// layer, each a little further out, cyan with a faint hexagonal weave. It absorbs damage.
//   a layer lands:  it closes in from further out and settles, with a cyan flash;
//   while laid:     a slow sheen runs around the shells, they breathe;
//   tick:           it absorbs a blow (bouclier_encaisse): the outer shell flashes and ripples;
//   one goes:       it fades ('fade'), or breaks ('drop': the blow went through) into falling shards.
// Each shell is a Graphics drawn once (outline and weave); the sheen is one sprite that goes round.

import { Container, Graphics, type Sprite } from 'pixi.js';
import { H } from '@forestcard/layout';
import { Particles } from '../engine/particles.ts';
import { glowTexture } from '../engine/textures.ts';
import { every, tween, wait } from '../engine/time.ts';
import { burst, flare, lit, shardTexture } from '../kit/draw.ts';
import { defineMarkFx, type MarkContext, type MarkView } from './define.ts';

const MAX = 5;
const CYAN = 0x67e8f9,
  DEEP = 0x0e7490;

type Shell = { g: Graphics; grow: number; ripple: number; leaving: boolean };

function shellGraphic(x: number, y: number, w: number, h: number, r: number, k: number): Graphics {
  const g = new Graphics();
  g.roundRect(x, y, w, h, r).fill({ color: CYAN, alpha: 0.04 }).stroke({ color: CYAN, width: k * 1.6, alpha: 0.85 });
  g.roundRect(x, y, w, h, r).stroke({ color: 0xffffff, width: k * 0.5, alpha: 0.7 });
  // the weave: a few hexagons along the shell's edge, faint
  const hx = k * 9;
  for (let yy = y + hx; yy < y + h - hx; yy += hx * 1.7)
    for (const xx of [x + hx * 0.6, x + w - hx * 0.6]) {
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        pts.push(xx + Math.cos(a) * hx * 0.5, yy + Math.sin(a) * hx * 0.5);
      }
      g.poly(pts).stroke({ color: CYAN, width: k * 0.4, alpha: 0.35 });
    }
  return g;
}

function create({ card, layer }: MarkContext): MarkView {
  const box = card.box;
  const k = box.w / 100; // a hundredth of the face
  const shells: (Shell | null)[] = Array.from({ length: MAX }, () => null);
  const holder = new Container({ label: 'shells' });
  layer.addChild(holder);
  const sheen: Sprite = lit(layer, glowTexture(), 0, 0, box.w * 0.35, 0xffffff);
  sheen.alpha = 0;
  let particles: Particles | null = null;
  const parts = () => (particles ??= new Particles(layer, shardTexture()));

  const loop = every(layer, (dt, t) => {
    let outer = -1;
    for (const [i, s] of shells.entries()) {
      if (!s) continue;
      outer = i;
      s.ripple = Math.max(0, s.ripple - dt * 2.2);
      const breathe = 1 + 0.006 * Math.sin(t * 2 + i);
      s.g.scale.set((1 + (1 - s.grow) * 0.25 + s.ripple * 0.03) * breathe);
      if (!s.leaving) s.g.alpha = s.grow * (0.55 + 0.25 * Math.sin(t * 1.5 + i * 0.7)) + s.ripple * 0.6;
    }
    // the sheen goes round the outer shell
    if (outer >= 0) {
      const a = t * 0.9,
        pad = k * (4 + outer * 3.5);
      sheen.position.set(
        box.x + box.w / 2 + Math.cos(a) * (box.w / 2 + pad),
        H / 2 + Math.sin(a) * (H / 2 + pad),
      );
      sheen.alpha = 0.35;
    } else sheen.alpha = 0;
  });

  async function land(i: number): Promise<void> {
    const pad = k * (4 + i * 3.5);
    const g = shellGraphic(-box.w / 2 - pad, -H / 2 - pad, box.w + 2 * pad, H + 2 * pad, k * 9 + pad, k);
    g.position.set(box.x + box.w / 2, H / 2);
    g.blendMode = 'add';
    holder.addChild(g);
    const s: Shell = { g, grow: 0, ripple: 0, leaving: false };
    shells[i] = s;
    await tween(380, (u) => void (s.grow = u), 'out-cubic', g);
    void flare(layer, { x: box.x + box.w / 2, y: H / 2, w: box.w * 1.4, h: H * 1.4, tint: DEEP, ms: 420, alpha: 0.6 });
  }

  async function leave(i: number, how: 'fade' | 'drop'): Promise<void> {
    const s = shells[i];
    if (!s) return;
    shells[i] = null;
    s.leaving = true;
    if (how === 'drop') {
      // broken: shards from all around its outline, falling
      const pad = k * (4 + i * 3.5);
      for (let j = 0; j < 4; j++)
        burst(parts(), {
          x: box.x + (j % 2 ? box.w + pad : -pad),
          y: H * (0.25 + 0.5 * (j >> 1)),
          count: 9,
          speed: box.w * 0.9,
          size: k * 6,
          tint: [CYAN, 0xffffff],
          life: 0.9,
          gravity: H * 1.6,
          drag: 1.2,
        });
      card.shake(10, 220);
      await tween(260, (u) => void (s.g.alpha = 1 - u), 'linear', s.g);
    } else {
      const a0 = s.g.alpha;
      await tween(420, (u) => void (s.g.alpha = a0 * (1 - u)), 'linear', s.g);
    }
    s.g.destroy();
  }

  return {
    async set(level, how) {
      const jobs: Promise<void>[] = [];
      for (let i = MAX - 1; i >= level; i--) if (shells[i]) jobs.push(leave(i, how));
      for (let i = 0; i < level; i++)
        if (!shells[i]) {
          jobs.push(land(i));
          await wait(90);
        }
      await Promise.all(jobs);
    },
    async tick() {
      const outer = [...shells].reverse().find((s) => !!s);
      if (outer) outer.ripple = 1;
      void flare(layer, { x: box.x + box.w / 2, y: H * 0.45, w: box.w * 0.9, tint: CYAN, ms: 380, alpha: 0.8 });
      await wait(380);
    },
    destroy() {
      loop.stop();
      particles?.stop();
      layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    },
  };
}

export const shield = defineMarkFx({ max: MAX, create });
