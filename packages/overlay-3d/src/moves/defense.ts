// The moves of a card that defends itself: it blocks a blow, its thorns answer it, its mirror sends it
// back. Each plays in front of the card, on the side of its opponent (away: the other side).
//   block   (bloque, piege bloque, solide_bloque, contre_ultime): a pane of hexagonal light rises
//           between the card and the blow, takes it with a ripple and a crack, and fades;
//   thorns  (epines, riposte, replique): dark red thorns thrust out of the card's edge toward the
//           opponent, quick, then draw back;
//   mirror  (renvoi, magie_miroir): a silver mirror slides in, a glint runs across it, the blow is sent
//           back as a streak of light toward the opponent.

import { Graphics } from 'pixi.js';
import { H } from '@forestcard/layout';
import { Particles } from '../engine/particles.ts';
import { tween, wait } from '../engine/time.ts';
import { burst, bump, flare, jagged, lit, span, streakTexture } from '../kit/draw.ts';
import { defineMoveFx, type MoveContext } from './define.ts';

const CYAN = 0x7dd3fc;

async function block({ card, over, away }: MoveContext): Promise<void> {
  const box = card.box;
  const toward = -away;
  const x = box.x + box.w / 2 + toward * box.w * 0.08,
    y = H * 0.45;
  const pw = box.w * 0.95,
    ph = H * 0.7;
  const pane = new Graphics();
  // the pane: a rounded hexagon of light with a few inner cells
  const hex = (r: number, cx = 0, cy = 0) => {
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      pts.push(cx + Math.cos(a) * r * (pw / ph), cy + Math.sin(a) * r);
    }
    return pts;
  };
  pane
    .poly(hex(ph / 2))
    .fill({ color: CYAN, alpha: 0.12 })
    .stroke({ color: CYAN, width: box.w * 0.012 });
  for (const [cx, cy] of [
    [0, 0],
    [0, -ph * 0.25],
    [0, ph * 0.25],
    [-pw * 0.22, -ph * 0.12],
    [pw * 0.22, -ph * 0.12],
    [-pw * 0.22, ph * 0.12],
    [pw * 0.22, ph * 0.12],
  ] as const)
    pane
      .poly(hex(ph * 0.12, cx, cy))
      .stroke({ color: 0xffffff, width: box.w * 0.004, alpha: 0.45 });
  pane.position.set(x, y);
  pane.blendMode = 'add';
  over.addChild(pane);
  const crack = new Graphics();
  crack.blendMode = 'add';
  over.addChild(crack);
  let hit = false;
  await tween(
    700,
    (u) => {
      const rise = span(u, 0, 0.22),
        out = span(u, 0.72, 1);
      pane.alpha = rise * (1 - out);
      pane.scale.set(0.7 + 0.3 * rise + 0.04 * bump(u, 0.25, 0.45));
      if (u > 0.25 && !hit) {
        hit = true;
        // the hit: a ripple, a crack from the point of impact
        void flare(over, { x, y, w: box.w * 0.9, tint: CYAN, ms: 400 });
        card.shake(6, 180);
        const pts = jagged(
          x + toward * pw * 0.1,
          y - ph * 0.05,
          x - toward * pw * 0.05,
          y + ph * 0.28,
          7,
          box.w * 0.04,
        );
        crack.moveTo(pts[0]!, pts[1]!);
        for (let i = 2; i < pts.length; i += 2) crack.lineTo(pts[i]!, pts[i + 1]!);
        crack.stroke({ color: 0xffffff, width: box.w * 0.006 });
      }
      crack.alpha = 1 - out;
    },
    'linear',
    pane,
  );
}

async function thorns({ card, over, away }: MoveContext): Promise<void> {
  const box = card.box;
  const toward = -away;
  const edge = box.x + (toward > 0 ? box.w : 0);
  const g = new Graphics();
  over.addChild(g);
  const spikes = Array.from({ length: 7 }, (_, i) => ({
    y: H * (0.18 + (0.64 * i) / 6) + (Math.random() - 0.5) * H * 0.04,
    len: box.w * (0.22 + 0.14 * Math.random()),
    half: H * 0.026,
    d: Math.random() * 0.12,
  }));
  void flare(over, {
    x: edge,
    y: H / 2,
    w: box.w * 0.6,
    h: H,
    tint: 0xff3b3b,
    ms: 500,
    alpha: 0.6,
  });
  await tween(
    520,
    (u) => {
      g.clear();
      for (const s of spikes) {
        const k = bump(u, s.d, s.d + 0.75) ** 0.6;
        if (k <= 0) continue;
        const tip = edge + toward * s.len * k;
        g.poly([edge, s.y - s.half, tip, s.y, edge, s.y + s.half]).fill(0x3b0a10);
        g.poly([edge, s.y - s.half * 0.45, tip, s.y, edge, s.y + s.half * 0.2]).fill({
          color: 0xc0283a,
          alpha: 0.9,
        });
      }
    },
    'linear',
    g,
  );
  g.destroy();
}

async function mirror({ card, over, away }: MoveContext): Promise<void> {
  const box = card.box;
  const toward = -away;
  const x = box.x + box.w / 2 + toward * box.w * 0.15,
    y = H * 0.48;
  const mw = box.w * 0.85,
    mh = H * 0.78;
  const glass = new Graphics()
    .roundRect(-mw / 2, -mh / 2, mw, mh, box.w * 0.05)
    .fill({ color: 0xcbd5e1, alpha: 0.28 })
    .stroke({ color: 0xf1f5f9, width: box.w * 0.014 });
  glass.position.set(x, y);
  glass.skew.y = toward * 0.12;
  over.addChild(glass);
  const glint = lit(over, streakTexture(), x, y, mh * 0.9, 0xffffff, box.w * 0.12);
  glint.rotation = Math.PI / 2 + 0.35;
  const sparks = new Particles(over);
  await tween(
    820,
    (u) => {
      const inn = span(u, 0, 0.2),
        out = span(u, 0.78, 1);
      glass.alpha = inn * (1 - out);
      glass.x = x + toward * box.w * 0.25 * (1 - inn);
      glint.x = x + (span(u, 0.2, 0.55) - 0.5) * mw;
      glint.alpha = bump(u, 0.2, 0.55);
    },
    'linear',
    glass,
  );
  card.shake(4, 140);
  // sent back: a streak toward the opponent
  void flare(over, {
    x: x + toward * box.w * 0.9,
    y,
    w: box.w * 2.2,
    h: box.w * 0.16,
    tint: 0xe0f2fe,
    texture: streakTexture(),
    from: 0.2,
    to: 1.3,
    ms: 380,
  });
  burst(sparks, {
    x,
    y,
    count: 18,
    speed: box.w * 2,
    size: box.w * 0.03,
    tint: [0xffffff, 0xbae6fd],
    angle: toward > 0 ? 0 : Math.PI,
    spread: 0.8,
    life: 0.5,
    stretch: 5,
  });
  await wait(380);
  glint.destroy();
  glass.destroy();
}

export const blockMove = defineMoveFx({ play: block });
export const thornsMove = defineMoveFx({ play: thorns });
export const mirrorMove = defineMoveFx({ play: mirror });
