// The booster's pack: rises from below the screen's bottom edge (the booster is anchored at the bottom),
// shakes, swelling under the pressure, tears open along a jagged line, its flap folding back before it
// flies off; once the cards are out (scenes/deal.ts), the body slides back down under the edge.
// The pack is a foil object (scenes/foil-pack.ts) whose face is the booster's own image
// (types_boosters.image_path), or without one the generic pack, the same fallback as overlay.html
// (.lay.fb), rendered into a texture.

import { Container, FillGradient, Graphics, Text, type Application, type Texture } from 'pixi.js';
import { every, tween, wait } from '../engine/time.ts';
import type { BoosterConfig } from '../config/types.ts';
import { opaqueTexture } from '../engine/trim.ts';
import { foilPack } from './foil-pack.ts';

// Width / height of the generic pack.
const GENERIC_RATIO = 0.7;

// The generic pack, whole, as a display object (y0..y1 of it), to render into the foil's texture.
function packPiece(name: string, h: number, y0: number, y1: number, withLabel: boolean): Container {
  const w = h * GENERIC_RATIO,
    c = new Container(),
    g = new Graphics();
  // One gradient over the whole pack (graphics coordinates), cut to this piece. Not bands: drawn as
  // overlapping rows, the seams showed as stripes once the pack fades out.
  const fill = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: h },
    textureSpace: 'global',
    colorStops: [
      { offset: 0, color: 0x6d28d9 },
      { offset: 1, color: 0x1e1b4b },
    ],
  });
  g.rect(0, y0, w, y1 - y0).fill(fill);
  const bw = h * 0.01;
  g.rect(0, y0, bw, y1 - y0)
    .rect(w - bw, y0, bw, y1 - y0)
    .fill(0xa78bfa);
  if (y0 === 0) g.rect(0, 0, w, bw).fill(0xa78bfa);
  if (y1 === h) g.rect(0, h - bw, w, bw).fill(0xa78bfa);
  c.addChild(g);
  if (withLabel) {
    const label = new Text({
      text: name,
      style: {
        fontFamily: ['Lilita One', 'sans-serif'],
        fontSize: h * 0.07,
        fill: 0xffffff,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: w * 0.8,
        dropShadow: { color: 0x000000, blur: 8, distance: 0, alpha: 0.9 },
      },
      anchor: 0.5,
    });
    label.position.set(w / 2, h / 2);
    c.addChild(label);
  }
  return c;
}

/** The torn pack, still on screen: where its bottom piece is (scene coordinates), and how to make it leave. */
export type OpenedPack = {
  /** resolves when what the tear started has faded (nothing today: no flash) */
  after: Promise<void>;
  /** the pack's container, to put it back above layers added after it (the cards come out from behind it) */
  root: Container;
  /** the body: centre x, top edge (the tear), bottom edge, width */
  x: number;
  top: number;
  bottom: number;
  width: number;
  /** slides back down under the stage's bottom edge, where it came from, then is destroyed */
  leave: (ms: number) => Promise<void>;
};

/**
 * Plays the pack up to the tear, centred on `at` (stage pixels), `ph` tall. It comes in from `below`: the
 * stage's bottom edge, which it starts under, out of sight. The body stays, straight and centred, for the
 * cards to come out of. Every other distance is a multiple of the pack's size.
 */
