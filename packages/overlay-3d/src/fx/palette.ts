// Helpers shared by the effects: tints and envelopes.

import { hot } from '../engine/textures.ts';
import type { FxContext } from './types.ts';

const RAINBOW = [0xf43f5e, 0xf59e0b, 0x22c55e, 0x3b82f6, 0xa855f7] as const;

// Tint of the i-th particle: a hot shade of the rarity colour, or the rainbow.
export const tintOf = (ctx: Pick<FxContext, 'colour' | 'rainbow'>, i: number): number =>
  ctx.rainbow ? RAINBOW[i % RAINBOW.length]! : hot(ctx.colour, 0.2 + Math.random() * 0.5);

// Rises to 1 over the first `rise` of u, then falls back to 0 with curve `fall`.
export const pulse = (u: number, rise = 0.15, fall = 1): number =>
  u < rise ? u / rise : 1 - Math.pow((u - rise) / (1 - rise), fall);

export const between = ([a, b]: readonly number[]): number => {
  const lo = a ?? 0;
  return lo + Math.random() * ((b ?? lo) - lo);
};
