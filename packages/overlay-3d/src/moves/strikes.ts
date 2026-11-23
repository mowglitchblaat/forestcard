// The blows that land on a card with a look of their own (the damage number and the recoil are the
// combat scene's: these play on top). The opponent is on the side the card would not dodge to (-away).
//   critical  (critique, enchaine bonus): a four-pointed golden star bursts on the card, two crossed
//             slashes of white light, a spray of gold;
//   headshot  (headshot): a red crosshair snaps shut on the card's head, a red burst and a ring;
//   laser     (laser: the reversed laser, stronger on a card full of life): a thick violet beam from the
//             opponent's side burns through the card, white core, sparks out of the far side;
//   reap      (fauche: the reaper's tear, bonus on missing life): a wide dark-red crescent sweeps across
//             the card, leaving a tear of light that closes;
//   detonate  (detonation): the statuses blow up: a white flash, a fireball, a ring going out, debris;
//   lightning (foudre_coup, orage, foudre_rebond, decharge): a bolt from far above strikes the card,
//             flickers twice, white-blue light and sparks;
//   missile   (missile): a projectile streaks in from the opponent's side with a smoke trail and bursts;
//   breath    (souffle): a cone of fire pours over the card from the opponent's side;
//   cut       (Tranchant, Cisaillement: links or threads cut): a thin silver slash, quick;
//   execute   (execution: the final cut): a red blade falls down the card's middle.

import { Graphics } from 'pixi.js';
import { H } from '@forestcard/layout';
import { Particles } from '../engine/particles.ts';
import { glowTexture } from '../engine/textures.ts';
import { tween, wait } from '../engine/time.ts';
import { burst, bump, flare, glowLine, icon, jagged, lit, puffTexture, ringTexture, span, streakTexture } from '../kit/draw.ts';
import { defineMoveFx, type MoveContext } from './define.ts';

const STAR = `<svg viewBox="0 0 100 100"><path d="M50 0 C55 38 62 45 100 50 C62 55 55 62 50 100 C45 62 38 55 0 50 C38 45 45 38 50 0Z" fill="#ffffff"/></svg>`;
const CROSSHAIR = `<svg viewBox="0 0 100 100"><g fill="none" stroke="#ff2d3a" stroke-linecap="round"><circle cx="50" cy="50" r="28" stroke-width="6"/><path d="M50 4v24M50 72v24M4 50h24M72 50h24" stroke-width="7"/></g></svg>`;

const centre = (c: MoveContext) => ({ x: c.card.box.x + c.card.box.w / 2, y: H * 0.45 });

async function critical(ctx: MoveContext): Promise<void> {
  const { card, over } = ctx,
    box = card.box,
    { x, y } = centre(ctx);
  const star = icon(STAR, box.w * 0.9, 100);
  star.position.set(x, y);
  star.tint = 0xffe58a;
  star.blendMode = 'add';
  over.addChild(star);
  const slashes = [-1, 1].map((s) => {
    const l = lit(over, streakTexture(), x, y, box.w * 1.4, 0xffffff, box.w * 0.09);
    l.rotation = s * 0.75;
    return l;
  });
  const sparks = new Particles(over);
  burst(sparks, { x, y, count: 40, speed: box.w * 2.4, size: box.w * 0.035, tint: [0xffe58a, 0xffffff, 0xffb02e], life: 0.7, stretch: 4 });
  void flare(over, { x, y, w: box.w * 1.8, tint: 0xffd65a, ms: 500 });
  card.shake(12, 240);
  await tween(
    560,
    (u) => {
      star.scale.set(((box.w * 0.9) / 100) * (0.3 + 1.1 * Math.sqrt(u)));
      star.rotation = u * 0.6;
      star.alpha = 1 - span(u, 0.4, 1);
      for (const [i, l] of slashes.entries()) {
        const v = span(u, i * 0.08, 0.45 + i * 0.08);
        l.alpha = bump(v, 0, 1);
        l.scale.x = (0.3 + 0.9 * v) * ((box.w * 1.4) / 256);
      }
    },
    'linear',
    star,
  );
  star.destroy();
  for (const l of slashes) l.destroy();
}

