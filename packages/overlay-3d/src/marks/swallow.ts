// The swallow's marks (swallowMarkReceived): a fork, then a knife, planted upright on the top corners of
// the card, ready to eat it. Ported from the legacy (combat.html: svgFourchette, svgCouteau, avMarque,
// avMarquesOff): same cutlery, same places, same fall.
//   a piece lands: it spins in from above and sticks; the card dips, a white glint where it went in;
//   while planted: each piece sways (4 degrees each way, 1.3 s);
//   swallowed:     they fade (0.35 s); the swallow failed ('drop'): they fall off the card, spinning.

import { Container, Graphics, Sprite } from 'pixi.js';
import { H } from '@forestcard/layout';
import { glowTexture } from '../engine/textures.ts';
import { detach, every, tween } from '../engine/time.ts';
import { defineMarkFx, type MarkContext, type MarkLeave, type MarkView } from './define.ts';

const FORK = `<svg viewBox="0 0 40 160"><defs><linearGradient id="f" x1="0" x2="1"><stop offset="0" stop-color="#8d96a3"/><stop offset=".45" stop-color="#f8fafc"/><stop offset=".6" stop-color="#cbd5e1"/><stop offset="1" stop-color="#64748b"/></linearGradient></defs>
<path d="M8,4 L10,4 L11,40 L14,40 L15,4 L18,4 L19,40 L22,40 L23,4 L26,4 L27,40 L30,40 L31,4 L33,4 L33,46 C33,56 26,60 23,62 L22.5,152 C22.5,158 17.5,158 17.5,152 L17,62 C14,60 7,56 7,46 Z" fill="url(#f)" stroke="#334155" stroke-width="1.1"/>
<path d="M20,66 L20,150" stroke="rgba(255,255,255,.75)" stroke-width="1.4"/></svg>`;
const KNIFE = `<svg viewBox="0 0 40 160"><defs><linearGradient id="c" x1="0" x2="1"><stop offset="0" stop-color="#94a3b8"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#7c8794"/></linearGradient>
<linearGradient id="b" x1="0" x2="1"><stop offset="0" stop-color="#5b3416"/><stop offset=".5" stop-color="#a0612a"/><stop offset="1" stop-color="#4a2a10"/></linearGradient></defs>
<path d="M14,6 C26,10 30,30 29,62 L29,92 L14,92 Z" fill="url(#c)" stroke="#334155" stroke-width="1.1"/><path d="M27,22 C29,40 29,60 28.5,90" stroke="#fff" stroke-width="1.2" fill="none" opacity=".9"/>
<rect x="12" y="92" width="18" height="6" rx="2" fill="#475569"/><rect x="13" y="98" width="16" height="58" rx="5" fill="url(#b)" stroke="#2b1607" stroke-width="1"/>
<circle cx="21" cy="112" r="2" fill="#e5e7eb"/><circle cx="21" cy="128" r="2" fill="#e5e7eb"/><circle cx="21" cy="144" r="2" fill="#e5e7eb"/></svg>`;

// Each piece's box in fractions of the face (combat.html's .avm.a1 / .a2: top -17 %, 17 % x 42 %), its
// tilt (degrees, around 50 % / 92 % of its box) and the side it comes from.
type Spot = { left: number; tilt: number; side: -1 | 1 };
const SPOTS: readonly Spot[] = [
  { left: 0.06, tilt: -26, side: -1 },
  { left: 0.77, tilt: 26, side: 1 },
];
const TOP = -0.17,
  BW = 0.17,
  BH = 0.42;

type Piece = { root: Container; sway: number; leaving: boolean };

