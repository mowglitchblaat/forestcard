// The revealed cards leave to the left, as if a hand took the rightmost card and pushed the row.
//
// A "finger" moves from the rightmost card to past the stage's left edge. In each row, the card k-th
// from the right sits at `finger - k * spacing` once the finger has reached it, at its own place before:
// x = min(own x, finger - k * spacing). So a card starts moving exactly when the pile reaches it, and the
// pile packs tighter than the grid (spacing < card width + gap). The rightmost card of a row rides on top
// of the cards it pushes, each tilting a little while it is dragged. Rows are pushed by the same finger.

import type { Container } from 'pixi.js';
import type { Card } from '../card/card.ts';
import { tween } from '../engine/time.ts';
import type { Placement } from './grid.ts';

/** Where a card sits when the finger is at `finger`: its own place until the pile, `rank` cards deep, reaches it. */
export const pushedX = (ownX: number, rank: number, finger: number, spacing: number): number =>
  Math.min(ownX, finger - rank * spacing);

export async function sweepLeft(
  cards: readonly Card[],
  grid: Placement,
  o: { duration: number; spacing: number; fade?: readonly Container[] },
): Promise<void> {
  if (!cards.length) return;
  const d = grid.cardW * o.spacing;
  // rank from the right within each row (same y = same row)
  const start = cards.map((c) => ({ c, x: c.root.x, y: c.root.y, rot: c.root.rotation }));
  const rank = start.map((s) => start.filter((t) => Math.abs(t.y - s.y) < 1 && t.x > s.x).length);
  // the pushing card on top: in each row, left to right
  const parent = cards[0]!.root.parent;
  for (const s of [...start].sort((a, b) => a.x - b.x)) parent?.addChild(s.c.root);
  const from = Math.max(...start.map((s) => s.x));
  const to = -grid.cardW * 0.75; // the rightmost card (the one pushed by the finger) fully past the left edge, tilt included
  const fade = (o.fade ?? []).map((f) => ({ f, a: f.alpha }));
  await tween(
    o.duration,
    (u) => {
      const finger = from + (to - from) * u;
      start.forEach((s, i) => {
        const x = pushedX(s.x, rank[i]!, finger, d);
        const dragged = Math.min(1, (s.x - x) / grid.cardW);
        s.c.root.x = x;
        s.c.root.rotation = s.rot - 0.05 * dragged;
      });
      for (const { f, a } of fade) f.alpha = a * Math.max(0, 1 - u * 2.5);
    },
    'in-2',
  );
}