async function headshot({ card, over }: MoveContext): Promise<void> {
  const box = card.box,
    x = box.x + box.w / 2,
    y = H * 0.28;
  const cross = icon(CROSSHAIR, box.w * 0.5, 100);
  cross.position.set(x, y);
  cross.blendMode = 'add';
  over.addChild(cross);
  await tween(
    280,
    (u) => {
      cross.scale.set(((box.w * 0.5) / 100) * (2.2 - 1.2 * u));
      cross.rotation = (1 - u) * 1.5;
      cross.alpha = u;
    },
    'in-2',
    cross,
  );
  const sparks = new Particles(over);
  burst(sparks, { x, y, count: 30, speed: box.w * 2.2, size: box.w * 0.035, tint: [0xff2d3a, 0xffffff, 0xff8a8a], life: 0.6, stretch: 5 });
  void flare(over, { x, y, w: box.w * 1.4, tint: 0xff2d3a, texture: ringTexture(), from: 0.2, to: 1.4, ms: 500 });
  void flare(over, { x, y, w: box.w * 0.9, tint: 0xffffff, ms: 260 });
  card.shake(14, 260);
  await tween(380, (u) => void (cross.alpha = 1 - u), 'linear', cross);
  cross.destroy();
}

async function laser({ card, over, away }: MoveContext): Promise<void> {
  const box = card.box,
    y = H * 0.45;
  const toward = -away;
  const x0 = box.x + box.w / 2 + toward * box.w * 1.5;
  const len = box.w * 3.2;
  const beam = lit(over, streakTexture(), box.x + box.w / 2, y, len, 0x9b4dff, box.w * 0.34);
  const core = lit(over, streakTexture(), box.x + box.w / 2, y, len, 0xffffff, box.w * 0.1);
  const sparks = new Particles(over);
  await tween(
    750,
    (u) => {
      const grow = span(u, 0, 0.18),
        out = span(u, 0.75, 1);
      const w = len * grow;
      beam.width = core.width = w;
      beam.x = core.x = x0 - toward * w / 2;
      beam.height = box.w * 0.34 * (1 - out) * (1 + 0.08 * Math.sin(u * 90));
      core.height = box.w * 0.1 * (1 - out);
      beam.alpha = core.alpha = 1 - out;
      if (grow >= 1 && u < 0.75 && Math.random() < 0.8)
        burst(sparks, { x: box.x + box.w / 2 - toward * box.w * 0.45, y, count: 3, speed: box.w * 1.6, size: box.w * 0.03, tint: [0xd8b4fe, 0xffffff], angle: toward > 0 ? 0 : Math.PI, spread: 1.2, life: 0.4, stretch: 4 });
    },
    'linear',
    beam,
  );
  card.shake(10, 300);
  beam.destroy();
  core.destroy();
}

async function reap({ card, over, away }: MoveContext): Promise<void> {
  const box = card.box,
    cx = box.x + box.w / 2,
    cy = H * 0.5;
  const g = new Graphics();
  over.addChild(g);
  const tear = lit(over, streakTexture(), cx, cy, box.w * 1.6, 0xff4060, box.w * 0.1);
  tear.rotation = away * 0.5;
  tear.alpha = 0;
  const R = box.w * 0.9;
  await tween(
    620,
    (u) => {
      g.clear();
      const sweep = span(u, 0, 0.45);
      if (sweep > 0 && sweep < 1) {
        // the crescent: two arcs, the blade's edge bright
        const a0 = -2.2 + 2.4 * sweep;
        const pts: number[] = [];
        for (let i = 0; i <= 14; i++) {
          const a = a0 - 0.9 + (0.9 * i) / 14;
          pts.push(cx + away * Math.cos(a) * R, cy + Math.sin(a) * R + H * 0.25);
        }
        for (let i = 14; i >= 0; i--) {
          const a = a0 - 0.9 + (0.9 * i) / 14;
          const r = R * (1 - 0.12 * Math.sin((Math.PI * i) / 14));
          pts.push(cx + away * Math.cos(a) * r, cy + Math.sin(a) * r + H * 0.25);
        }
        g.poly(pts).fill({ color: 0x5a0012, alpha: 0.85 });
        g.poly(pts.slice(0, 30)).stroke({ color: 0xffb3c0, width: box.w * 0.01 });
      }
      tear.alpha = bump(u, 0.3, 1);
      tear.scale.y = ((box.w * 0.1) / 32) * (1 - span(u, 0.6, 1));
    },
    'linear',
    g,
  );
  card.shake(12, 260);
  g.destroy();
  tear.destroy();
}

