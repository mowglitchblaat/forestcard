// The parasitic links (lien, liens parasitaires): fleshy tendrils hooked into the card's edges, one per
// link, each with a dark red bud that beats. They share the bearer's heals with the other card, both ways.
//   a link lands:  its tendril grows out of the edge and curls, the bud swells with a red flash;
//   while laid:    the buds beat (one heartbeat, each a little out of step);
//   tick:          a heal shared (lien_soin): a wave of green-red light runs through every tendril;
//   one goes:      it withers ('fade', its turns run out), or is cut ('drop': a Tranchant, the molt) and
//                  falls off the card.
// Each tendril is a Graphics drawn once; the beat and the light are its bud's sprite (no redraw).

import { Container, Graphics, Sprite } from 'pixi.js';
import { H } from '@forestcard/layout';
import { glowTexture } from '../engine/textures.ts';
import { every, tween, wait } from '../engine/time.ts';
import { flare, lit, span } from '../kit/draw.ts';
import { defineMarkFx, type MarkContext, type MarkView } from './define.ts';

const MAX = 6;
const FLESH = 0x7a1730,
  BUD = 0xd03a5c,
  SHARE = 0x9cff7a;
// where each tendril leaves the edge (fractions of the face) and its curl (+1: clockwise)
type Spot = { x: number; y: number; out: number; curl: 1 | -1 };
const SPOTS: readonly Spot[] = [
  { x: 0, y: 0.62, out: Math.PI, curl: 1 },
  { x: 1, y: 0.62, out: 0, curl: -1 },
  { x: 0, y: 0.32, out: Math.PI, curl: -1 },
  { x: 1, y: 0.32, out: 0, curl: 1 },
  { x: 0.3, y: 1, out: Math.PI / 2, curl: 1 },
  { x: 0.7, y: 1, out: Math.PI / 2, curl: -1 },
];

type Link = { root: Container; bud: Sprite; grow: number; phase: number; leaving: boolean };

// the tendril, in its own frame (it leaves (0, 0) toward +x), `len` long
function tendril(len: number, curl: number): Graphics {
  const g = new Graphics();
  const w = len * 0.11;
  const path = () =>
    g
      .moveTo(-len * 0.08, 0)
      .bezierCurveTo(len * 0.35, -curl * len * 0.15, len * 0.75, curl * len * 0.25, len * 0.62, curl * len * 0.45)
      .bezierCurveTo(len * 0.5, curl * len * 0.6, len * 0.3, curl * len * 0.35, len * 0.48, curl * len * 0.28);
  path();
  g.stroke({ color: 0x2a0610, width: w * 1.5, cap: 'round' });
  path();
  g.stroke({ color: FLESH, width: w, cap: 'round' });
  // thorns along it
  for (const u of [0.25, 0.45, 0.62]) {
    const x = len * u,
      y = -curl * len * 0.06 * Math.sin(Math.PI * u);
    g.poly([x - w * 0.4, y, x + w * 0.4, y, x, y - curl * w * 1.4]).fill(0x3a0a18);
  }
  // the bud
  g.circle(len * 0.48, curl * len * 0.28, w * 0.9).fill(BUD);
  g.circle(len * 0.46, curl * len * 0.26, w * 0.35).fill({ color: 0xffc0cc, alpha: 0.7 });
  return g;
}

function create({ card, layer }: MarkContext): MarkView {
  const box = card.box;
  const len = box.w * 0.26;
  const links: (Link | null)[] = Array.from({ length: MAX }, () => null);
  let share = 0;

  const loop = every(layer, (dt, t) => {
    share = Math.max(0, share - dt * 1.6);
    for (const l of links) {
      if (!l || l.leaving) continue;
      // a heartbeat: two quick beats a second and a rest
      const beat = Math.max(0, Math.sin((t + l.phase) * Math.PI * 2 * 1.1)) ** 8;
      l.root.scale.set(l.grow * (1 + 0.04 * beat));
      l.bud.alpha = 0.25 + 0.45 * beat + share * 0.8;
      l.bud.tint = share > 0.05 ? SHARE : BUD;
    }
  });

  async function land(i: number): Promise<void> {
    const s = SPOTS[i]!;
    const root = new Container({ label: 'link' });
    root.position.set(box.x + s.x * box.w, s.y * H);
    root.rotation = s.out;
    root.addChild(tendril(len, s.curl));
    const bud = lit(root, glowTexture(), len * 0.48, s.curl * len * 0.28, len * 0.6, BUD);
    layer.addChild(root);
    const l: Link = { root, bud, grow: 0, phase: Math.random(), leaving: false };
    links[i] = l;
    await tween(500, (u) => void (l.grow = u), 'out-back', root);
    card.shake(4, 150);
    void flare(layer, { x: root.x, y: root.y, w: box.w * 0.22, tint: BUD, ms: 420 });
  }

  async function leave(i: number, how: 'fade' | 'drop'): Promise<void> {
    const l = links[i];
    if (!l) return;
    links[i] = null;
    l.leaving = true;
    const r = l.root,
      x0 = r.x,
      y0 = r.y,
      a0 = r.rotation;
    if (how === 'drop')
      // cut: a pale flash where it was hooked, then it falls, turning
      await Promise.all([
        flare(layer, { x: x0, y: y0, w: box.w * 0.2, tint: 0xffffff, ms: 260 }),
        tween(
          700,
          (u) => {
            r.position.set(x0 + Math.cos(a0) * len * 0.3 * u, y0 + H * 0.5 * u * u);
            r.rotation = a0 + 2.2 * u * (SPOTS[i]!.curl);
            r.alpha = 1 - span(u, 0.5, 1);
          },
          'linear',
          r,
        ),
      ]);
    else
      // withered: it curls back into the edge, greying
      await tween(
        500,
        (u) => {
          r.scale.set(l.grow * (1 - u));
          r.tint = u > 0.3 ? 0x777777 : 0xffffff;
        },
        'in-2',
        r,
      );
    r.destroy({ children: true });
  }

  return {
    async set(level, how) {
      const jobs: Promise<void>[] = [];
      for (let i = MAX - 1; i >= level; i--) if (links[i]) jobs.push(leave(i, how));
      for (let i = 0; i < level; i++)
        if (!links[i]) {
          jobs.push(land(i));
          await wait(110);
        }
      await Promise.all(jobs);
    },
    async tick() {
      share = 1;
      for (const l of links)
        if (l) void flare(layer, { x: l.root.x, y: l.root.y, w: box.w * 0.3, tint: SHARE, ms: 600, alpha: 0.7 });
      await wait(600);
    },
    destroy() {
      loop.stop();
      layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    },
  };
}

export const links = defineMarkFx({ max: MAX, create });
