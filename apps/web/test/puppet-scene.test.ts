// Spot the differences: the same seed draws the same scenes, and the second scene has exactly the
// number of differences asked, each on its own part (one circle each).

import { expect, test } from 'vite-plus/test';
import { puppetGame } from '../src/views/games/puppet-scene.tsx';

test('a seed always draws the same pair of scenes', () => {
  expect(puppetGame(123456, 5)).toEqual(puppetGame(123456, 5));
});

test('as many differences as asked, on distinct parts', () => {
  for (let seed = 1; seed < 500; seed++) {
    const count = 3 + (seed % 6);
    const g = puppetGame(seed * 7919, count);
    expect(g.marks).toHaveLength(count);
    expect(new Set(g.marks.map((m) => `${m.x}:${m.y}`)).size).toBe(count);
    expect(g.b).not.toEqual(g.a);
  }
});