async function detonate({ card, over }: MoveContext): Promise<void> {
  const box = card.box,
    x = box.x + box.w / 2,
    y = H * 0.5;
  const debris = new Particles(over);
  void flare(over, { x, y, w: box.w * 2.2, tint: 0xffffff, ms: 220, from: 0.6, to: 1 });
  void flare(over, { x, y, w: box.w * 1.8, tint: 0xff7a1a, ms: 700, from: 0.3, to: 1.3 });
  void flare(over, { x, y, w: box.w * 2.4, tint: 0xffc070, texture: ringTexture(), ms: 600, from: 0.1, to: 1.5 });
  burst(debris, { x, y, count: 50, speed: box.w * 3, size: box.w * 0.04, tint: [0xffd27a, 0xff6a1a, 0xffffff, 0x5a2a10], life: 0.9, gravity: H * 1.2, stretch: 3 });
  const smoke = Array.from({ length: 6 }, () => {
    const s = lit(over, puffTexture(), x, y, box.w * 0.5, 0x3a3030, box.w * 0.5, 'normal');
    return { s, a: Math.random() * Math.PI * 2, v: 0.3 + 0.4 * Math.random() };
  });
  card.shake(18, 380);
  await tween(
    1000,
    (u) => {
      for (const p of smoke) {
        p.s.position.set(x + Math.cos(p.a) * box.w * p.v * u, y + Math.sin(p.a) * box.w * p.v * u - H * 0.15 * u);
        p.s.width = p.s.height = box.w * (0.5 + 0.8 * u);
        p.s.alpha = 0.6 * (1 - u);
      }
    },
    'out-cubic',
    over,
  );
  for (const p of smoke) p.s.destroy();
}

async function lightning({ card, over }: MoveContext): Promise<void> {
  const box = card.box,
    x = box.x + box.w / 2,
    y = H * 0.45;
  const g = new Graphics();
  g.blendMode = 'add';
  over.addChild(g);
  const sparks = new Particles(over);
  const strike = () => {
    g.clear();
    const pts = jagged(x + (Math.random() - 0.5) * box.w * 0.6, -H * 1.6, x, y, 14, box.w * 0.22);
    glowLine(g, pts, 0x8fd0ff, box.w * 0.025);
    // a branch
    const k = 2 * (4 + Math.floor(Math.random() * 6));
    const br = jagged(pts[k]!, pts[k + 1]!, pts[k]! + (Math.random() - 0.5) * box.w, pts[k + 1]! + H * 0.35, 6, box.w * 0.08);
    glowLine(g, br, 0x8fd0ff, box.w * 0.012, 0.7);
  };
  for (let i = 0; i < 3; i++) {
    strike();
    g.alpha = 1;
    if (i === 0) {
      card.shake(14, 320);
      void flare(over, { x, y, w: box.w * 2, tint: 0xbfe6ff, ms: 450 });
      burst(sparks, { x, y, count: 36, speed: box.w * 2.6, size: box.w * 0.03, tint: [0xffffff, 0x8fd0ff], life: 0.5, stretch: 6 });
    }
    await tween(90, (u) => void (g.alpha = 1 - 0.7 * u), 'linear', g);
  }
  await tween(200, (u) => void (g.alpha = 0.3 * (1 - u)), 'linear', g);
  g.destroy();
}

