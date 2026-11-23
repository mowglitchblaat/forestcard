// The guard (garde): a golden heater shield standing over the card's top edge while the guard holds.
//   it lands:   it drops onto the edge and rings (a golden flash, a ring going out);
//   while laid: a slow golden sheen crosses it;
//   tick:       it holds against a blow: it jolts and flashes;
//   it goes:    it fades ('fade'), or is knocked off ('drop': it spins away and falls).

import { Container, type Sprite } from 'pixi.js';
import { H } from '@forestcard/layout';
import { glowTexture } from '../engine/textures.ts';
import { every, tween, wait } from '../engine/time.ts';
import { flare, icon, lit, ringTexture } from '../kit/draw.ts';
import { defineMarkFx, type MarkContext, type MarkView } from './define.ts';

const GOLD = 0xffcf5a;
const SHIELD = `<svg viewBox="0 0 100 120"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#8a5a12"/><stop offset=".45" stop-color="#ffe08a"/><stop offset=".6" stop-color="#e8b54a"/><stop offset="1" stop-color="#7a4b0c"/></linearGradient></defs>
<path d="M50 4 L92 18 L88 64 C84 92 66 108 50 116 C34 108 16 92 12 64 L8 18 Z" fill="url(#g)" stroke="#3b2304" stroke-width="4"/>
<path d="M50 16 L80 26 L77 62 C74 84 62 96 50 103 C38 96 26 84 23 62 L20 26 Z" fill="none" stroke="#fff3c4" stroke-width="2.5" opacity=".8"/>
<path d="M50 30 L50 92 M32 52 L68 52" stroke="#5a3606" stroke-width="7" stroke-linecap="round"/></svg>`;

function create({ card, layer }: MarkContext): MarkView {
  const box = card.box;
  const w = box.w * 0.24;
  const x = box.x + box.w / 2,
    y = H * 0.02;
  const root = new Container({ label: 'guard' });
  root.position.set(x, y);
  root.alpha = 0;
  layer.addChild(root);
  const glow: Sprite = lit(root, glowTexture(), 0, 0, w * 1.8, GOLD);
  glow.alpha = 0.3;
  root.addChild(icon(SHIELD, w, 100, 120));
  const sheen = lit(root, glowTexture(), 0, 0, w * 0.35, 0xffffff, w * 1.2);
  sheen.rotation = 0.5;
  let on = false,
    jolt = 0;

  const loop = every(layer, (dt, t) => {
    jolt = Math.max(0, jolt - dt * 3);
    const p = ((t * 0.35) % 1) * 2 - 0.5; // the sheen crosses every ~3 s
    sheen.x = p * w;
    sheen.alpha = on ? 0.45 * Math.sin(Math.PI * Math.min(1, Math.max(0, p + 0.5) / 1.5)) : 0;
    root.y = y - jolt * w * 0.12;
    glow.alpha = 0.25 + 0.15 * Math.sin(t * 2) + jolt * 0.6;
  });

  return {
    async set(level, how) {
      if (level && !on) {
        on = true;
        await tween(
          320,
          (u) => {
            root.alpha = u;
            root.y = y - H * 0.18 * (1 - u) * (1 - u);
          },
          'in-2',
          root,
        );
        card.shake(5, 160);
        void flare(layer, {
          x,
          y,
          w: w * 2.6,
          tint: GOLD,
          texture: ringTexture(),
          from: 0.3,
          to: 1.2,
          ms: 500,
        });
      } else if (!level && on) {
        on = false;
        if (how === 'drop')
          await tween(
            700,
            (u) => {
              root.position.set(
                x + box.w * 0.35 * u,
                y - H * 0.08 * Math.sin(Math.PI * u) + H * 0.5 * u * u,
              );
              root.rotation = 3 * u;
              root.alpha = 1 - u;
            },
            'linear',
            root,
          );
        else await tween(350, (u) => void (root.alpha = 1 - u), 'linear', root);
        root.rotation = 0;
        root.position.set(x, y);
      }
    },
    async tick() {
      jolt = 1;
      void flare(layer, { x, y, w: w * 2, tint: GOLD, ms: 320 });
      await wait(320);
    },
    destroy() {
      loop.stop();
      layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    },
  };
}

export const guard = defineMarkFx({ max: 1, create });
