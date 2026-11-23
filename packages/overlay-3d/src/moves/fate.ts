// The great moments of a card: its ultimate, its death and its return, the death it refuses, its victory.
//   ultimate     (ultime, ultime_desespoir, prog_ult): red and black flames blaze up all around the card,
//                Super Saiyan style (what the legacy's flames wanted to be), and die down;
//   shatter      (reanim_mort, a card destroyed, a trap destroyed: piege_detruit): the card cracks, then
//                breaks into shards that fly apart and fall. The card stays hidden after it (it is
//                broken): `reform` brings it back;
//   reform       (reanim): the shards fly back together, the card glows and shows again, a golden halo
//                above it;
//   deathAvoid   (protege, evite la mort): a skull rises over the card, a golden bar strikes it out, the
//                skull breaks, the card flashes gold (the legacy's skull refusing death);
//   wardBreak    (protection_brisee): a small golden shield emblem cracks and falls apart;
//   victory      (fin, the winner): golden glints twinkle all over and around the card, a warm light.
// The shards are pieces of a snapshot of the card's face (engine/snapshot.ts), on the `behind` layer: the
// card itself is hidden while they fly.

import { Rectangle, Sprite, Texture } from 'pixi.js';
import { H, W } from '@forestcard/layout';
import { Particles } from '../engine/particles.ts';
import { makeMesh } from '../engine/shader.ts';
import { release, snapshot } from '../engine/snapshot.ts';
import { glowTexture } from '../engine/textures.ts';
import { every, tween, wait } from '../engine/time.ts';
import { burst, bump, flare, icon, lit, ringTexture, span } from '../kit/draw.ts';
import { defineMoveFx, type MoveContext } from './define.ts';

// Flames around the card: the card's rounded outline (uBox: its half size in the quad's uv), flames
// rising from it (noise carried upward), red near the card, black smoke at their tips. Normal blend,
// premultiplied: the black covers.
const FLAMES = `
float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main(void){
  vec2 p = vUV - 0.5;
  float d = sdBox(p, uBox, 0.03);                         // < 0 inside the card
  if (d < -0.004) { finalColor = vec4(0.0); return; }     // nothing over the card
  // the flames lean up: above the card they reach further
  float up = smoothstep(0.15, -0.55, p.y);
  float reach = max((0.06 + 0.11 * up) * uPower, 0.001);
  // tongues: noise along the outline, carried upward, sharpened against the distance
  float along = atan(p.y, p.x) * 3.0;
  float n = fbm(vec2(along * 1.8 + p.x * 6.0, d * 14.0 - uTime * 3.2 + p.y * 8.0));
  float f = smoothstep(0.0, 0.3, n * 1.3 - d / reach);
  float h = clamp(1.0 - d / reach, 0.0, 1.0);             // 1 at the card, 0 at the reach
  // white-orange at the root, red, then black smoke at the tips
  vec3 col = mix(vec3(0.02, 0.0, 0.0), vec3(0.78, 0.04, 0.02), smoothstep(0.12, 0.5, h));
  col = mix(col, vec3(1.0, 0.5, 0.12), smoothstep(0.72, 0.97, h) * 0.85);
  float a = f * uAlpha * (0.6 + 0.4 * smoothstep(0.0, 0.35, h));
  float rim = exp(-max(d, 0.0) * 180.0) * uAlpha;
  vec3 pre = col * a + vec3(1.0, 0.25, 0.1) * rim;        // premultiplied
  a = max(a, rim * 0.85);
  float keep = smoothstep(0.5, 0.43, max(abs(p.x), abs(p.y)));   // never reaches the quad's edge
  finalColor = vec4(pre * keep, a * keep);
}`;

async function ultimate({ card, behind }: MoveContext): Promise<void> {
  const box = card.box;
  const size = Math.max(box.w, H) * 1.7;
  const m = makeMesh('move-ultimate-flames', FLAMES, { uTime: Math.random() * 10, uPower: 0, uAlpha: 0, uBox: [box.w / size / 2, H / size / 2] }, { blend: 'normal' });
  m.mesh.scale.set(size);
  m.mesh.position.set(W / 2, H / 2);
  behind.addChild(m.mesh);
  const run = every(m.mesh, (dt) => void (m.u.uTime += dt));
  card.shake(8, 400);
  await tween(
    1500,
    (u) => {
      m.u.uPower = 0.4 + 0.6 * bump(u, 0, 1) + 0.25 * span(u, 0, 0.15);
      m.u.uAlpha = Math.min(1, u * 6) * (1 - span(u, 0.75, 1));
    },
    'linear',
    m.mesh,
  );
  run.stop();
}

