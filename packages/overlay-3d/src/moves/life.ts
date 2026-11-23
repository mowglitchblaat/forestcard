// The moves that give or take life, or change what a card is worth.
//   heal     (soin, regen, lien_soin, sangsue_soin): a soft green-gold light wells up from the bottom of
//            the card, motes and small crosses of light rise through it;
//   drain    (sangsue, vol de vie): red motes stream in from the opponent's side and sink into the
//            card, which pulses red, then warm;
//   buff     (an ATQ or PV raised: stat, defense, esq, fureur…): bright chevrons climb the card in a
//            column, a light rises with them;
//   debuff   (an ATQ or PV lowered: calcine, malediction…): dark chevrons sink down the card, it dims;
//   swap     (echange): a blue light and a red light chase each other round the card and swap places
//            (ATQ and PV traded, the legacy's Polymerisation look);
//   purify   (purif): a band of yellow light sweeps down the card, motes in its wake (the legacy's
//            yellow aura running over the card).

import { Container, Graphics } from 'pixi.js';
import { H } from '@forestcard/layout';
import { Particles } from '../engine/particles.ts';
import { glowTexture } from '../engine/textures.ts';
import { tween, wait } from '../engine/time.ts';
import { burst, bump, flare, icon, lit, span, streakTexture } from '../kit/draw.ts';
import { defineMoveFx, type MoveContext } from './define.ts';

