// The moves of the mechanics with a moment of their own.
//   seize       (controle: the puppeteer takes the card): violet strings snap taut from above, the card
//               is yanked up and tilts, as a puppet does;
//   release     (controle_fin): the strings snap, the card drops back into place;
//   gulp        (avale: the swallow): a dark maw closes over the card, top and bottom jaws with teeth,
//               then opens again;
//   spit        (recrache): green spit bursts off the card;
//   forgeStrike (forge, forge_vide): a hammer comes down on the card's top corner, sparks fly;
//   forgeCreate (forge_creation: a magic or a trap forged): a golden glow, a card's silhouette rises from
//               it;
//   iceBurst    (eclat_glace, glaciation that breaks): the ice bursts off the card in pale shards;
//   steam       (degel, feu_eteint, vaporisation: fire against ice): steam puffs up off the card;
//   steal       (vol: a magic, a trap or an ultimate stolen): a violet vortex, a ghost of the card is
//               pulled toward the opponent;
//   cancelled   (magie_annulee): a red X slashes across the card, which dims.

import { Graphics, Sprite } from 'pixi.js';
import { H, W } from '@forestcard/layout';
import { Particles } from '../engine/particles.ts';
import { release as releaseRt, snapshot } from '../engine/snapshot.ts';
import { glowTexture } from '../engine/textures.ts';
import { tween, wait } from '../engine/time.ts';
import { burst, bump, flare, icon, lit, puffTexture, ringTexture, shardTexture, span, streakTexture } from '../kit/draw.ts';
import { defineMoveFx, type MoveContext } from './define.ts';

const VIOLET = 0xc08aff;

function strings(ctx: MoveContext, snap: boolean) {
  return async (): Promise<void> => {
    const { card, over } = ctx,
      box = card.box,
      root = card.root;
    const g = new Graphics();
    over.addChild(g);
    const ends = [0.15, 0.5, 0.85].map((f) => box.x + f * box.w);
    const base = { y: root.pivot.y, angle: root.angle };
    await tween(
      snap ? 520 : 750,
      (u) => {
        g.clear();
        const taut = snap ? 1 - span(u, 0, 0.25) : span(u, 0, 0.3);
        for (const [i, x] of ends.entries()) {
          if (snap) {
            // snapped: each string whips up out of sight
            const top = -H * 1.4,
              cut = H * 0.05 - H * 0.9 * span(u, 0, 0.6);
            g.moveTo(x, top).lineTo(x + (i - 1) * box.w * 0.05, cut);
          } else g.moveTo(x, -H * 1.4).lineTo(x, H * 0.05 * taut);
          g.stroke({ color: VIOLET, width: box.w * 0.008, alpha: snap ? 1 - u : 1 });
        }
        // the card: yanked up and tilted while seized, back when released
        const lift = snap ? 1 - span(u, 0, 0.5) : bump(u, 0.25, 1.2);
        root.pivot.y = base.y + H * 0.08 * lift;
        root.angle = base.angle + 4 * Math.sin(u * 14) * lift;
      },
      'linear',
      g,
    );
    root.pivot.y = base.y;
    root.angle = base.angle;
    if (!snap) void flare(over, { x: W / 2, y: H * 0.3, w: box.w * 1.2, tint: VIOLET, ms: 500 });
    else card.shake(6, 200);
    g.destroy();
  };
}

const JAW_TOP = (w: number) => {
  const g = new Graphics();
  g.roundRect(-w / 2, -w * 0.9, w, w * 0.9, w * 0.25).fill(0x1a0a12);
  for (let i = 0; i < 7; i++) {
    const x = -w / 2 + w * (0.08 + (0.84 * i) / 6);
    g.poly([x - w * 0.05, 0, x + w * 0.05, 0, x, w * 0.13]).fill(0xf3eee2);
  }
  g.rect(-w / 2, -w * 0.06, w, w * 0.06).fill(0x6a1426);
  return g;
};

