// The stage: a fixed design size, the OBS canvas (1920 x 1080), fitted into whatever the renderer shows.
//
// Scenes place everything in stage pixels: a configuration written for 1920 x 1080 means the same thing
// in OBS (source 1920 x 1080: scale 1) and in a smaller preview (scaled down, centred, letterboxed if the
// aspect differs). Only what needs real screen pixels converts: text resolution, filters reading
// physical pixels (see fx/shockwave.ts).

import { Container, Rectangle, type Application } from 'pixi.js';

export type Stage = {
  /** scenes go in here; its coordinates are stage pixels */
  readonly root: Container;
  readonly width: number;
  readonly height: number;
  /** stage pixels -> screen (CSS) pixels */
  readonly scale: number;
  destroy(): void;
};

export function createStage(app: Application, { width = 1920, height = 1080 } = {}): Stage {
  const root = new Container({ label: 'stage' });
  app.stage.addChild(root);
  let scale = 1;
  const fit = () => {
    const sw = app.screen.width,
      sh = app.screen.height;
    scale = Math.min(sw / width, sh / height);
    root.scale.set(scale);
    root.position.set((sw - width * scale) / 2, (sh - height * scale) / 2);
  };
  fit();
  app.renderer.on('resize', fit);
  return {
    root,
    width,
    height,
    get scale() {
      return scale;
    },
    destroy() {
      app.renderer.off('resize', fit);
      root.destroy({ children: true });
    },
  };
}

/** A rectangle in stage pixels. */
export type Rect = { x: number; y: number; w: number; h: number };

// Where a box sits along each axis: 0 = left / top, 0.5 = centre, 1 = right / bottom.
const ANCHORS = {
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  centre: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
} as const satisfies Record<string, readonly [number, number]>;
export type Anchor = keyof typeof ANCHORS;
export const isAnchor = (v: string): v is Anchor => Object.hasOwn(ANCHORS, v);
/** The anchor as factors per axis (0, 0.5 or 1): what a layout inside the box aligns to. */
export const anchorFactors = (anchor: Anchor): readonly [number, number] => ANCHORS[anchor];

/** A box of w x h stuck to a side, a corner or the centre of the stage, `margin` away from the edges it touches. */
export function anchored(
  stage: { width: number; height: number },
  anchor: Anchor,
  w: number,
  h: number,
  margin: number,
): Rect {
  const [ax, ay] = ANCHORS[anchor];
  const along = (size: number, box: number, a: number) => margin + (size - 2 * margin - box) * a;
  return { x: along(stage.width, w, ax), y: along(stage.height, h, ay), w, h };
}

/** A stage rectangle as a Pixi Rectangle. */
export const toRectangle = (r: Rect): Rectangle => new Rectangle(r.x, r.y, r.w, r.h);
