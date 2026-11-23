// The moves played on one card (moves/define.ts). They play one after the other: a move asked while
// another plays waits for it, so two moves never pull the card at once. A move that fails is reported
// and the next one plays.

import { Container, type Application } from 'pixi.js';
import { H, W } from '@forestcard/layout';
import type { Card } from '../card/card.ts';
import { report } from '../engine/time.ts';
import { MOVE_FX, type MoveKind } from './registry.ts';

export class CardMoves {
  private readonly card: Card;
  private readonly app: Application;
  private readonly away: -1 | 1;
  private queue: Promise<void> = Promise.resolve();

  constructor(card: Card, app: Application, o: { away: -1 | 1 }) {
    this.card = card;
    this.app = app;
    this.away = o.away;
  }

  /** Plays `kind` once the moves asked before it have played. Resolves when it has played. */
  play(kind: MoveKind): Promise<void> {
    const run = this.queue.then(() => this.run(kind)).catch(report);
    this.queue = run;
    return run;
  }

  private async run(kind: MoveKind): Promise<void> {
    const root = this.card.root;
    if (root.destroyed) return;
    // behind the card: a layer that stands where the card stands, in card units
    const behind = new Container({ label: `move-${kind}-behind` });
    behind.pivot.set(W / 2, H / 2);
    behind.position.copyFrom(root.position);
    behind.scale.copyFrom(root.scale);
    behind.rotation = root.rotation;
    const parent = root.parent;
    if (parent) parent.addChildAt(behind, parent.getChildIndex(root));
    const over = new Container({ label: `move-${kind}-over` });
    root.addChild(over);
    try {
      await MOVE_FX[kind].play({ card: this.card, app: this.app, behind, over, away: this.away });
    } finally {
      behind.destroy({ children: true });
      if (!over.destroyed) over.destroy({ children: true });
    }
  }
}
