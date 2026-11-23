// The threads (fils, the puppeteer's control): violet strings that drop from above the card and catch on
// it, one per thread. From five, the puppeteer may take control: the strings tighten and glow, and a
// control bar shows above the card.
//   a thread lands:  its string drops from above and catches with a small violet glint, the card dips;
//   while laid:      the strings sway together, as if a hand held them;
//   tick:            a tug (the puppeteer pulls: the control is tried);
//   one goes:        it fades ('fade'), or snaps ('drop', a Tranchant): its upper part whips up, its lower
//                    part falls.
// One Graphics for all the strings, redrawn each frame (a few lines: cheaper than a sprite each).

import { Graphics, Sprite } from 'pixi.js';
import { H } from '@forestcard/layout';
import { lit, flare } from '../kit/draw.ts';
import { glowTexture } from '../engine/textures.ts';
import { every, tween, wait } from '../engine/time.ts';
import { defineMarkFx, type MarkContext, type MarkView } from './define.ts';

const MAX = 8;
const CONTROL = 5; // from this many, the control may be taken
const VIOLET = 0xb46cff,
  PALE = 0xe9d5ff;
// where each thread catches, in fractions of the face (left to right, then the second row)
const CATCH: readonly (readonly [number, number])[] = [
  [0.22, 0.1],
  [0.78, 0.1],
  [0.5, 0.06],
  [0.1, 0.42],
  [0.9, 0.42],
  [0.34, 0.2],
  [0.66, 0.2],
  [0.5, 0.5],
];
const TOP = -1.4; // where the strings come from, in card heights above the card's top

type Thread = { i: number; drop: number; snap: number; how: 'stay' | 'fade' | 'drop'; alpha: number };

function create({ card, layer }: MarkContext): MarkView {
  const box = card.box;
  const g = new Graphics();
  const bar = new Graphics();
  const barGlow: Sprite = lit(layer, glowTexture(), box.x + box.w / 2, TOP * H * 0.55, box.w * 1.1, VIOLET, H * 0.18);
  barGlow.alpha = 0;
  layer.addChild(g, bar);
  const threads: (Thread | null)[] = Array.from({ length: MAX }, () => null);
  let tug = 0,
    control = 0;

  const anchor = (i: number) => ({
    x: box.x + CATCH[i]![0] * box.w,
    y: CATCH[i]![1] * H,
  });

  const loop = every(layer, (dt, t) => {
    tug = Math.max(0, tug - dt * 2.5);
    const live = threads.filter((x) => !!x).length;
    control += ((live >= CONTROL ? 1 : 0) - control) * Math.min(1, dt * 3);
    const sway = Math.sin(t * 1.3) * box.w * 0.05 + Math.sin(t * 7) * box.w * 0.02 * tug;
    const handX = box.x + box.w / 2 + sway,
      handY = TOP * H * 0.55 - tug * H * 0.06;
    g.clear();
    for (const th of threads) {
      if (!th) continue;
      const a = anchor(th.i);
      // a string: from the hand above down to its catch, sagging a little; while it drops, only its
      // upper part shows; snapped, the upper part whips up, the lower one falls
      const fromX = handX + (a.x - box.x - box.w / 2) * 0.35,
        fromY = handY;
      const col = control > 0.5 ? PALE : VIOLET;
      const width = box.w * (0.006 + 0.004 * control);
      if (th.how === 'drop') {
        const s = th.snap;
        const mx = (fromX + a.x) / 2,
          my = (fromY + a.y) / 2;
        // upper half, retracting
        g.moveTo(fromX, fromY).lineTo(mx + (fromX - mx) * s, my + (fromY - my) * s);
        // lower half, falling with the catch
        g.moveTo(a.x, a.y + s * H * 0.4).lineTo(mx + (a.x - mx) * 0.2, my + s * H * 0.5);
        g.stroke({ color: col, width, alpha: 1 - s });
        continue;
      }
      const reach = th.drop; // 0..1: how far it has dropped
      const ex = fromX + (a.x - fromX) * reach,
        ey = fromY + (a.y - fromY) * reach;
      const cx = (fromX + ex) / 2 + sway * 0.4,
        cy = (fromY + ey) / 2 + H * 0.03 * (1 - tug);
      g.moveTo(fromX, fromY).quadraticCurveTo(cx, cy, ex, ey);
      g.stroke({ color: col, width: width * 3, alpha: 0.18 * th.alpha });
      g.moveTo(fromX, fromY).quadraticCurveTo(cx, cy, ex, ey);
      g.stroke({ color: col, width, alpha: th.alpha });
      // the knot where it catches
      if (reach >= 1) g.circle(ex, ey, width * 1.8).fill({ color: PALE, alpha: th.alpha });
    }
    // the control bar, once the control may be taken
    bar.clear();
    if (control > 0.02) {
      const w = box.w * 0.55;
      bar
        .roundRect(handX - w / 2, handY - box.w * 0.02, w, box.w * 0.04, box.w * 0.02)
        .fill({ color: 0x3b1d5c, alpha: control })
        .stroke({ color: PALE, width: box.w * 0.006, alpha: control });
      bar
        .roundRect(handX - box.w * 0.02, handY - w * 0.35, box.w * 0.04, w * 0.7, box.w * 0.02)
        .fill({ color: 0x3b1d5c, alpha: control })
        .stroke({ color: PALE, width: box.w * 0.006, alpha: control });
    }
    barGlow.position.set(handX, handY);
    barGlow.alpha = control * (0.35 + 0.25 * Math.sin(t * 3)) + tug * 0.5;
  });

  async function land(i: number): Promise<void> {
    const th: Thread = { i, drop: 0, snap: 0, how: 'stay', alpha: 1 };
    threads[i] = th;
    await tween(420, (u) => void (th.drop = u), 'in-2', layer);
    const a = anchor(i);
    card.shake(5, 160);
    void flare(layer, { x: a.x, y: a.y, w: box.w * 0.18, tint: VIOLET, ms: 450 });
  }

  async function leave(i: number, how: 'fade' | 'drop'): Promise<void> {
    const th = threads[i];
    if (!th) return;
    th.how = how;
    if (how === 'drop') {
      const a = anchor(i);
      void flare(layer, { x: a.x, y: a.y * 0.5, w: box.w * 0.25, tint: PALE, ms: 300 });
      await tween(520, (u) => void (th.snap = u), 'out-cubic', layer);
    } else await tween(380, (u) => void (th.alpha = 1 - u), 'linear', layer);
    if (threads[i] === th) threads[i] = null;
  }

  return {
    async set(level, how) {
      const jobs: Promise<void>[] = [];
      for (let i = MAX - 1; i >= level; i--) if (threads[i]) jobs.push(leave(i, how));
      await Promise.all(jobs);
      // new threads one after the other, 120 ms apart
      for (let i = 0; i < level; i++)
        if (!threads[i]) {
          void land(i);
          await wait(120);
        }
      await wait(420);
    },
    async tick() {
      tug = 1;
      card.shake(7, 260);
      await wait(450);
    },
    destroy() {
      loop.stop();
      layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    },
  };
}

export const threads = defineMarkFx({ max: MAX, create });
