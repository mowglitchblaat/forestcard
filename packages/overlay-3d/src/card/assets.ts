// How card images (frames, plaques, drawings, backs) are loaded.
//
// A card image is drawn several times smaller than its pixels: a 1488 px frame on a card 300 px wide
// on screen. Without mipmaps, the GPU reads only the 2 x 2 texels nearest to each screen pixel and
// skips the rest; a thin line (the frame's hooks, the plaque's border) is hit on some pixels and
// missed on the next, so its edges come out as stairs, and crawl while the card moves.
// With mipmaps, the GPU keeps the image at every half size (1/2, 1/4, ...) and reads the level whose
// texels match the screen pixels (blending the two nearest levels): every texel counts once.
// Cost: one third more GPU memory per image, mipmaps computed once at upload.

import { loadTextures, type UnresolvedAsset } from 'pixi.js';

export const cardAsset = (alias: string, src: string): UnresolvedAsset => ({
  alias,
  src,
  data: { autoGenerateMipmaps: true },
});

// Images decoded as <img> elements, not as ImageBitmaps (Pixi's default, decoded in workers). Pixi
// uploads them with UNPACK_PREMULTIPLY_ALPHA, which WebGL deprecates for a source that is not a DOM
// element: Firefox warns ("Alpha-premult and y-flip are deprecated for non-DOM-Element uploads"), and a
// browser that stops honouring it would leave dark fringes on transparent edges. A page calls this once,
// before loading anything.
export function decodeImagesAsElements(): void {
  // typed optional by Pixi, set by the parser itself; reported if a Pixi upgrade drops it
  const config = loadTextures.config;
  if (config) config.preferCreateImageBitmap = false;
  else console.warn('loadTextures.config is gone: images stay decoded as ImageBitmaps');
}