// the face in pieces: a grid of 4 x 6, each piece a sprite of the snapshot
function pieces(ctx: MoveContext, rt: Texture) {
  const box = ctx.card.box;
  const cols = 4,
    rows = 6;
  const out: { s: Sprite; x: number; y: number; vx: number; vy: number; spin: number }[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const fw = box.w / cols,
        fh = H / rows;
      const fx = box.x + i * fw,
        fy = j * fh;
      const tex = new Texture({ source: rt.source, frame: new Rectangle(fx, fy, fw, fh) });
      const s = new Sprite({ texture: tex, anchor: 0.5 });
      s.position.set(fx + fw / 2, fy + fh / 2);
      ctx.behind.addChild(s);
      const ax = (fx + fw / 2 - W / 2) / box.w,
        ay = (fy + fh / 2 - H / 2) / H;
      out.push({ s, x: s.x, y: s.y, vx: ax * box.w * (1.2 + Math.random()), vy: ay * H * 0.8 - H * (0.3 + 0.4 * Math.random()), spin: (Math.random() - 0.5) * 6 });
    }
  return out;
}

async function shatter(ctx: MoveContext): Promise<void> {
  const { card, app, behind } = ctx,
    root = card.root;
  const res = Math.min(2, Math.max(0.2, root.worldTransform.a * app.renderer.resolution));
  const rt = snapshot(app, card.front, res);
  card.shake(10, 260);
  void flare(ctx.over, { x: W / 2, y: H / 2, w: card.box.w * 1.3, tint: 0xffffff, ms: 260, alpha: 0.7 });
  await wait(240);
  const list = pieces(ctx, rt);
  root.alpha = 0;
  const dust = new Particles(behind);
  burst(dust, { x: W / 2, y: H / 2, count: 30, speed: card.box.w * 1.5, size: card.box.w * 0.03, tint: [0xffffff, 0xdddddd], life: 0.8, jitter: card.box.w * 0.6 });
  await tween(
    1000,
    (u) => {
      for (const p of list) {
        p.s.position.set(p.x + p.vx * u, p.y + p.vy * u + H * 1.6 * u * u);
        p.s.rotation = p.spin * u;
        p.s.alpha = 1 - span(u, 0.55, 1);
      }
    },
    'linear',
    behind,
  );
  for (const p of list) p.s.destroy();
  release(rt);
}

async function reform(ctx: MoveContext): Promise<void> {
  const { card, app, behind, over } = ctx,
    root = card.root;
  root.alpha = 1;
  const res = Math.min(2, Math.max(0.2, root.worldTransform.a * app.renderer.resolution));
  const rt = snapshot(app, card.front, res);
  root.alpha = 0;
  const list = pieces(ctx, rt);
  await tween(
    800,
    (u) => {
      const v = 1 - u;
      for (const p of list) {
        p.s.position.set(p.x + p.vx * v * 0.7, p.y + p.vy * v * 0.7 - H * 0.2 * v);
        p.s.rotation = p.spin * v;
        p.s.alpha = span(u, 0, 0.4);
      }
    },
    'out-cubic',
    behind,
  );
  for (const p of list) p.s.destroy();
  release(rt);
  root.alpha = 1;
  const box = card.box;
  void flare(over, { x: W / 2, y: H / 2, w: box.w * 1.6, tint: 0xfff1b0, ms: 600 });
  // the halo, above the card
  const halo = lit(over, ringTexture(), W / 2, -H * 0.06, box.w * 0.55, 0xffd65a, box.w * 0.16);
  const glow = lit(over, glowTexture(), W / 2, -H * 0.06, box.w * 0.8, 0xffd65a, box.w * 0.3);
  await tween(
    1200,
    (u) => {
      halo.alpha = bump(u, 0, 1);
      glow.alpha = 0.6 * bump(u, 0, 1);
      halo.y = glow.y = -H * (0.02 + 0.05 * u);
    },
    'linear',
    halo,
  );
  halo.destroy();
  glow.destroy();
}

const SKULL = `<svg viewBox="0 0 100 110"><path d="M50 4C25 4 8 22 8 46c0 14 6 24 14 30v14c0 5 4 9 9 9h38c5 0 9-4 9-9V76c8-6 14-16 14-30C92 22 75 4 50 4z" fill="#f1ede4" stroke="#2b2620" stroke-width="4"/>
<ellipse cx="33" cy="50" rx="11" ry="13" fill="#2b2620"/><ellipse cx="67" cy="50" rx="11" ry="13" fill="#2b2620"/><path d="M50 62 L44 76 H56 Z" fill="#2b2620"/>
<path d="M36 90v10M44 90v10M56 90v10M64 90v10" stroke="#2b2620" stroke-width="4"/></svg>`;

