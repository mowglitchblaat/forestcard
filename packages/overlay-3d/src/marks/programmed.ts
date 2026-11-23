// The programmed effects waiting on a card (programmed): one slot per programmed effect, at the bottom
// of the card, a gear for a passive, a lightning bolt for the ultimate; dark while they wait, lit once
// the programming is active (programmingActivated). Ported from the legacy (combat.html: progFx, pgmSlots,
// .pgm i), the gear that flies into its slot left out: a scan line sweeps the card, then the slot pops in.
//   a slot lands: a scan line in the effect's colour sweeps the card from top to bottom over a fading
//                 grid, then the slot pops in;
//   tick:         the slots light up one after the other, with a flash, and stay lit;
//   one goes:     its slot fades (0.4 s).
// Two kinds: the passives (a row of gears) and the ultimate (one bolt, just above the row).

import { Container, Graphics, Sprite } from 'pixi.js';
import { H } from '@forestcard/layout';
import { glowTexture } from '../engine/textures.ts';
import { detach, easing, tween } from '../engine/time.ts';
import { defineMarkFx, type MarkContext, type MarkView } from './define.ts';

const GEAR =
  'M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.4-2.9a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z';
const BOLT = 'M13.5 2 4 14h6.5L9.5 22 20 9.5h-6.6z';

type Look = { icon: string; colour: number; lit: number; litIcon: number; y: number };
const PASSIVE: Look = { icon: GEAR, colour: 0x38bdf8, lit: 0x38bdf8, litIcon: 0xbae6fd, y: 0.937 };
const ULTIMATE: Look = { icon: BOLT, colour: 0xfb923c, lit: 0xfb923c, litIcon: 0xfed7aa, y: 0.862 };
const D = 0.066, // a slot's diameter, in card heights (combat.html's 3.6vh on a 22vw card)
  GAP = 0.011;
const DARK_ICON = 0x5b7486,
  DARK_RING = 0x3b5568;

type Slot = { root: Container; ring: Graphics; icon: Graphics; glow: Sprite; leaving: boolean };

function makeSlot(look: Look, r: number): Slot {
  const root = new Container({ label: 'slot' });
  const glow = new Sprite({ texture: glowTexture(), anchor: 0.5, tint: look.lit, alpha: 0 });
  glow.width = glow.height = r * 4;
  glow.blendMode = 'add';
  const disc = new Graphics().circle(0, 0, r).fill({ color: 0x081018, alpha: 0.82 });
  const ring = new Graphics().circle(0, 0, r).stroke({ color: 0xffffff, width: r * 0.14 });
  ring.tint = DARK_RING;
  // the icon fills 68 % of the slot (its path is drawn in a 24 x 24 box)
  const icon = new Graphics().svg(
    `<svg viewBox="0 0 24 24"><path d="${look.icon}" fill="#ffffff"/></svg>`,
  );
  icon.pivot.set(12, 12);
  icon.scale.set((r * 2 * 0.68) / 24);
  icon.tint = DARK_ICON;
  root.addChild(glow, disc, ring, icon);
  return { root, ring, icon, glow, leaving: false };
}

function view(look: Look, max: number) {
  return ({ card, layer }: MarkContext): MarkView => {
    const box = card.box;
    const r = (D * H) / 2;
    const slots: Slot[] = [];
    let lit = false;
    // slots still scanning in, not in `slots` yet; the level last asked for
    let landing = 0,
      wanted = 0;
    // the row stays centred on the card
    const place = () => {
      const n = slots.filter((s) => !s.leaving).length;
      let i = 0;
      for (const s of slots) {
        if (s.leaving) continue;
        s.root.position.set(box.x + box.w / 2 + (i++ - (n - 1) / 2) * (D + GAP) * H, look.y * H);
      }
    };

    // a scan line sweeps the card from top to bottom, over a grid that fades
    function scan(): Promise<void> {
      const g = new Graphics();
      g.blendMode = 'add';
      layer.addChild(g);
      const x0 = box.x,
        w = box.w;
      return tween(
        750,
        (u) => {
          const y = Math.min(1, u / 0.8) * H;
          g.clear();
          // the trail above the line
          for (let k = 0; k < 8; k++) {
            const h = (H * 0.25) / 8;
            g.rect(x0, y - (k + 1) * h, w, h).fill({
              color: look.colour,
              alpha: 0.35 * (1 - k / 8) * (1 - u),
            });
          }
          const fade = 0.25 * (1 - Math.max(0, (u - 0.66) / 0.34));
          for (let gx = 0; gx <= 10; gx++)
            g.moveTo(x0 + (gx * w) / 10, 0).lineTo(x0 + (gx * w) / 10, y);
          for (let gy = 0; gy * (w / 10) < y; gy++)
            g.moveTo(x0, (gy * w) / 10).lineTo(x0 + w, (gy * w) / 10);
          g.stroke({ color: look.colour, width: w * 0.003, alpha: fade });
          g.moveTo(x0, y)
            .lineTo(x0 + w, y)
            .stroke({ color: look.colour, width: w * 0.008, alpha: 0.9 });
        },
        'linear',
        g,
      ).finally(() => g.destroy());
    }

    async function land(): Promise<void> {
      landing++;
      await scan().finally(() => landing--);
      // asked away while it was scanning in
      if (layer.destroyed || slots.filter((s) => !s.leaving).length >= wanted) return;
      const s = makeSlot(look, r);
      s.root.scale.set(0); // pops in from nothing
      slots.push(s);
      layer.addChild(s.root);
      place();
      if (lit) light(s, false);
      const pop = easing('out-back');
      await tween(500, (u) => s.root.scale.set(pop(u)), 'linear', s.root);
    }

    function light(s: Slot, flash: boolean) {
      s.ring.tint = look.lit;
      s.icon.tint = look.litIcon;
      s.glow.alpha = 0.45;
      if (!flash) return;
      detach(
        tween(
          900,
          (u) => {
            const p = Math.sin(Math.PI * Math.min(1, u * 1.5));
            s.root.scale.set(1 + 0.3 * p);
            s.glow.alpha = 0.45 + 0.55 * (1 - u);
          },
          'linear',
          s.root,
        ),
      );
    }

    function leave(s: Slot): Promise<void> {
      s.leaving = true;
      place();
      return tween(400, (u) => void (s.root.alpha = 1 - u), 'linear', s.root).finally(() => {
        slots.splice(slots.indexOf(s), 1);
        s.root.destroy({ children: true });
      });
    }

    return {
      async set(level) {
        const jobs: Promise<void>[] = [];
        wanted = Math.min(level, max);
        const kept = slots.filter((s) => !s.leaving);
        for (let n = kept.length + landing; n < wanted; n++) jobs.push(land());
        for (const s of kept.slice(level)) jobs.push(leave(s));
        if (!level) lit = false;
        await Promise.all(jobs);
      },
      async tick() {
        lit = true;
        for (const s of slots.filter((x) => !x.leaving)) {
          light(s, true);
          await tween(90, () => {}, 'linear', layer);
        }
      },
      destroy() {
        layer.removeChildren().forEach((c) => c.destroy({ children: true }));
      },
    };
  };
}

export const programmed = defineMarkFx({ max: 4, create: view(PASSIVE, 4) });
export const programmedUltimate = defineMarkFx({ max: 1, create: view(ULTIMATE, 1) });