async function gulp({ card, over }: MoveContext): Promise<void> {
  const box = card.box,
    w = box.w * 1.15;
  const top = JAW_TOP(w),
    bottom = JAW_TOP(w);
  bottom.rotation = Math.PI;
  over.addChild(top, bottom);
  await tween(
    900,
    (u) => {
      const shut = bump(u, 0, 1) ** 0.5;
      top.position.set(W / 2, -H * 0.15 + (H * 0.5 + H * 0.15) * shut);
      bottom.position.set(W / 2, H * 1.15 - (H * 0.5 + H * 0.15) * shut);
      top.alpha = bottom.alpha = Math.min(1, u * 4) * (1 - span(u, 0.85, 1));
      if (u > 0.45 && u < 0.5) card.shake(10, 200);
    },
    'linear',
    top,
  );
  top.destroy();
  bottom.destroy();
}

async function spit({ card, over, away }: MoveContext): Promise<void> {
  const box = card.box;
  const sp = new Particles(over);
  burst(sp, { x: W / 2, y: H * 0.45, count: 40, speed: box.w * 2.4, size: box.w * 0.05, tint: [0x9be15d, 0xd9f99d, 0x4d7c0f], angle: away > 0 ? 0 : Math.PI, spread: 1.6, life: 0.8, gravity: H * 1.5, drag: 1 });
  void flare(over, { x: W / 2, y: H * 0.45, w: box.w * 1.1, tint: 0x9be15d, ms: 400 });
  card.shake(8, 220);
  await wait(700);
}

const HAMMER = `<svg viewBox="0 0 100 100"><rect x="44" y="30" width="12" height="66" rx="5" fill="#6b3a12" stroke="#2b1405" stroke-width="3"/>
<rect x="14" y="8" width="72" height="30" rx="6" fill="#9ca3af" stroke="#1f2937" stroke-width="3"/><rect x="18" y="12" width="64" height="8" rx="3" fill="#e5e7eb"/></svg>`;

async function forgeStrike({ card, over }: MoveContext): Promise<void> {
  const box = card.box,
    x = box.x + box.w * 0.78,
    y = H * 0.1;
  const hammer = icon(HAMMER, box.w * 0.4, 100);
  hammer.pivot.set(50, 90);
  hammer.position.set(x + box.w * 0.15, y + box.w * 0.25);
  over.addChild(hammer);
  await tween(
    360,
    (u) => {
      hammer.rotation = 1.4 - 2.1 * u * u;
      hammer.alpha = Math.min(1, u * 4);
    },
    'linear',
    hammer,
  );
  const sparks = new Particles(over);
  burst(sparks, { x, y, count: 36, speed: box.w * 2.6, size: box.w * 0.03, tint: [0xffe08a, 0xff9a2e, 0xffffff], life: 0.7, angle: -Math.PI / 2, spread: Math.PI * 1.3, gravity: H * 2.2, stretch: 4 });
  void flare(over, { x, y, w: box.w * 0.8, tint: 0xffa040, ms: 400 });
  void flare(over, { x, y, w: box.w * 0.9, tint: 0xffe0a0, texture: ringTexture(), from: 0.1, to: 1.2, ms: 400 });
  card.shake(10, 200);
  await tween(380, (u) => void (hammer.alpha = 1 - u), 'linear', hammer);
  hammer.destroy();
}

async function forgeCreate({ card, over }: MoveContext): Promise<void> {
  const box = card.box;
  const glow = lit(over, glowTexture(), W / 2, H * 0.55, box.w * 1.3, 0xffcf5a);
  const ghost = new Graphics().roundRect(-box.w * 0.18, -H * 0.13, box.w * 0.36, H * 0.26, box.w * 0.03).fill({ color: 0xfff3c4, alpha: 0.85 }).stroke({ color: 0xffffff, width: box.w * 0.01 });
  ghost.blendMode = 'add';
  over.addChild(ghost);
  await tween(
    1000,
    (u) => {
      glow.alpha = 0.7 * bump(u, 0, 1);
      ghost.position.set(W / 2, H * (0.6 - 0.35 * u));
      ghost.alpha = bump(u, 0.1, 1);
      ghost.scale.set(0.6 + 0.5 * u);
    },
    'out-cubic',
    glow,
  );
  glow.destroy();
  ghost.destroy();
}

