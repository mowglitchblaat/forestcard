// Placement on the 1920 x 1080 stage: anchored boxes, and the booster's zones fitting in it.

import { expect, test } from 'vite-plus/test';
import { BOOSTER, bySize, zoneFor } from '../src/config/booster.ts';
import { gridLayout } from '../src/scenes/grid.ts';
import { anchored } from '../src/engine/stage.ts';
import { pushedX } from '../src/scenes/sweep.ts';

const STAGE = { width: 1920, height: 1080 };

test('a box anchored bottom left touches the left and bottom margins', () => {
  expect(anchored(STAGE, 'bottom-left', 900, 440, 40)).toEqual({
    x: 40,
    y: 1080 - 40 - 440,
    w: 900,
    h: 440,
  });
  expect(anchored(STAGE, 'top-right', 100, 50, 10)).toEqual({
    x: 1920 - 10 - 100,
    y: 10,
    w: 100,
    h: 50,
  });
  expect(anchored(STAGE, 'centre', 200, 100, 40)).toEqual({ x: 860, y: 490, w: 200, h: 100 });
});

test('every booster zone fits inside the stage', () => {
  for (const z of BOOSTER.zones) {
    const r = anchored(STAGE, z.anchor, z.width, z.height, z.margin);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(STAGE.width);
    expect(r.y + r.h).toBeLessThanOrEqual(STAGE.height);
  }
});

test('a profile list by size picks the last profile reached', () => {
  const list = [
    { from: 1, id: 'a' },
    { from: 10, id: 'b' },
    { from: 15, id: 'c' },
  ];
  expect([1, 9, 10, 14, 15, 40].map((n) => bySize(list, n, 'test').id)).toEqual([
    'a',
    'a',
    'b',
    'b',
    'c',
    'c',
  ]);
  expect(zoneFor(15)).toBe(bySize(BOOSTER.zones, 15, 'zones'));
});

test('a grid aligned bottom left hugs that corner of its area, rows flush left', () => {
  const area = { x0: 100, y0: 200, w: 900, h: 400 };
  const g = gridLayout(7, area, { maxWidth: 0.2, maxRows: 2, gap: 0.1, align: [0, 1] }); // 4 + 3;
  expect(g.box.x).toBeCloseTo(100);
  expect(g.box.y + g.box.h).toBeCloseTo(600);
  const firstOfRow2 = g.points.find((p) => p.y > g.points[0]!.y)!;
  expect(firstOfRow2.x).toBeCloseTo(g.points[0]!.x); // the shorter row starts on the left too
});

test('a pushed card stays in place until the pile reaches it, then rides spacing behind', () => {
  // three cards at 100, 300, 500; pile spacing 30
  const row = [100, 300, 500],
    at = (finger: number) => row.map((x, i) => pushedX(x, row.length - 1 - i, finger, 30));
  expect(at(500)).toEqual([100, 300, 500]); // the finger touches the rightmost card
  expect(at(400)).toEqual([100, 300, 400]); // only it moves
  expect(at(320)).toEqual([100, 290, 320]); // the second one is caught, 30 behind
  expect(at(0)).toEqual([-60, -30, 0]); // all three piled
});
