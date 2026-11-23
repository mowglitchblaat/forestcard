// The forge (forge: one more each time the card is forged, up to 6 for a living weapon): a row of
// hammered runes along the card's top edge, each glowing like metal fresh from the fire.
//   a rune lands:  a hammer blow rings on it: a white-hot spark burst, then it cools to orange, then to a
//                  dull red ember that keeps breathing;
//   tick:          the forge fires again (arme_feu: a burn forges the weapon): every rune glows hot again;
//   one goes:      it cools to black and fades.
// The runes are icons drawn once; their heat is their tint and their glow's alpha (no redraw).

import { Container, type Graphics, type Sprite } from 'pixi.js';
import { H } from '@forestcard/layout';
import { Particles } from '../engine/particles.ts';
import { glowTexture } from '../engine/textures.ts';
import { every, tween, wait } from '../engine/time.ts';
import { burst, icon, lit } from '../kit/draw.ts';
import { defineMarkFx, type MarkContext, type MarkView } from './define.ts';

const MAX = 6;
const RUNE = `<svg viewBox="0 0 40 40"><path d="M20 3 L33 12 L33 28 L20 37 L7 28 L7 12 Z" fill="#2b1a10" stroke="#ffffff" stroke-width="3"/>
<path d="M20 10 L20 30 M13 16 L27 24 M27 16 L13 24" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round"/></svg>`;

// heat 1 (white hot) -> 0 (cold): the rune's tint
function heatColour(h: number): number {
  const stops: [number, number, number, number][] = [
    [0, 0x40, 0x22, 0x18],
    [0.3, 0xb0, 0x30, 0x10],
    [0.65, 0xff, 0x8a, 0x20],
    [1, 0xff, 0xf4, 0xd0],
  ];
  let i = 0;
  while (i < stops.length - 2 && h > stops[i + 1]![0]) i++;
  const [h0, r0, g0, b0] = stops[i]!,
    [h1, r1, g1, b1] = stops[i + 1]!;
  const u = Math.min(1, Math.max(0, (h - h0) / (h1 - h0)));
  const m = (a: number, b: number) => Math.round(a + (b - a) * u);
  return (m(r0, r1) << 16) | (m(g0, g1) << 8) | m(b0, b1);
}

type Rune = { root: Container; g: Graphics; glow: Sprite; heat: number; leaving: boolean };

function create({ card, layer }: MarkContext): MarkView {
  const box = card.box;
  const size = box.w * 0.1,
    gap = size * 1.15;
  const runes: (Rune | null)[] = Array.from({ length: MAX }, () => null);
  const sparks = new Particles(layer);
  const place = (i: number) => ({ x: box.x + box.w / 2 + (i - (MAX - 1) / 2) * gap, y: H * 0.075 });

  const loop = every(layer, (dt, t) => {
    for (const [i, r] of runes.entries()) {
      if (!r) continue;
      // fresh heat cools in ~2 s down to a breathing ember
      const ember = 0.32 + 0.06 * Math.sin(t * 2.2 + i);
      if (!r.leaving) r.heat = Math.max(ember, r.heat - dt * 0.4);
      r.g.tint = heatColour(r.heat);
      r.glow.tint = heatColour(Math.min(1, r.heat + 0.2));
      r.glow.alpha = r.heat * 0.8;
    }
  });

  async function land(i: number): Promise<void> {
    const p = place(i);
    const root = new Container({ label: 'rune' });
    root.position.set(p.x, p.y);
    const glow = lit(root, glowTexture(), 0, 0, size * 2.4, 0xffa040);
    const g = icon(RUNE, size, 40);
    root.addChild(g);
    layer.addChild(root);
    const r: Rune = { root, g, glow, heat: 1, leaving: false };
    runes[i] = r;
    card.shake(6, 160);
    burst(sparks, {
      x: p.x,
      y: p.y,
      count: 18,
      speed: box.w * 1.4,
      size: size * 0.22,
      tint: [0xffe08a, 0xff9a2e, 0xffffff],
      life: 0.6,
      angle: -Math.PI / 2,
      spread: Math.PI * 1.4,
      gravity: H * 2.2,
      stretch: 3,
    });
    await tween(220, (u) => void root.scale.set(1.5 - 0.5 * u), 'out-cubic', root);
  }

  async function leave(i: number): Promise<void> {
    const r = runes[i];
    if (!r) return;
    runes[i] = null;
    r.leaving = true;
    await tween(
      500,
      (u) => {
        r.heat = (1 - u) * 0.3;
        r.root.alpha = 1 - u;
      },
      'linear',
      r.root,
    );
    r.root.destroy({ children: true });
  }

  return {
    async set(level) {
      const jobs: Promise<void>[] = [];
      for (let i = MAX - 1; i >= level; i--) if (runes[i]) jobs.push(leave(i));
      for (let i = 0; i < level; i++)
        if (!runes[i]) {
          jobs.push(land(i));
          await wait(180);
        }
      await Promise.all(jobs);
    },
    async tick() {
      for (const r of runes) if (r) r.heat = 1;
      await wait(400);
    },
    destroy() {
      loop.stop();
      sparks.stop();
      layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    },
  };
}

export const forge = defineMarkFx({ max: MAX, create });
