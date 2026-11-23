// Compile-time checks of the configuration types (vp check): every line under an
// "expect error" directive must NOT compile. If one compiles, tsc reports the unused directive.

import type { FxEntry } from '../src/fx/registry.ts';
import type { RarityConfig } from '../src/config/types.ts';

export const ok: FxEntry[] = [
  { fx: 'sparks', count: 520, linger: 1 },
  { fx: 'foil', mode: 'holo' },
  { fx: 'aura', delay: 200 },
];

// @ts-expect-error an unknown effect
export const unknownEffect: FxEntry = { fx: 'braise' };
// @ts-expect-error a parameter of another effect
export const wrongParam: FxEntry = { fx: 'sparks', twist: 1 };
// @ts-expect-error a wrong type
export const wrongType: FxEntry = { fx: 'glow', strength: '0.5' };
// @ts-expect-error a mode foil does not have
export const wrongMode: FxEntry = { fx: 'foil', mode: 'rainbow' };

const base = { name: 'X', colour: '#fff', ambient: [], burst: [] };
export const shaderOk: RarityConfig = {
  ...base,
  reveal: { kind: 'shader', shader: 'fire', duration: 1000, params: { warp: 0.3 } },
};
// The directive sits on the line the compiler reports: the offending property, once formatted.
export const shaderWrong: RarityConfig = {
  ...base,
  // @ts-expect-error a parameter of another shader
  reveal: { kind: 'shader', shader: 'fire', duration: 1000, params: { cells: 8 } },
};
export const easeWrong: RarityConfig = {
  ...base,
  // @ts-expect-error an unknown easing
  reveal: { kind: 'flip', duration: 800, ease: 'bounce' },
};
