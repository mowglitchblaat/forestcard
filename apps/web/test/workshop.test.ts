// L'atelier: the wheel's arcs follow the chances, and the wheel stops on the case drawn.

import { expect, test } from 'vite-plus/test';
import { landingRotation, multLabel, wheelArcs, workshopError } from '../src/data/workshop.ts';

const cases = [
  { mult: 0.5, poids: 40 },
  { mult: 1.2, poids: 35 },
  { mult: 2, poids: 20 },
  { mult: 3, poids: 5 },
];

test('each case is as wide as its chance', () => {
  const arcs = wheelArcs(cases);
  expect(arcs.map((a) => Math.round(a.end - a.start))).toEqual([144, 126, 72, 18]);
  expect(arcs.at(-1)?.end).toBeCloseTo(360);
});

test('the wheel stops with the drawn case under the pointer, after whole turns', () => {
  const arcs = wheelArcs(cases);
  for (const from of [0, 137, 2405.5])
    for (let index = 0; index < 4; index++)
      for (const share of [0, 0.5, 1]) {
        const r = landingRotation(arcs, index, from, share);
        expect(r - from).toBeGreaterThanOrEqual(6 * 360);
        const top = (((360 - r) % 360) + 360) % 360;
        const arc = arcs[index] ?? { start: 0, end: 0 };
        expect(top).toBeGreaterThan(arc.start);
        expect(top).toBeLessThan(arc.end);
      }
});

test('the cases and the refusals, in words', () => {
  expect(multLabel(1.2)).toBe('×1,2');
  expect(multLabel(3)).toBe('×3');
  expect(workshopError(new Error('FRAGMENTS_INSUFFISANTS'))).toMatch(/Pas assez de fragments/);
});
