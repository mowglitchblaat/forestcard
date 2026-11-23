// Flip with perspective. A PerspectiveMesh takes a texture, not a container: each face is first
// rendered into a RenderTexture, the mesh turns around the vertical axis, the live faces are hidden,
// then shown again at the end.
//   live = false: one snapshot per face (effects freeze during the flip);
//   live = true:  the visible face is re-rendered every frame (effects keep moving, one more render per card).
// halfTurns: 1 = a plain flip; 3 = one and a half turns, the faces alternating as the card spins.

import { PerspectiveMesh, type Application, type Container } from 'pixi.js';
import { H, W } from '@forestcard/layout';
import { release, renderInto, snapshot } from '../engine/snapshot.ts';
import { easing, tween, type Easing } from '../engine/time.ts';

export type FlipOptions = {
  duration?: number;
  live?: boolean;
  perspective?: number; // camera distance, in card widths
  lift?: number; // how much the card grows at mid-flip
  halfTurns?: number;
  ease?: Easing;
  onFace?: () => void; // the final face just turned towards the viewer
};

type Flippable = { root: Container; front: Container; back: Container; faceUp: boolean };

export async function flip(card: Flippable, app: Application, o: FlipOptions = {}): Promise<void> {
  const {
    duration = 700,
    live = false,
    perspective = 3.2,
    lift = 0.08,
    halfTurns = 1,
    ease = 'in-out-quad',
    onFace,
  } = o;
  const from = card.faceUp ? card.front : card.back,
    to = card.faceUp ? card.back : card.front;
  const res = Math.min(2, Math.max(0.2, card.root.worldTransform.a * app.renderer.resolution));
  // each face in its snapshot (engine/snapshot.ts)
  const rtFrom = snapshot(app, from, res),
    rtTo = snapshot(app, to, res);
  const D = perspective * W;
  const corners = (
    phi: number,
    k: number,
  ): [number, number, number, number, number, number, number, number] => {
    const c = Math.cos(phi),
      s = Math.sin(phi);
    const pt = (x: number, y: number) => {
      const p = D / (D + x * s);
      return [W / 2 + x * c * p * k, H / 2 + y * p * k] as const;
    };
    return [...pt(-W / 2, -H / 2), ...pt(W / 2, -H / 2), ...pt(W / 2, H / 2), ...pt(-W / 2, H / 2)];
  };
  // The mesh starts exactly where the face is. Its default corners are a 100 x 100 square: shown for
  // one frame before the first update, that square made the card blink at the start of every flip.
  const [x0, y0, x1, y1, x2, y2, x3, y3] = corners(0, 1);
  const mesh = new PerspectiveMesh({
    texture: rtFrom,
    verticesX: 12,
    verticesY: 12,
    x0,
    y0,
    x1,
    y1,
    x2,
    y2,
    x3,
    y3,
  });
  card.root.addChild(mesh);
  from.visible = false;
  to.visible = false;
  const e = easing(ease);
  let announced = false;
  await tween(duration, (u) => {
    const v = e(u),
      theta = v * Math.PI * halfTurns,
      k = 1 + lift * Math.sin(Math.min(1, v) * Math.PI);
    const n = Math.floor((theta + Math.PI / 2) / Math.PI); // which face is towards the viewer
    const showTo = n % 2 === 1;
    mesh.texture = showTo ? rtTo : rtFrom;
    if (live) renderInto(app, showTo ? to : from, showTo ? rtTo : rtFrom);
    if (showTo && n === halfTurns && !announced) {
      announced = true;
      onFace?.();
    }
    mesh.setCorners(...corners(theta - n * Math.PI, k));
  });
  mesh.destroy();
  release(rtFrom, rtTo);
  to.visible = true;
  card.faceUp = !card.faceUp;
}