export async function openPack(
  app: Application,
  scene: Container,
  look: { name: string; image: Texture | null },
  at: { x: number; y: number },
  ph: number,
  below: number,
  P: BoosterConfig['pack'],
): Promise<OpenedPack> {
  const F = P.foil;
  // the face: the booster's image, or the generic pack drawn once into a texture of its own
  let own: Texture | null = null;
  // the booster's image without its transparent margins: the pack is what is drawn, not the canvas
  let face = look.image ? opaqueTexture(look.image) : null;
  if (!face) {
    const generic = packPiece(look.name, ph, 0, ph, true);
    own = app.renderer.generateTexture({ target: generic, resolution: 2 });
    generic.destroy({ children: true });
    face = own;
  }
  const pw = (ph * face.frame.width) / face.frame.height,
    cut = ph * 0.13;
  const foil = foilPack(face, {
    pw,
    ph,
    cut,
    tearAmp: F.tear,
    perspective: F.perspective,
  });
  const pack = foil.root,
    s = foil.state;
  if (own) {
    const t = own;
    pack.on('destroyed', () => t.destroy(true));
  }
  pack.pivot.set(pw / 2, ph / 2);
  const cx = at.x,
    cy = at.y;
  scene.addChild(pack);
  let clock = 0;
  every(pack, (dt) => {
    clock += dt;
  });
  const write = () => foil.update();

  // from just under the bottom edge (its top hidden), up to its place with a slight overshoot, turning
  // to face the viewer
  const y0 = below + ph * 0.55 + ph * 0.1;
  const yaw0 = (Math.random() < 0.5 ? -1 : 1) * F.enterTurn;
  s.puff = F.puff[0];
  s.crinkle = F.crinkle[0];
  pack.position.set(cx, y0);
  pack.rotation = 0.12;
  await tween(
    P.enter,
    (u) => {
      pack.position.set(cx, y0 + (cy - y0) * u);
      pack.rotation = 0.12 * (1 - u);
      s.turn = [yaw0 * (1 - u), 0];
      write();
    },
    'out-back',
    pack,
  );
  await wait(P.settle);
  // the shake: the pack swells, the foil tightens and creases, it twists in 3D on top of the jitter
  const ph0 = Math.random() * 10;
  await tween(
    P.shake,
    (u) => {
      pack.position.x = cx + Math.sin(u * 40) * u * pw * 0.06;
      pack.rotation = Math.sin(u * 40) * 0.07 * u;
      pack.scale.set(1 + 0.1 * u);
      s.puff = F.puff[0] + (F.puff[1] - F.puff[0]) * u;
      s.crinkle = F.crinkle[0] + (F.crinkle[1] - F.crinkle[0]) * u;
      s.turn = [
        Math.sin(clock * 23 + ph0) * F.shakeTurn * u,
        Math.sin(clock * 17 + ph0 * 1.7) * F.shakeTurn * 0.5 * u,
      ];
      write();
    },
    'in-2',
    pack,
  );
  // no flash: the tear itself is the event
  const after = Promise.resolve();
  // the tear: the flap folds back around the jagged line and flies off; the body straightens up where
  // the cards will come out (the shake left it tilted) and relaxes a little
  const x0 = pack.x,
    r0 = pack.rotation,
    t0: [number, number] = [s.turn[0], s.turn[1]],
    p0 = s.puff,
    s1 = 1.15;
  await tween(
    P.tear,
    (u) => {
      s.fold = F.fold * u;
      // it peels back, drifts aside and drops behind the pack rather than flying over the title
      s.lift = [u * pw * 0.25, -Math.sin(u * Math.PI) * ph * 0.12 + u * u * ph * 0.1];
      s.flapAlpha = u < 0.45 ? 1 : 1 - (u - 0.45) / 0.55;
      pack.position.x = x0 + (cx - x0) * u;
      pack.rotation = r0 * (1 - u);
      pack.scale.set(1.1 + (s1 - 1.1) * u);
      s.turn = [t0[0] * (1 - u), t0[1] * (1 - u)];
      s.puff = p0 + (F.puff[0] - p0) * u;
      write();
    },
    'smooth',
    pack,
  );
  foil.dropFlap();
  return {
    after,
    root: pack,
    x: cx,
    top: cy + (cut - ph / 2) * s1,
    bottom: cy + (ph / 2) * s1,
    width: pw * s1,
    // Back where it came from: down until its top is under the bottom edge. No fade: it leaves the screen.
    leave: async (ms) => {
      const y1 = below + (ph * s1) / 2 + ph * 0.1;
      await tween(
        ms,
        (u) => {
          pack.position.y = cy + (y1 - cy) * u;
        },
        'in-2',
        pack,
      );
      pack.destroy({ children: true });
    },
  };
}