async function missile({ card, over, away }: MoveContext): Promise<void> {
  const box = card.box,
    x = box.x + box.w / 2,
    y = H * 0.42;
  const toward = -away;
  const x0 = x + toward * box.w * 2.2,
    y0 = y - H * 0.35;
  const head = lit(over, glowTexture(), x0, y0, box.w * 0.22, 0xffd08a);
  const trail = new Particles(over, puffTexture());
  trail.box.blendMode = 'normal';
  await tween(
    420,
    (u) => {
      head.position.set(x0 + (x - x0) * u, y0 + (y - y0) * u - H * 0.12 * Math.sin(Math.PI * u));
      trail.add({ x: head.x, y: head.y, vx: 0, vy: -H * 0.05, life: 0.6, size: box.w * 0.16, tint: 0x8a8a8a, drag: 1 });
    },
    'in-2',
    head,
  );
  head.destroy();
  const sparks = new Particles(over);
  void flare(over, { x, y, w: box.w * 1.4, tint: 0xff9a3a, ms: 450 });
  burst(sparks, { x, y, count: 28, speed: box.w * 2.2, size: box.w * 0.035, tint: [0xffd27a, 0xff6a1a, 0xffffff], life: 0.6, stretch: 3 });
  card.shake(12, 260);
  await wait(500);
}

async function breath({ card, over, away }: MoveContext): Promise<void> {
  const box = card.box,
    x = box.x + box.w / 2,
    y = H * 0.45;
  const toward = -away;
  const fire = new Particles(over);
  const from = x + toward * box.w * 1.3;
  void flare(over, { x, y, w: box.w * 1.6, h: H * 1.1, tint: 0xff6a1a, ms: 1100, from: 0.6, to: 1, alpha: 0.55 });
  await tween(
    1000,
    (u) => {
      if (u < 0.8)
        burst(fire, {
          x: from,
          y: y + (Math.random() - 0.5) * H * 0.1,
          count: 6,
          speed: box.w * 3,
          size: box.w * 0.12,
          tint: [0xffd27a, 0xff8a1a, 0xff3a0a],
          angle: toward > 0 ? Math.PI : 0,
          spread: 0.55,
          life: 0.55,
          drag: 1.2,
          stretch: 1.5,
        });
      if (u > 0.2 && u < 0.8) card.shake(4, 80);
    },
    'linear',
    over,
  );
  await wait(400);
}

async function cut({ card, over }: MoveContext): Promise<void> {
  const box = card.box,
    x = box.x + box.w / 2,
    y = H * 0.4;
  const s = lit(over, streakTexture(), x, y, box.w * 1.8, 0xe2e8f0, box.w * 0.05);
  s.rotation = -0.5;
  await tween(
    300,
    (u) => {
      s.alpha = bump(u, 0, 1);
      s.scale.x = ((box.w * 1.8) / 256) * (0.2 + 0.8 * u);
    },
    'out-cubic',
    s,
  );
  s.destroy();
}

async function execute({ card, over }: MoveContext): Promise<void> {
  const box = card.box,
    x = box.x + box.w / 2;
  const blade = lit(over, streakTexture(), x, H / 2, H * 1.3, 0xff2030, box.w * 0.12);
  blade.rotation = Math.PI / 2;
  const core = lit(over, streakTexture(), x, H / 2, H * 1.3, 0xffffff, box.w * 0.035);
  core.rotation = Math.PI / 2;
  await tween(
    360,
    (u) => {
      const yy = -H * 0.6 + H * 1.1 * u;
      blade.y = core.y = yy;
      blade.alpha = core.alpha = 1 - span(u, 0.8, 1);
    },
    'in-2',
    blade,
  );
  card.shake(18, 320);
  void flare(over, { x, y: H / 2, w: box.w * 0.5, h: H * 1.2, tint: 0xff2030, ms: 500 });
  blade.destroy();
  core.destroy();
  await wait(300);
}

export const criticalMove = defineMoveFx({ play: critical });
export const headshotMove = defineMoveFx({ play: headshot });
export const laserMove = defineMoveFx({ play: laser });
export const reapMove = defineMoveFx({ play: reap });
export const detonateMove = defineMoveFx({ play: detonate });
export const lightningMove = defineMoveFx({ play: lightning });
export const missileMove = defineMoveFx({ play: missile });
export const breathMove = defineMoveFx({ play: breath });
export const cutMove = defineMoveFx({ play: cut });
export const executeMove = defineMoveFx({ play: execute });
