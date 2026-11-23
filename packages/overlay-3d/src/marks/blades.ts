// The blades (lames: blades laid on the card that cut it each turn): steel blades orbiting the card,
// points inward, one per blade.
//   a blade lands:  it flies in from outside, spinning, and joins the orbit with a steel glint;
//   while laid:     they turn slowly around the card, each leaning in;
//   tick:           they strike (the blades deal their damage): they dive at the card and back, a red cut
//                   where each hits;
//   one goes:       it fades ('fade'), or falls out of the orbit ('drop').
// Each blade is an icon drawn once: the orbit moves and turns it.

import { Container } from 'pixi.js';
import { H } from '@forestcard/layout';
import { every, tween, wait } from '../engine/time.ts';
import { bump, flare, icon, streakTexture } from '../kit/draw.ts';
import { defineMarkFx, type MarkContext, type MarkView } from './define.ts';

const MAX = 6;
const BLADE = `<svg viewBox="0 0 24 100"><defs><linearGradient id="s" x1="0" x2="1"><stop offset="0" stop-color="#7c8794"/><stop offset=".5" stop-color="#f8fafc"/><stop offset="1" stop-color="#64748b"/></linearGradient></defs>
<path d="M12 2 L20 60 L12 70 L4 60 Z" fill="url(#s)" stroke="#1e293b" stroke-width="1.4"/><path d="M12 6 L12 64" stroke="#fff" stroke-width="1" opacity=".8"/>
<rect x="2" y="70" width="20" height="5" rx="2" fill="#9a3412"/><rect x="9" y="75" width="6" height="22" rx="3" fill="#431407"/></svg>`;

type Blade = { root: Container; angle: number; dive: number; leaving: boolean };

function create({ card, layer }: MarkContext): MarkView {
  const box = card.box;
  const cx = box.x + box.w / 2,
    cy = H / 2;
  const rx = box.w * 0.7,
    ry = H * 0.6;
  const blades: (Blade | null)[] = Array.from({ length: MAX }, () => null);
  let turn = 0;

  const slot = (i: number) => (i / MAX) * Math.PI * 2;
  const placeAt = (b: Blade, a: number) => {
    const k = 1 - 0.55 * b.dive;
    b.root.position.set(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
    // the point toward the card's centre
    b.root.rotation = a - Math.PI / 2;
  };

  const loop = every(layer, (dt) => {
    turn += dt * 0.35;
    for (const [i, b] of blades.entries()) if (b && !b.leaving) placeAt(b, slot(i) + turn);
  });

  async function land(i: number): Promise<void> {
    const root = new Container({ label: 'blade' });
    root.addChild(icon(BLADE, box.w * 0.075, 24, 100));
    layer.addChild(root);
    const b: Blade = { root, angle: 0, dive: 0, leaving: true };
    blades[i] = b;
    const a = slot(i) + turn;
    await tween(
      450,
      (u) => {
        const k = 1.8 - 0.8 * u;
        root.position.set(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
        root.rotation = a - Math.PI / 2 + (1 - u) * 8;
        root.alpha = u;
      },
      'out-cubic',
      root,
    );
    b.leaving = false;
    void flare(layer, { x: root.x, y: root.y, w: box.w * 0.16, tint: 0xe2e8f0, ms: 300 });
  }

  async function leave(i: number, how: 'fade' | 'drop'): Promise<void> {
    const b = blades[i];
    if (!b) return;
    blades[i] = null;
    b.leaving = true;
    const r = b.root,
      x0 = r.x,
      y0 = r.y,
      a0 = r.rotation;
    await tween(
      how === 'drop' ? 700 : 350,
      (u) => {
        if (how === 'drop') {
          r.position.set(x0, y0 + H * 0.6 * u * u);
          r.rotation = a0 + 4 * u;
        }
        r.alpha = 1 - u;
      },
      'linear',
      r,
    );
    r.destroy({ children: true });
  }

  return {
    async set(level, how) {
      const jobs: Promise<void>[] = [];
      for (let i = MAX - 1; i >= level; i--) if (blades[i]) jobs.push(leave(i, how));
      for (let i = 0; i < level; i++)
        if (!blades[i]) {
          jobs.push(land(i));
          await wait(120);
        }
      await Promise.all(jobs);
    },
    async tick() {
      const live = blades.filter((b): b is Blade => !!b);
      await tween(
        480,
        (u) => {
          for (const b of live) b.dive = bump(u, 0, 1);
        },
        'linear',
        layer,
      );
      card.shake(8, 220);
      for (const b of live)
        void flare(layer, {
          x: cx + (b.root.x - cx) * 0.4,
          y: cy + (b.root.y - cy) * 0.4,
          w: box.w * 0.3,
          h: box.w * 0.05,
          tint: 0xff3344,
          texture: streakTexture(),
          ms: 380,
        });
      for (const b of live) b.dive = 0;
    },
    destroy() {
      loop.stop();
      layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    },
  };
}

export const blades = defineMarkFx({ max: MAX, create });
