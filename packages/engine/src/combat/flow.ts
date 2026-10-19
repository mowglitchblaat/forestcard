// How a step lets the sequence it belongs to go on (combat/moments.ts). The legacy engine writes its
// sequences as straight code with early exits; a step returns the exit it takes:
//   undefined  go on with the next step;
//   'stop'     the sequence ends here (the old `return`: a card is down, the attack cannot happen…);
// and, for the steps of a strike:
//   'next'     on to the next strike (the old `continue`: the strike was dodged);
//   'break'    no more strikes, the attack still ends normally (the old `break`: swallowed).

import type { Combat } from './combat.ts';

export type Flow = 'stop' | undefined;
export type StrikeFlow = Flow | 'next' | 'break';

export type Step<T> = (c: Combat, on: T) => Flow;

// Runs the steps in order; 'stop' if one of them stopped the sequence.
export function run<T>(c: Combat, on: T, steps: readonly Step<T>[]): Flow {
  for (const step of steps) if (step(c, on) === 'stop') return 'stop';
  return undefined;
}
