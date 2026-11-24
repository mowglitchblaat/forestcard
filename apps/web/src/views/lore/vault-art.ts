// The vaults' art and timings, shared by the event's vaults (vaults.tsx) and the inventory's
// mini-vaults (views/inventory): the pictures (assets/cadres), each colour's light, how long a drill
// takes, and the phases of an opening.

import type { Tint } from '@/data/vaults';

// The drills (assets/cadres): their bit points right, their tip at 41 % of their height. The
// Perce-Abîme has its own picture (GIGA_TINTED: the plain drill in gold, without one).
export const GIGA_DRILL = 'cadres/foreuse-legendaire.webp';
export const GIGA_TINTED = false;

// The doors' pictures (assets/cadres).
export const DOOR: Record<Tint, string> = {
  bleu: 'cadres/coffre-bleu.webp',
  violet: 'cadres/coffre-violet.webp',
  or: 'cadres/coffre-or.webp',
};
// The colour of its light (--glow).
export const GLOW: Record<Tint, string> = {
  bleu: 'vault-glow-bleu',
  violet: 'vault-glow-violet',
  or: 'vault-glow-or',
};

export const DRILL_MS = 1500;
export const GIGA_MS = 2300;
export const QUICK_MS = 700; // the next drills of a salvo come faster

export type Phase = 'shake' | 'bolts' | 'swing' | 'cards';
export const PHASES: [Phase, number][] = [
  ['shake', 0],
  ['bolts', 1300],
  ['swing', 2800],
  ['cards', 4300],
];
export const BOLTS = [
  { top: 'top-1/4', dx: '3rem' },
  { top: 'top-1/2', dx: '3.5rem' },
  { top: 'top-3/4', dx: '3rem' },
];