const CROSS = `<svg viewBox="0 0 20 20"><path d="M8 2h4v6h6v4h-6v6H8v-6H2V8h6z" fill="#ffffff"/></svg>`;
const CHEVRON = `<svg viewBox="0 0 40 24"><path d="M2 22 L20 4 L38 22" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

async function heal({ card, over }: MoveContext): Promise<void> {
  const box = card.box,
    cx = box.x + box.w / 2;
  const glow = lit(over, glowTexture(), cx, H * 0.85, box.w * 1.4, 0x7dffa0, H * 0.7);
  glow.alpha = 0;
  const motes = new Particles(over);
  burst(motes, {
    x: cx,
    y: H * 0.9,
    count: 34,
    speed: H * 0.55,
    size: box.w * 0.035,
    tint: [0x9dffb0, 0xfff3a0, 0xffffff],
    angle: -Math.PI / 2,
    spread: 0.7,
    life: 1.4,
    drag: 0.6,
    jitter: box.w * 0.8,
  });
  const crosses = Array.from({ length: 5 }, (_, i) => {
    const c = icon(CROSS, box.w * (0.08 + 0.04 * Math.random()), 20);
    c.position.set(box.x + box.w * (0.15 + 0.7 * Math.random()), H * 0.85);
    c.tint = i % 2 ? 0xfff3a0 : 0x9dffb0;
    c.blendMode = 'add';
    c.alpha = 0;
    over.addChild(c);
    return { c, d: i * 0.1, y0: c.y };
  });
  await tween(
    1100,
    (u) => {
      glow.alpha = 0.7 * bump(u, 0, 1);
      glow.y = H * (0.85 - 0.3 * u);
      for (const k of crosses) {
        const v = span(u, k.d, k.d + 0.6);
        k.c.y = k.y0 - H * 0.55 * v;
        k.c.alpha = bump(v, 0, 1);
      }
    },
    'linear',
    glow,
  );
  for (const k of crosses) k.c.destroy();
  glow.destroy();
}

async function drain({ card, over, away }: MoveContext): Promise<void> {
  const box = card.box,
    cx = box.x + box.w / 2,
    cy = H * 0.45;
  const from = cx - away * box.w * 1.6;
  const motes: { s: ReturnType<typeof lit>; d: number; y: number; arc: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const s = lit(over, glowTexture(), from, cy, box.w * 0.1, i % 3 ? 0xff2a4a : 0xff8a9a);
    s.alpha = 0;
    motes.push({
      s,
      d: i * 0.035,
      y: cy + (Math.random() - 0.5) * H * 0.3,
      arc: (Math.random() - 0.5) * H * 0.4,
    });
  }
  await tween(
    900,
    (u) => {
      for (const m of motes) {
        const v = span(u, m.d, m.d + 0.5);
        m.s.x = from + (cx - from) * v * v;
        m.s.y = m.y + (cy - m.y) * v + m.arc * Math.sin(Math.PI * v);
        m.s.alpha = v > 0 && v < 1 ? 0.9 : 0;
      }
    },
    'linear',
    over,
  );
  for (const m of motes) m.s.destroy();
  await flare(over, { x: cx, y: cy, w: box.w * 1.3, tint: 0xff3355, ms: 450 });
}

function chevrons(up: boolean) {
  return async ({ card, over }: MoveContext): Promise<void> => {
    const box = card.box,
      cx = box.x + box.w / 2;
    const col = up ? 0x7dffb2 : 0xb04ad8;
    const list = Array.from({ length: 4 }, (_, i) => {
      const c = icon(CHEVRON, box.w * 0.34, 40, 24);
      c.position.set(cx, H / 2);
      c.tint = col;
      c.blendMode = up ? 'add' : 'normal';
      if (!up) c.rotation = Math.PI;
      c.alpha = 0;
      over.addChild(c);
      return { c, d: i * 0.12 };
    });
    const beam = lit(over, streakTexture(), cx, H / 2, H * 0.9, col, box.w * 0.5);
    beam.rotation = Math.PI / 2;
    beam.alpha = 0;
    const shade = up
      ? null
      : new Graphics()
          .roundRect(box.x, 0, box.w, H, box.w * 0.06)
          .fill({ color: 0x1a0024, alpha: 1 });
    if (shade) {
      shade.alpha = 0;
      over.addChildAt(shade, 0);
    }
    await tween(
      950,
      (u) => {
        for (const k of list) {
          const v = span(u, k.d, k.d + 0.55);
          k.c.y = up ? H * (0.8 - 0.65 * v) : H * (0.2 + 0.65 * v);
          k.c.alpha = bump(v, 0, 1);
        }
        beam.alpha = 0.5 * bump(u, 0, 1);
        if (shade) shade.alpha = 0.35 * bump(u, 0, 1);
      },
      'linear',
      beam,
    );
    for (const k of list) k.c.destroy();
    beam.destroy();
    shade?.destroy();
  };
}

async function swap({ card, over }: MoveContext): Promise<void> {
  const box = card.box,
    cx = box.x + box.w / 2,
    cy = H / 2;
  const blue = lit(over, glowTexture(), cx, cy, box.w * 0.45, 0x3b82f6);
  const red = lit(over, glowTexture(), cx, cy, box.w * 0.45, 0xef4444);
  const trail = new Particles(over);
  await tween(
    1000,
    (u) => {
      const a = Math.PI * 3 * u * u;
      const rx = box.w * 0.42 * Math.sin(Math.PI * u),
        ry = H * 0.32 * Math.sin(Math.PI * u);
      blue.position.set(cx - Math.cos(a) * rx, cy - Math.sin(a) * ry);
      red.position.set(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
      blue.alpha = red.alpha = bump(u, 0, 1);
      if (Math.random() < 0.6) {
        trail.add({
          x: blue.x,
          y: blue.y,
          vx: 0,
          vy: 0,
          life: 0.4,
          size: box.w * 0.08,
          tint: 0x60a5fa,
        });
        trail.add({
          x: red.x,
          y: red.y,
          vx: 0,
          vy: 0,
          life: 0.4,
          size: box.w * 0.08,
          tint: 0xf87171,
        });
      }
    },
    'linear',
    blue,
  );
  blue.destroy();
  red.destroy();
  await flare(over, { x: cx, y: cy, w: box.w * 1.2, tint: 0xd8b4fe, ms: 400 });
}

async function purify({ card, over }: MoveContext): Promise<void> {
  const box = card.box,
    cx = box.x + box.w / 2;
  const band = new Container();
  over.addChild(band);
  const light = lit(band, streakTexture(), cx, 0, box.w * 1.5, 0xffe86a, H * 0.14);
  const core = lit(band, streakTexture(), cx, 0, box.w * 1.2, 0xffffff, H * 0.04);
  const motes = new Particles(over);
  await tween(
    900,
    (u) => {
      const y = H * (-0.05 + 1.1 * u);
      light.y = core.y = y;
      band.alpha = bump(u, 0, 1) ** 0.5;
      if (Math.random() < 0.7)
        burst(motes, {
          x: cx,
          y,
          count: 2,
          speed: box.w * 0.25,
          size: box.w * 0.03,
          tint: [0xfff3a0, 0xffffff],
          life: 0.8,
          gravity: -H * 0.2,
          jitter: box.w,
        });
    },
    'linear',
    band,
  );
  band.destroy({ children: true });
  await wait(300);
}

export const healMove = defineMoveFx({ play: heal });
export const drainMove = defineMoveFx({ play: drain });
export const buffMove = defineMoveFx({ play: chevrons(true) });
export const debuffMove = defineMoveFx({ play: chevrons(false) });
export const swapMove = defineMoveFx({ play: swap });
export const purifyMove = defineMoveFx({ play: purify });
