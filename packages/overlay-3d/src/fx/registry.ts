// Every effect, by the name a configuration uses. One line per effect module: an effect missing here
// cannot be named in a configuration (FxName), and a configuration naming an unknown effect or
// parameter does not compile (FxEntry). JSON coming at run time is checked by config/validate.ts.

import { aura } from './aura.ts';
import { caustics } from './caustics.ts';
import { embers } from './embers.ts';
import { flash } from './flash.ts';
import { foil } from './foil.ts';
import { glints } from './glints.ts';
import { glow } from './glow.ts';
import { heat } from './heat.ts';
import { sheen } from './sheen.ts';
import { shockwave } from './shockwave.ts';
import { sparks } from './sparks.ts';
import type { FxDef, Params } from './types.ts';

export const FX = {
  aura,
  caustics,
  embers,
  flash,
  foil,
  glints,
  glow,
  heat,
  sheen,
  shockwave,
  sparks,
} as const;

export type FxName = keyof typeof FX;
export type FxParams<N extends FxName> = (typeof FX)[N] extends FxDef<infer P> ? P : never;

// An effect as a configuration names it: { fx: 'sparks', count: 520 }. Any entry may carry `delay` (ms).
export type FxEntry = {
  [N in FxName]: { readonly fx: N; readonly delay?: number } & Partial<FxParams<N>>;
}[FxName];

export const isFxName = (name: string): name is FxName => Object.hasOwn(FX, name);
export const fxDef = (name: FxName): FxDef<Params> => FX[name] as unknown as FxDef<Params>;