async function iceBurst({ card, over }: MoveContext): Promise<void> {
  const box = card.box;
  const shards = new Particles(over, shardTexture());
  shards.box.blendMode = 'normal';
  burst(shards, { x: W / 2, y: H / 2, count: 40, speed: box.w * 2.2, size: box.w * 0.09, tint: [0xe0f2fe, 0xbae6fd, 0xffffff], life: 1, gravity: H * 1.4, drag: 1, jitter: box.w * 0.7 });
  void flare(over, { x: W / 2, y: H / 2, w: box.w * 1.6, tint: 0xbae6fd, ms: 450 });
  card.shake(12, 260);
  await wait(800);
}

async function steam({ card, over }: MoveContext): Promise<void> {
  const box = card.box;
  const puffs = Array.from({ length: 8 }, (_, i) => {
    const s = lit(over, puffTexture(), box.x + box.w * (0.15 + 0.7 * Math.random()), H * (0.4 + 0.5 * Math.random()), box.w * 0.4, 0xf1f5f9, box.w * 0.4, 'screen');
    s.alpha = 0;
    return { s, d: i * 0.06, y0: s.y };
  });
  await tween(
    1300,
    (u) => {
      for (const p of puffs) {
        const v = span(u, p.d, p.d + 0.7);
        p.s.y = p.y0 - H * 0.4 * v;
        p.s.width = p.s.height = box.w * (0.35 + 0.5 * v);
        p.s.alpha = 0.7 * bump(v, 0, 1);
      }
    },
    'linear',
    over,
  );
  for (const p of puffs) p.s.destroy();
}

async function steal({ card, app, over, behind, away }: MoveContext): Promise<void> {
  const box = card.box,
    root = card.root;
  const res = Math.min(2, Math.max(0.2, root.worldTransform.a * app.renderer.resolution));
  const rt = snapshot(app, card.front, res);
  const ghost = new Sprite({ texture: rt });
  ghost.alpha = 0;
  behind.addChild(ghost);
  const vortex = lit(over, ringTexture(), W / 2, H / 2, box.w * 0.9, VIOLET);
  const toward = -away;
  await tween(
    900,
    (u) => {
      vortex.rotation = u * 8;
      vortex.alpha = bump(u, 0, 0.7);
      vortex.width = vortex.height = box.w * (1.2 - 0.6 * u);
      const v = span(u, 0.25, 1);
      ghost.alpha = 0.55 * bump(v, 0, 1);
      ghost.scale.set(1 - 0.6 * v);
      ghost.position.set(W * 0.3 * v + toward * box.w * 1.6 * v * v, H * 0.3 * v - H * 0.2 * Math.sin(Math.PI * v));
    },
    'in-out-quad',
    vortex,
  );
  ghost.destroy();
  vortex.destroy();
  releaseRt(rt);
}

async function cancelled({ card, over }: MoveContext): Promise<void> {
  const box = card.box;
  const shade = new Graphics().roundRect(box.x, 0, box.w, H, box.w * 0.06).fill({ color: 0x000000 });
  shade.alpha = 0;
  over.addChild(shade);
  const bars = [-1, 1].map((s) => {
    const l = lit(over, streakTexture(), W / 2, H / 2, Math.hypot(box.w, H) * 0.9, 0xff1a2e, box.w * 0.12);
    l.rotation = s * Math.atan2(H, box.w);
    l.alpha = 0;
    return l;
  });
  await tween(
    800,
    (u) => {
      shade.alpha = 0.45 * span(u, 0, 0.3) * (1 - span(u, 0.8, 1));
      for (const [i, l] of bars.entries()) l.alpha = span(u, 0.1 + i * 0.12, 0.25 + i * 0.12) * (1 - span(u, 0.8, 1));
    },
    'linear',
    shade,
  );
  card.shake(6, 160);
  shade.destroy();
  for (const l of bars) l.destroy();
}

export const seizeMove = defineMoveFx({ play: (c) => strings(c, false)() });
export const releaseMove = defineMoveFx({ play: (c) => strings(c, true)() });
export const gulpMove = defineMoveFx({ play: gulp });
export const spitMove = defineMoveFx({ play: spit });
export const forgeStrikeMove = defineMoveFx({ play: forgeStrike });
export const forgeCreateMove = defineMoveFx({ play: forgeCreate });
export const iceBurstMove = defineMoveFx({ play: iceBurst });
export const steamMove = defineMoveFx({ play: steam });
export const stealMove = defineMoveFx({ play: steal });
export const cancelledMove = defineMoveFx({ play: cancelled });