async function deathAvoid({ card, over }: MoveContext): Promise<void> {
  const box = card.box,
    x = W / 2,
    y = H * 0.4;
  const skull = icon(SKULL, box.w * 0.5, 100, 110);
  skull.position.set(x, y + H * 0.1);
  skull.alpha = 0;
  over.addChild(skull);
  const k = (box.w * 0.5) / 100;
  await tween(
    380,
    (u) => {
      skull.alpha = u;
      skull.y = y + H * 0.1 * (1 - u);
      skull.scale.set(k * (0.7 + 0.3 * u));
    },
    'out-cubic',
    skull,
  );
  // struck out: a golden bar slams across it
  const bar = lit(over, glowTexture(), x, y, box.w * 0.9, 0xffd65a, box.w * 0.12);
  bar.rotation = -0.7;
  void flare(over, { x, y, w: box.w * 1.2, tint: 0xffd65a, ms: 500 });
  card.shake(10, 240);
  const sparks = new Particles(over);
  burst(sparks, { x, y, count: 30, speed: box.w * 2, size: box.w * 0.035, tint: [0xffd65a, 0xffffff, 0xf1ede4], life: 0.7, gravity: H * 1.2 });
  await tween(
    600,
    (u) => {
      bar.alpha = 1 - u;
      skull.alpha = 1 - span(u, 0.1, 0.6);
      skull.scale.set(k * (1 + 0.3 * u));
      skull.rotation = 0.2 * u;
    },
    'linear',
    skull,
  );
  bar.destroy();
  skull.destroy();
}

const WARD = `<svg viewBox="0 0 100 120"><path d="M50 4 L92 18 L88 64 C84 92 66 108 50 116 C34 108 16 92 12 64 L8 18 Z" fill="#e8b54a" stroke="#3b2304" stroke-width="5"/></svg>`;

async function wardBreak({ card, over }: MoveContext): Promise<void> {
  const box = card.box,
    x = W / 2,
    y = H * 0.2;
  const halves = [-1, 1].map((s) => {
    const g = icon(WARD, box.w * 0.28, 100, 120);
    g.position.set(x, y);
    over.addChild(g);
    return { g, s };
  });
  void flare(over, { x, y, w: box.w * 0.7, tint: 0xffd65a, ms: 300 });
  await wait(200);
  card.shake(6, 180);
  await tween(
    600,
    (u) => {
      for (const h of halves) {
        h.g.x = x + h.s * box.w * 0.15 * u;
        h.g.y = y + H * 0.4 * u * u;
        h.g.rotation = h.s * 0.8 * u;
        h.g.alpha = 1 - span(u, 0.5, 1);
        h.g.scale.x = ((box.w * 0.28) / 100) * (1 - 0.5 * u);
      }
    },
    'linear',
    over,
  );
  for (const h of halves) h.g.destroy();
}

const GLINT = `<svg viewBox="0 0 100 100"><path d="M50 0 C53 40 60 47 100 50 C60 53 53 60 50 100 C47 60 40 53 0 50 C40 47 47 40 50 0Z" fill="#ffffff"/></svg>`;

async function victory({ card, over }: MoveContext): Promise<void> {
  const box = card.box;
  const glow = lit(over, glowTexture(), W / 2, H / 2, box.w * 1.9, 0xffcf5a, H * 1.5);
  glow.alpha = 0;
  const glints = Array.from({ length: 16 }, () => {
    const g = icon(GLINT, box.w * (0.06 + 0.08 * Math.random()), 100);
    g.position.set(box.x + box.w * (-0.1 + 1.2 * Math.random()), H * (-0.05 + 1.1 * Math.random()));
    g.tint = Math.random() < 0.5 ? 0xffe9a8 : 0xffffff;
    g.blendMode = 'add';
    g.alpha = 0;
    over.addChild(g);
    return { g, d: Math.random() * 0.7, k: g.scale.x };
  });
  await tween(
    1800,
    (u) => {
      glow.alpha = 0.45 * bump(u, 0, 1);
      for (const s of glints) {
        const v = bump(u, s.d, s.d + 0.3);
        s.g.alpha = v;
        s.g.scale.set(s.k * (0.4 + 0.8 * v));
        s.g.rotation = u * 2;
      }
    },
    'linear',
    glow,
  );
  for (const s of glints) s.g.destroy();
  glow.destroy();
}

export const ultimateMove = defineMoveFx({ play: ultimate });
export const shatterMove = defineMoveFx({ play: shatter });
export const reformMove = defineMoveFx({ play: reform });
export const deathAvoidMove = defineMoveFx({ play: deathAvoid });
export const wardBreakMove = defineMoveFx({ play: wardBreak });
export const victoryMove = defineMoveFx({ play: victory });
