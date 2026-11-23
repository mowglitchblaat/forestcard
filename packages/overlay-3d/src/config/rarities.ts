// What each rarity does on screen. THE place to tune; plain data, checked by the compiler here and by
// validate.ts when it comes as JSON (the page's editor, tomorrow the database).
//
// An effect entry is { fx: '<name>', ...params } (fx/registry.ts); missing params take the effect's
// defaults; any entry may carry `delay` (ms).

import type { Rarities } from './types.ts';

export const RARITIES: Rarities = {
  commun: {
    name: 'Commune',
    colour: '#9ca3af',
    ambient: [], // no sparkle on a common: no embers, no sparks, no glints
    reveal: { kind: 'flip', duration: 800 },
    burst: [
      { fx: 'glow', strength: 0.55 },
      { fx: 'flash', strength: 0.15 },
    ],
  },

  rare: {
    name: 'Rare',
    colour: '#3b82f6',
    // no particles on a rare: no embers, no sparks, no glints
    ambient: [{ fx: 'foil', mode: 'sheen' }],
    // one and a half turns, decelerating, the card lifted; a light sweeps the face as it lands
    reveal: {
      kind: 'flip',
      duration: 1150,
      halfTurns: 3,
      lift: 0.12,
      ease: 'out-cubic',
      after: [{ fx: 'sheen' }],
    },
    burst: [
      { fx: 'glow', strength: 0.7 },
      { fx: 'aura', intensity: 0.45 },
      { fx: 'flash', strength: 0.4 },
      { fx: 'shockwave', amplitude: 10 },
    ],
  },

  epique: {
    name: 'Épique',
    colour: '#a855f7',
    // the drawing stays still (no heat): only light and embers move over it
    ambient: [{ fx: 'embers' }, { fx: 'foil', mode: 'sheen' }],
    // the back crystallises into shards that leave one by one
    reveal: {
      kind: 'shader',
      shader: 'crystal',
      duration: 1500,
      ease: 'smooth',
      origin: 'random',
      burstAt: 0.55,
      anticipation: { duration: 500, shake: 0.012, swell: 0.05 },
      params: { cells: 8, spread: 0.75, shardTime: 0.22, whiten: 0.15 },
    },
    burst: [
      { fx: 'glow', strength: 0.78, duration: 1540 },
      { fx: 'aura', intensity: 0.8, twist: 0.3, duration: 2700 },
      { fx: 'sparks', count: 280, linger: 0.4 },
      { fx: 'flash', strength: 0.55 },
      { fx: 'glints', count: 31 },
      { fx: 'shockwave', amplitude: 18 },
    ],
  },

  legendaire: {
    name: 'Légendaire',
    colour: '#f59e0b',
    // embers like the epic's, golden (the rarity colour); light rippling over the drawing, and the
    // passing light on the frame like the epic's (the rainbow is GGEZ's); the drawing stays still (no heat)
    ambient: [{ fx: 'embers' }, { fx: 'caustics' }, { fx: 'foil', mode: 'sheen' }],
    // the back burns; each card draws how it catches fire
    reveal: [
      // from a point, in uneven fingers; two more spots catch late; smoulders, then catches
      {
        kind: 'shader',
        shader: 'fire',
        duration: 2000,
        ease: 'in-1.7',
        origin: 'random',
        burstAt: 0.7,
        anticipation: { duration: 500, shake: 0.012, swell: 0.05 },
        params: { warp: 0.45, rim: 0.04, char: 0.13, spotDelay: [0.45, 0.7] },
      },
      // from an edge, a wide ragged front crossing the card; the other spots barely matter
      {
        kind: 'shader',
        shader: 'fire',
        duration: 2300,
        ease: 'in-1.4',
        origin: 'edge',
        burstAt: 0.72,
        anticipation: { duration: 500, shake: 0.012, swell: 0.05 },
        params: { warp: 0.65, rim: 0.035, char: 0.16, spotDelay: [0.85, 0.95] },
      },
      // three spots catch almost at once and meet in the middle
      {
        kind: 'shader',
        shader: 'fire',
        duration: 1800,
        ease: 'in-1.7',
        origin: 'random',
        burstAt: 0.68,
        anticipation: { duration: 500, shake: 0.012, swell: 0.05 },
        params: { warp: 0.35, rim: 0.05, char: 0.11, spotDelay: [0.08, 0.18] },
      },
    ],
    burst: [
      { fx: 'glow', strength: 0.9, duration: 2500 },
      { fx: 'aura', intensity: 1.1, twist: 0.8, duration: 4400 },
      { fx: 'flash', strength: 0.8 },
      { fx: 'shockwave', amplitude: 30 },
    ],
  },

  ggez: {
    name: 'GGEZ',
    colour: '#ffffff',
    rainbow: true,
    // the drawing stays still (no heat), like every rarity's
    ambient: [{ fx: 'embers' }, { fx: 'foil', mode: 'holo', strength: 0.5 }],
    // digital glitch: slices tear, colours split, the back drops out; each card draws its grain
    reveal: [
      // blocks drop out around a point
      {
        kind: 'shader',
        shader: 'glitch',
        duration: 1300,
        ease: 'linear',
        origin: 'random',
        burstAt: 0.7,
        anticipation: { duration: 500, shake: 0.012, swell: 0.05 },
        params: { blocks: [10, 14], split: 0.03, tear: 0.25, rate: 18 },
      },
      // wide scan bands torn sideways, from an edge
      {
        kind: 'shader',
        shader: 'glitch',
        duration: 1400,
        ease: 'linear',
        origin: 'edge',
        burstAt: 0.7,
        anticipation: { duration: 500, shake: 0.012, swell: 0.05 },
        params: { blocks: [2, 26], split: 0.04, tear: 0.45, rate: 14 },
      },
      // fine pixels, strong colour split, little tearing
      {
        kind: 'shader',
        shader: 'glitch',
        duration: 1200,
        ease: 'linear',
        origin: 'random',
        burstAt: 0.7,
        anticipation: { duration: 500, shake: 0.012, swell: 0.05 },
        params: { blocks: [28, 38], split: 0.05, tear: 0.12, rate: 24 },
      },
    ],
    burst: [
      { fx: 'glow', strength: 0.95, duration: 2500 },
      { fx: 'aura', intensity: 1.2, twist: 1.2, duration: 4400 },
      { fx: 'sparks', count: 700, linger: 1 },
      { fx: 'flash', strength: 0.9 },
      { fx: 'glints', count: 66 },
      { fx: 'shockwave', amplitude: 36 },
    ],
  },
};

// Which card types a rarity exists for (frames in assets/cadres): GGEZ has fighter frames only.
export const allowsType = (tier: keyof Rarities, type: string): boolean =>
  tier !== 'ggez' || type === 'combattant';
