// Snapshots of a card's face (W x H, card units) in render textures: what a flip turns, what a dodge
// leaves behind. They are reused, never destroyed. Pixi keeps the last texture a mesh or a sprite drew in
// a bind group it shares (the mesh adaptor's shader, the batcher's cached groups, never emptied), and
// destroying that texture then raises "a 'textureSource' was destroyed while still bound to a shader".
// A released snapshot is resized to the next one's resolution; the pool holds as many as were ever in
// use at once.

import { Matrix, RenderTexture, type Application, type Container } from 'pixi.js';
import { H, W } from '@forestcard/layout';

const free: RenderTexture[] = [];

/** A snapshot of `c` (drawn in card units, from 0,0), at `resolution`. Shown for this render only. */
export function snapshot(app: Application, c: Container, resolution: number): RenderTexture {
  const rt =
    free.pop()?.resize(W, H, resolution) ??
    RenderTexture.create({ width: W, height: H, resolution });
  renderInto(app, c, rt);
  return rt;
}

/** Render `c` again into its snapshot (a live flip). The stage never sees `c` shown. */
export function renderInto(app: Application, c: Container, rt: RenderTexture): void {
  const was = c.visible;
  c.visible = true;
  app.renderer.render({ container: c, target: rt, clear: true, transform: new Matrix() });
  c.visible = was;
}

/** Back to the pool, once nothing draws it any more. */
export function release(...rts: RenderTexture[]): void {
  free.push(...rts);
}
