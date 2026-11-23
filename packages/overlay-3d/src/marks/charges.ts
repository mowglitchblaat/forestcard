// Charges (charge, volt: what a card stores to release at once): golden motes of energy circling the
// card on a tilted ring, one per charge. Full (jauge_pleine, a full volt), they spin faster and glow.
//   one lands:  it sparks into being on the ring;
//   while laid: they circle, the ones passing behind the card dimmer and smaller (a tilted orbit);
//   tick:       they discharge (decharge): each rushes into the card's centre and bursts there;
//   one goes:   it fades.
// One sprite each (the soft glow texture, tinted): no drawing at all.

import { type Sprite } from 'pixi.js';
import { H } from '@forestcard/layout';
import { Particles } from '../engine/particles.ts';
import { glowTexture } from '../engine/textures.ts';
import { every, tween, wait } from '../engine/time.ts';
import { burst, flare, lit } from '../kit/draw.ts';
import { defineMarkFx, type MarkContext, type MarkView } from './define.ts';

const MAX = 8;
const GOLD = 0xffd65a,
  HOT = 0xfff6c8;

type Mote = { s: Sprite; core: Sprite; born: number; leaving: boolean; rush: number };

function create({ card, layer }: MarkContext): MarkView {
  const box = card.box;
  const cx = box.x + box.w / 2,
    cy = H * 0.55;
  const rx = box.w * 0.62,
    ry = H * 0.12;
  const motes: (Mote | null)[] = Array.from({ length: MAX }, () => null);
  const sparks = new Particles(layer);
  let turn = Math.random() * 6,
    full = 0;

  const loop = every(layer, (dt) => {
    const live = motes.filter((m) => !!m).length;
    full += ((live >= MAX ? 1 : 0) - full) * Math.min(1, dt * 3);
    turn += dt * (0.9 + 1.6 * full);
    for (const [i, m] of motes.entries()) {
      if (!m) continue;
      m.born = Math.min(1, m.born + dt * 3);
      const a = turn + (i / MAX) * Math.PI * 2;
      const depth = Math.sin(a); // > 0: in front
      const k = 1 - m.rush;
      m.s.position.set(cx + Math.cos(a) * rx * k, cy + depth * ry * k);
      m.core.position.copyFrom(m.s.position);
      const size = box.w * (0.11 + 0.03 * depth + 0.04 * full) * m.born;
      m.s.width = m.s.height = size * 2.2;
      m.core.width = m.core.height = size * 0.7;
      const a0 = m.leaving ? m.s.alpha : 0.55 + 0.35 * depth * 0.5 + 0.3 * full;
      m.s.alpha = a0;
      m.core.alpha = Math.min(1, a0 + 0.3);
    }
  });

  return {
    async set(level) {
      for (let i = MAX - 1; i >= level; i--) {
        const m = motes[i];
        if (!m) continue;
        motes[i] = null;
        m.leaving = true;
        void tween(300, (u) => void (m.s.alpha = m.core.alpha = 1 - u), 'linear', m.s).finally(
          () => {
            m.s.destroy();
            m.core.destroy();
          },
        );
      }
      for (let i = 0; i < level; i++)
        if (!motes[i]) {
          const s = lit(layer, glowTexture(), cx, cy, 1, GOLD);
          const core = lit(layer, glowTexture(), cx, cy, 1, HOT);
          motes[i] = { s, core, born: 0, leaving: false, rush: 0 };
          await wait(90);
        }
      await wait(250);
    },
    async tick() {
      const live = motes.filter((m): m is Mote => !!m);
      await tween(300, (u) => live.forEach((m) => (m.rush = u * u)), 'linear', layer);
      card.shake(10, 260);
      void flare(layer, { x: cx, y: cy, w: box.w * 1.3, tint: GOLD, ms: 500 });
      burst(sparks, {
        x: cx,
        y: cy,
        count: 10 + live.length * 4,
        speed: box.w * 1.6,
        size: box.w * 0.03,
        tint: [GOLD, HOT],
        life: 0.6,
        stretch: 4,
      });
      for (const m of live) m.rush = 0;
      await wait(300);
    },
    destroy() {
      loop.stop();
      sparks.stop();
      layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    },
  };
}

export const charges = defineMarkFx({ max: MAX, create });
