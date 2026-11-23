// The marks laid on one card (marks/define.ts). Each kind draws on its own layer over the card, in card
// units; it belongs to the card, so destroying the card takes its marks and their loops with it.

import { Container } from 'pixi.js';
import type { Card } from '../card/card.ts';
import type { MarkLeave, MarkView } from './define.ts';
import { MARK_FX, type MarkKind } from './registry.ts';

type Live = { view: MarkView; layer: Container; level: number };

export class CardMarks {
  private readonly card: Card;
  private readonly root = new Container({ label: 'marks' });
  private readonly live = new Map<MarkKind, Live>();

  constructor(card: Card) {
    this.card = card;
    card.root.addChild(this.root);
  }

  level(kind: MarkKind): number {
    return this.live.get(kind)?.level ?? 0;
  }

  /**
   * The mark's level becomes `level` (clamped to 0…max): the new marks land, those above it go (`leave`:
   * they fade, or fall off). Resolves when they have; at 0 the mark's layer goes too.
   */
  async set(kind: MarkKind, level: number, leave: MarkLeave = 'fade'): Promise<void> {
    const def = MARK_FX[kind];
    const to = Math.max(0, Math.min(def.max, Math.round(level)));
    let l = this.live.get(kind);
    if (!l) {
      if (!to) return;
      const layer = new Container({ label: `mark-${kind}` });
      this.root.addChild(layer);
      l = { view: def.create({ card: this.card, layer }), layer, level: 0 };
      this.live.set(kind, l);
    }
    l.level = to;
    await l.view.set(to, leave);
    // gone, unless it was laid again meanwhile
    if (this.live.get(kind) === l && !l.level) {
      this.live.delete(kind);
      l.view.destroy();
      l.layer.destroy({ children: true });
    }
  }

  /** The mark acts (the programmed slots light up). Resolves when it has; nothing if it is not laid. */
  async tick(kind: MarkKind): Promise<void> {
    await this.live.get(kind)?.view.tick?.();
  }

  async clear(): Promise<void> {
    await Promise.all([...this.live.keys()].map((k) => this.set(k, 0)));
  }
}
