// Every reveal shader, by the name a configuration uses (reveal.shader). One line per module.

import { crystal } from './crystal.ts';
import { fire } from './fire.ts';
import { glitch } from './glitch.ts';
import type { RevealShaderDef, ShaderParamValue } from './types.ts';

export const REVEAL_SHADERS = { crystal, fire, glitch } as const;

export type RevealShaderName = keyof typeof REVEAL_SHADERS;
export type RevealShaderParams<N extends RevealShaderName> =
  (typeof REVEAL_SHADERS)[N] extends RevealShaderDef<infer P> ? P : never;

export const isRevealShaderName = (name: string): name is RevealShaderName =>
  Object.hasOwn(REVEAL_SHADERS, name);
export const revealShaderDef = (
  name: RevealShaderName,
): RevealShaderDef<Readonly<Record<string, ShaderParamValue>>> =>
  REVEAL_SHADERS[name] as unknown as RevealShaderDef<Readonly<Record<string, ShaderParamValue>>>;
