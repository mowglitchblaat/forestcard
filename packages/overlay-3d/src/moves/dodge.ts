// The dodge (dodged, breathDodged, missileDodged): the card steps aside, away from its opponent, leans
// into it and comes back; three afterimages of it stay behind and fade, and a few sharp speed lines
// streak behind it. Ported from the legacy (combat.html: vent, .card.dodge).
//   the step:       0.85 s; out to a quarter of the way (a fifth of a card wide, 7 degrees, skewed), back
//                   for the rest;
//   the afterimages: snapshots of the face where it stood, sliding a little the same way as they fade,
//                   0.65 s, 70 ms apart;
//   the lines:      four tapered streaks of pale light, 0.6 s each, 40 ms apart.

import { Graphics, Sprite } from 'pixi.js';
import { H, W } from '@forestcard/layout';
import { release, snapshot } from '../engine/snapshot.ts';
import { easing, tween } from '../engine/time.ts';
import { defineMoveFx, type MoveContext } from './define.ts';

async function play({ card, app, behind, away }: MoveContext): Promise<void> {
  const box = card.box,
    root = card.root;
  const res = Math.min(2, Math.max(0.2, root.worldTransform.a * app.renderer.resolution));
  const rt = snapshot(app, card.front, res);
  const ghosts = [0, 1, 2].map((i) => {
    const s = new Sprite({ texture: rt, alpha: 0 });
    behind.addChild(s);
    return { s, i };
  });
  const lines = new Graphics();
  lines.blendMode = 'add';
  behind.addChild(lines);
  const bands = [0, 1, 2, 3].map((i) => ({
    y: H * (0.2 + (0.6 * i) / 3) + (Math.random() * 0.04 - 0.02) * H,
    d: i * 0.04,
    len: box.w * (0.8 + 0.3 * Math.random()),
    half: H * (0.02 + 0.012 * Math.random()),
  }));
  const base = { px: root.pivot.x, angle: root.angle, skew: root.skew.x };
  const step = easing('out-cubic'),
    out = easing('out-cubic');
  const dx = away * 0.227 * box.w;
  try {
    await tween(
      900,
      (u) => {
        const t = u * 0.9; // seconds
        // the card: out over the first quarter of its 0.85 s, back over the rest
        const p = step(Math.min(1, t / 0.85)),
          k = p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75;
        root.pivot.x = base.px - dx * k;
        root.angle = base.angle + away * 7 * k;
        root.skew.x = base.skew - away * ((10 * Math.PI) / 180) * k;
        // the afterimages, where the card stood
        for (const { s, i } of ghosts) {
          const v = Math.max(0, Math.min(1, (t - i * 0.07) / 0.65));
          s.alpha = v > 0 && v < 1 ? (0.5 - i * 0.12) * (1 - out(v)) : 0;
          s.x = away * box.w * (0.05 + 0.04 * i) * out(v);
        }
        // the speed lines, tapered, fading along their length
        lines.clear();
        for (const b of bands) {
          const v = (t - b.d) / 0.6;
          if (v <= 0 || v >= 1) continue;
          const al = Math.sin(Math.PI * Math.min(1, v * 1.15)) * 0.9,
            xs = W / 2 + away * box.w * 0.2,
            len = b.len * out(v);
          const yy = (s: number, sg: number) =>
            b.y + sg * b.half * Math.pow(1 - s, 0.7) + Math.sin(s * 3 + b.d * 9) * H * 0.01;
          for (let i = 0; i < 16; i++) {
            const s0 = i / 16,
              s1 = (i + 1) / 16;
            const x0 = xs - away * len * s0,
              x1 = xs - away * len * s1;
            lines
              .poly([x0, yy(s0, -1), x1, yy(s1, -1), x1, yy(s1, 1), x0, yy(s0, 1)])
              .fill({ color: s0 < 0.5 ? 0xebfaff : 0xb4e1ff, alpha: al * (1 - s0) });
          }
        }
      },
      'linear',
      root,
    );
  } finally {
    if (!root.destroyed) {
      root.pivot.x = base.px;
      root.angle = base.angle;
      root.skew.x = base.skew;
    }
    for (const { s } of ghosts) s.destroy();
    release(rt);
  }
}

export const dodge = defineMoveFx({ play });
