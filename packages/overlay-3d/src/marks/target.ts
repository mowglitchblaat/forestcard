// The target (cible, visée: the Headshot's aim, Ciblage): a red crosshair locked on the card's head, its
// remaining uses as notches under it. The next hits may be critical.
//   it lands:    the crosshair snaps in from twice its size, spinning, and locks with a red flash;
//   while laid:  it turns slowly, its ring breathes, a red dot pulses at its centre;
//   tick:        the aim tightens (a hit is about to be critical): it closes in and flashes;
//   one goes:    a notch goes out; the last takes the crosshair ('fade'), or it misses ('drop': cible_rate,
//                it slides off and fades).
// The crosshair is an icon drawn once (kit/draw.ts icon): turning and scaling it redraws nothing.

import { Container, Graphics, type Sprite } from 'pixi.js';
import { H } from '@forestcard/layout';
import { glowTexture } from '../engine/textures.ts';
import { every, tween, wait } from '../engine/time.ts';
import { flare, icon, lit } from '../kit/draw.ts';
import { defineMarkFx, type MarkContext, type MarkView } from './define.ts';

const MAX = 3;
const RED = 0xff2d3a;
const CROSSHAIR = `<svg viewBox="0 0 100 100"><g fill="none" stroke="#ff2d3a" stroke-linecap="round">
<circle cx="50" cy="50" r="30" stroke-width="5"/><circle cx="50" cy="50" r="30" stroke="#ffd0d4" stroke-width="1.5"/>
<path d="M50 6v22M50 72v22M6 50h22M72 50h22" stroke-width="6"/><path d="M50 6v22M50 72v22M6 50h22M72 50h22" stroke="#ffe4e6" stroke-width="2"/>
<path d="M27 27l6 6M73 27l-6 6M27 73l6-6M73 73l-6-6" stroke-width="4"/></g></svg>`;
const Y = 0.3; // the head, in card heights

function create({ card, layer }: MarkContext): MarkView {
  const box = card.box;
  const size = box.w * 0.42;
  const cx = box.x + box.w / 2,
    cy = Y * H;
  const root = new Container({ label: 'target' });
  root.position.set(cx, cy);
  root.alpha = 0;
  layer.addChild(root);
  const glow: Sprite = lit(root, glowTexture(), 0, 0, size * 1.1, RED);
  glow.alpha = 0.25;
  const cross = icon(CROSSHAIR, size, 100);
  root.addChild(cross);
  const dot = lit(root, glowTexture(), 0, 0, size * 0.18, RED);
  const notches = new Graphics();
  layer.addChild(notches);
  let level = 0,
    tight = 0,
    spin = 0;

  const drawNotches = () => {
    notches.clear();
    const r = box.w * 0.022,
      gap = r * 3;
    for (let i = 0; i < level; i++)
      notches
        .circle(cx + (i - (level - 1) / 2) * gap, cy + size * 0.62, r)
        .fill({ color: RED })
        .stroke({ color: 0xffe4e6, width: r * 0.35 });
  };

  const loop = every(layer, (dt, t) => {
    tight = Math.max(0, tight - dt * 2.2);
    spin += dt * (0.4 + 3 * tight);
    cross.rotation = spin;
    const s = 1 - 0.18 * tight + 0.02 * Math.sin(t * 3);
    root.scale.set(s);
    dot.alpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 4));
    glow.alpha = 0.2 + 0.5 * tight;
  });

  async function show(): Promise<void> {
    await tween(
      360,
      (u) => {
        root.alpha = u;
        root.scale.set(2 - u);
        spin = (1 - u) * 3;
      },
      'out-cubic',
      root,
    );
    card.shake(4, 140);
    void flare(layer, { x: cx, y: cy, w: size * 1.6, tint: RED, ms: 380 });
  }

  return {
    async set(to, how) {
      const was = level;
      level = to;
      drawNotches();
      if (!was && to) return show();
      if (was && !to) {
        notches.clear();
        if (how === 'drop')
          await tween(
            420,
            (u) => {
              root.position.set(cx + box.w * 0.3 * u, cy - H * 0.05 * u);
              root.alpha = 1 - u;
            },
            'in-2',
            root,
          );
        else await tween(320, (u) => void (root.alpha = 1 - u), 'linear', root);
        root.position.set(cx, cy);
      }
    },
    async tick() {
      tight = 1;
      void flare(layer, { x: cx, y: cy, w: size * 0.9, tint: 0xffffff, ms: 260, alpha: 0.8 });
      await wait(300);
    },
    destroy() {
      loop.stop();
      layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    },
  };
}

export const target = defineMarkFx({ max: MAX, create });
