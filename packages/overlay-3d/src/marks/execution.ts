// The execution's marks (markReceived, marksLost): each mark tears a real hole through the card
// (marks/tears.ts), where the legacy planted its blades (combat.html, lameIn): a narrow tear high on the
// left, one high on the right, then a long one down the middle; with the third, the card is doomed.
//   a mark lands: the card jolts, the tear rips from where the blow lands, both ways;
//   a mark lost:  its hole eases shut (and the doom goes).
// The final cut of an execution is a move (moves/), not a mark.

import { wait } from '../engine/time.ts';
import { defineMarkFx, type MarkContext, type MarkView } from './define.ts';
import { Tears, type TearSpec } from './tears.ts';

// The legacy's places (lameIn): x, y in fractions of the face; a blade tilted by t degrees tears along
// its own line, at 90 + t degrees.
const SPOTS: readonly TearSpec[] = [
  { x: 0.21, y: 0.3, angle: 90 - 24, half: 0.15, width: 0.032 },
  { x: 0.79, y: 0.3, angle: 90 + 24, half: 0.15, width: 0.032 },
  { x: 0.5, y: 0.56, angle: 90, half: 0.3, width: 0.06 },
];
const RIP_MS = 200; // marks/tears.ts, RIP
const BETWEEN_MS = 260; // several marks at once: one after the other

function create({ card }: MarkContext): MarkView {
  const tears = new Tears(card);
  const open = [false, false, false];

  async function rip(i: number): Promise<void> {
    open[i] = true;
    tears.open(i, SPOTS[i]!);
    card.shake(i === 2 ? 16 : 9, i === 2 ? 300 : 200);
    if (i === 2) tears.doom(true);
    await wait(RIP_MS);
  }

  return {
    async set(level) {
      // what goes, at once
      for (let i = 0; i < SPOTS.length; i++)
        if (open[i] && level <= i) {
          open[i] = false;
          tears.close(i);
          if (i === 2) tears.doom(false);
        }
      // what comes, one after the other
      for (let i = 0; i < SPOTS.length; i++)
        if (!open[i] && level > i) {
          await rip(i);
          await wait(BETWEEN_MS);
        }
    },
    destroy() {
      tears.destroy();
    },
  };
}

export const execution = defineMarkFx({ max: 3, create });
