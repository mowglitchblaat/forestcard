// L'atelier: what a stake brings back in each tier, and the reels stopping on the case drawn.

import { expect, test } from 'vite-plus/test';
import {
  conversion,
  multLabel,
  pullMultiplier,
  reelTarget,
  workshopError,
} from '../src/data/workshop.ts';

test('a stake, times the case, in the tier’s fragments (rounded down)', () => {
  // Épique: 1 for 1.
  expect(conversion(100, 1, 1)).toBe(100);
  expect(conversion(75, 0.5, 1)).toBe(37);
  // Légendaire: 3 fragments make one. 100 at ×1: 33; at ×1,2: 40; at ×3: 100.
  expect(conversion(100, 1, 3)).toBe(33);
  expect(conversion(100, 1.2, 3)).toBe(40);
  expect(conversion(100, 3, 3)).toBe(100);
  // GGEZ: 10 fragments make one. 100 at ×1: 10; at ×2: 20; at ×0,5: 5.
  expect(conversion(100, 1, 10)).toBe(10);
  expect(conversion(100, 2, 10)).toBe(20);
  expect(conversion(100, 0.5, 10)).toBe(5);
});

test('a reel stops on the case drawn, after its full rounds', () => {
  for (const from of [0, 3, 41])
    for (let index = 0; index < 4; index++) {
      const to = reelTarget(from, index, 4, 6);
      expect(to % 4).toBe(index);
      expect(to - from).toBeGreaterThanOrEqual(24);
      expect(to - from).toBeLessThan(28);
    }
});

test('the cases and the refusals, in words', () => {
  expect(multLabel(1.2)).toBe('×1,2');
  expect(multLabel(3)).toBe('×3');
  // Three reels: their product.
  expect(multLabel(pullMultiplier([0.5, 0.5, 1.2]))).toBe('×0,3');
  expect(pullMultiplier([3, 3, 3])).toBe(27);
  expect(conversion(100, pullMultiplier([0.5, 0.5, 1.2]), 1)).toBe(30);
  expect(workshopError(new Error('FRAGMENTS_INSUFFISANTS'))).toMatch(/Pas assez de fragments/);
  expect(workshopError(new Error('MISE_TROP_PETITE'))).toMatch(/Mise trop petite/);
});