function create({ card, layer }: MarkContext): MarkView {
  const box = card.box;
  const pieces: (Piece | null)[] = [null, null];
  const sway = every(layer, (_dt, t) => {
    for (const [n, p] of pieces.entries())
      if (p && !p.leaving && p.sway > 0)
        p.root.angle = SPOTS[n]!.tilt + 4 * Math.sin((t * Math.PI) / 1.3) * p.sway;
  });

  async function land(n: number): Promise<void> {
    const s = SPOTS[n]!;
    const root = new Container({ label: n ? 'knife' : 'fork' });
    root.addChild(new Graphics().svg(n ? KNIFE : FORK));
    root.pivot.set(20, 160 * 0.92);
    const sx = (BW * box.w) / 40,
      sy = (BH * H) / 160;
    const x = box.x + (s.left + BW / 2) * box.w,
      y = (TOP + BH * 0.92) * H;
    const p: Piece = { root, sway: 0, leaving: false };
    pieces[n] = p;
    // unseen until its fall starts (see execution.ts)
    root.alpha = 0;
    layer.addChild(root);
    // spins in from above and beside, overshoots 6 % into the card, settles
    const dx = (-s.tilt * 3 * box.w) / 422,
      dy = -2.6 * BH * H;
    await tween(
      620,
      (u) => {
        const f = Math.min(1, u / 0.82),
          e = f * f * f;
        const over = u < 0.82 ? 0.06 * BH * H * e : 0.06 * BH * H * (1 - (u - 0.82) / 0.18);
        root.position.set(x + dx * (1 - e), y + dy * (1 - e) + over);
        root.angle = s.tilt * 14 + (s.tilt - s.tilt * 14) * e;
        const k = 1.25 - 0.25 * e;
        root.scale.set(sx * k, sy * k);
        root.alpha = Math.min(1, u / 0.3);
      },
      'linear',
      root,
    );
    if (root.destroyed) return;
    p.sway = 1;
    card.shake(8, 240);
    glint(box.x + (n ? 0.8 : 0.2) * box.w, 0.12 * H);
  }

  // a white glint: a soft flash and four short rays
  function glint(x: number, y: number) {
    const orb = new Sprite({ texture: glowTexture(), anchor: 0.5, position: { x, y } });
    orb.blendMode = 'add';
    const rays = new Graphics();
    rays.blendMode = 'add';
    rays.position.set(x, y);
    layer.addChild(orb, rays);
    const L = box.w * 0.12;
    detach(
      tween(
        550,
        (u) => {
          orb.width = orb.height = box.w * 0.32 * (0.3 + u);
          orb.alpha = 0.8 * (1 - u);
          rays.clear();
          for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2 + 0.4,
              l = L * (0.5 + u);
            rays
              .moveTo(Math.cos(a) * l * 0.3, Math.sin(a) * l * 0.3)
              .lineTo(Math.cos(a) * l, Math.sin(a) * l);
          }
          rays.stroke({ color: 0xffffff, width: box.w * 0.008, alpha: 1 - u });
        },
        'linear',
        orb,
      ),
      () => {
        orb.destroy();
        rays.destroy();
      },
    );
  }

  function leave(n: number, how: MarkLeave): Promise<void> {
    const p = pieces[n];
    if (!p) return Promise.resolve();
    pieces[n] = null;
    p.leaving = true;
    const s = SPOTS[n]!,
      r = p.root,
      x0 = r.x,
      y0 = r.y,
      a0 = r.angle;
    const done = () => r.destroy({ children: true });
    if (how === 'fade') return tween(350, (u) => void (r.alpha = 1 - u), 'linear', r).finally(done);
    // knocked off: up and out a little, then down past the card, spinning
    const out = (s.side * 90 * box.w) / 422;
    return tween(
      900,
      (u) => {
        const up = Math.min(1, u / 0.3),
          down = Math.max(0, (u - 0.3) / 0.7);
        r.position.set(
          x0 + out * (0.45 * up + 0.55 * down),
          y0 - 0.3 * BH * H * up * (1 - down) + 2.6 * BH * H * down * down,
        );
        r.angle = a0 + s.side * (60 * up + 200 * down);
        r.alpha = 1 - down;
      },
      'linear',
      r,
    ).finally(done);
  }

  return {
    async set(level, how) {
      const jobs: Promise<void>[] = [];
      for (let n = 0; n < SPOTS.length; n++) {
        if (n < level && !pieces[n]) jobs.push(land(n));
        if (n >= level && pieces[n]) jobs.push(leave(n, how));
      }
      await Promise.all(jobs);
    },
    destroy() {
      sway.stop();
      layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    },
  };
}

export const swallow = defineMarkFx({ max: 2, create });
