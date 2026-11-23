// How hard the overlays make the GPU work. The stream's PC draws them in OBS while it plays and encodes
// the stream: what an effect costs there is taken from the game and the encoder.
//   full  as the effects were designed;
//   eco   the noise of every shader keeps 3 octaves instead of 5 (25 to 45 % less work per pixel on the
//         status shaders, measured on the bench; the look barely changes at a card's size on stream),
//         the bursts throw half their particles, the lasting loops (auras, terrains) draw at 30 frames a
//         second.
// A page picks it once, before building anything (programs are compiled with it): ?qualite=eco in the
// URL of the OBS source (qualityFromUrl), or setQuality.

export type Quality = 'full' | 'eco';

export type QualityConfig = {
  fbmOctaves: number;
  particles: number; // share of a burst's particles
  loopFps: number; // a lasting loop's frame rate cap (0: every frame)
};

const LEVELS: Readonly<Record<Quality, QualityConfig>> = {
  full: { fbmOctaves: 5, particles: 1, loopFps: 0 },
  eco: { fbmOctaves: 3, particles: 0.5, loopFps: 30 },
};

let current: Quality = 'full';

export const quality = (): QualityConfig => LEVELS[current];
export const qualityLevel = (): Quality => current;

export function setQuality(q: Quality): void {
  current = q;
}

/** ?qualite=eco (or ?quality=eco) in a page's URL: 'eco'; anything else: 'full'. */
export function qualityFromUrl(search: string): Quality {
  const p = new URLSearchParams(search);
  const v = (p.get('qualite') ?? p.get('quality') ?? '').toLowerCase();
  return v === 'eco' || v === 'éco' ? 'eco' : 'full';
}

/** The lines every shader of the overlays starts with: what the quality changes in GLSL. */
export const shaderDefines = (): string => `#define FBM_OCT ${quality().fbmOctaves}\n`;

/** How many of `n` particles a burst throws at this quality (at least 1 if n > 0). */
export const particleCount = (n: number): number =>
  n > 0 ? Math.max(1, Math.round(n * quality().particles)) : 0;
