// The cards come out of the torn pack as one face-down stack, then spread onto their places on the grid.
//
// The stack starts inside the pack's bottom piece, behind it: the pack hides it, no mask needed. It
// rises out through the tear while the pack slides down and fades. Then the top card goes to the first
// place, the next one to the second, and so on, each shrinking or growing to the grid's size.

import { W, H } from '@forestcard/layout';
import type { Card } from '../card/card.ts';
import type { BoosterConfig } from '../config/types.ts';
import { tween, wait } from '../engine/time.ts';
import type { Placement } from './common.ts';
import type { OpenedPack } from './pack.ts';

/** `ceiling`: the stack's top edge never goes above it (the title is over it). */
export async function dealFromPack(
  cards: readonly Card[],
  pack: OpenedPack,
  grid: Placement,
  C: BoosterConfig['cards'],
  packExit: number,
  ceiling: number,
): Promise<void> {
  if (!cards.length) {
    await pack.leave(packExit);
    return;
  }
  const parent = cards[0]!.root.parent;
  // stack size: a little narrower than the pack, so its sides stay hidden while inside
  const k = (pack.width * 0.86) / W,
    h = H * k;
  const step = h * 0.006; // each card a hair lower and to the right: the stack has a thickness
  const startY = pack.top + h / 2 + (pack.bottom - pack.top - h) / 2;
  const endY = Math.max(pack.top - h * 0.12, ceiling + h / 2);
  const offset = (i: number) => Math.min(i, 6) * step;
  // the first card on top
  for (let i = cards.length - 1; i >= 0; i--) {
    const r = cards[i]!.root;
    r.position.set(pack.x + offset(i), startY + offset(i));
    r.scale.set(k);
    r.rotation = (Math.random() - 0.5) * 0.04;
    r.alpha = 1;
    parent?.addChild(r);
  }
  pack.root.parent?.addChild(pack.root);

  await Promise.all([
    tween(
      C.rise,
      (u) => {
        cards.forEach((c, i) =>
          c.root.position.set(pack.x + offset(i), startY + (endY - startY) * u + offset(i)),
        );
      },
      'out-cubic',
    ),
    wait(C.rise * 0.25).then(() => pack.leave(packExit)),
  ]);

  await Promise.all(
    cards.map((card, i) =>
      wait(i * C.dealStagger).then(() => {
        const r = card.root,
          from = { x: r.x, y: r.y, rot: r.rotation },
          to = grid.points[i]!;
        return tween(
          C.deal,
          (u) => {
            r.position.set(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u);
            r.scale.set(k + (grid.scale - k) * u);
            r.rotation = from.rot * (1 - u);
          },
          'out-cubic',
        );
      }),
    ),
  );
  // back to grid order: a card lifted while it turns must pass over the cards before it
  for (const c of cards) parent?.addChild(c.root);
}
