// Workbench: one card shown in every rarity it exists in, side by side, to see all the effects at once.
// Every control applies to the whole row. It lives on the stage like any scene (stage pixels, inside
// `area`), so it can share the 1920 x 1080 screen with a booster.

import { Container, type Application } from 'pixi.js';
import type { Rect, Stage } from '../engine/stage.ts';
import { FRAME_SETS, TIERS, type Compo } from '@forestcard/layout';
import type { Card, CardData, Hidden } from '../card/card.ts';
import { allowsType } from '../config/rarities.ts';
import { wait } from '../engine/time.ts';
import { revealCard } from '../reveal/reveal.ts';
import {
  cardLayers,
  dressedCard,
  gridLayout,
  rarityOf,
  textResolutionFor,
  type Deps,
} from './common.ts';

export class Workbench {
  readonly root = new Container({ label: 'workbench' }); // at the stage origin: the shockwave can use it as its scene
  private readonly app: Application;
  private readonly stage: Stage;
  private readonly area: Rect;
  private readonly deps: Deps;
  private readonly behind: Container;
  private readonly layer: Container;
  cards: Card[] = [];

  constructor(app: Application, stage: Stage, area: Rect, deps: Deps) {
    this.app = app;
    this.stage = stage;
    this.area = area;
    this.deps = deps;
    stage.root.addChild(this.root);
    const { behind, cards } = cardLayers(this.root);
    this.behind = behind;
    this.layer = cards;
  }

  private get around() {
    return { app: this.app, behind: this.behind, scene: this.root };
  }

  // (Re)builds the row: the same card, once per rarity it exists in (and its frame set has frames
  // for). `card.tier` is ignored.
  show(card: CardData, o: { compo?: Partial<Compo> | null; hidden?: Hidden } = {}): void {
    for (const c of this.cards) c.destroy();
    const set = FRAME_SETS[card.frames ?? 'standard'];
    const tiers = TIERS.filter((t) => allowsType(t, card.type) && set.tiers.includes(t));
    const { x, y, w, h } = this.area;
    const grid = gridLayout(
      tiers.length,
      { x0: x, y0: y, w, h },
      { maxWidth: 0.2, maxRows: 1, gap: 0.07 },
    );
    const res = textResolutionFor(grid.scale * this.stage.scale, this.app);
    this.cards = tiers.map((tier, i) => {
      const c = dressedCard({ ...card, tier }, this.deps, {
        compo: o.compo,
        textResolution: res,
        hidden: o.hidden,
      });
      const at = grid.points[i]!;
      c.root.scale.set(grid.scale);
      c.root.position.set(at.x, at.y);
      this.layer.addChild(c.root);
      return c;
    });
  }

  clear(): void {
    for (const c of this.cards) c.destroy();
    this.cards = [];
  }

  setHidden(hidden: Hidden): void {
    for (const c of this.cards) c.setHidden(hidden);
  }

  lightLine(i: number): void {
    for (const c of this.cards) if (c.faceUp) c.lightLine(i);
  }

  // Every card shows its back, then all reveal at once, each the way its rarity says.
  async revealAll({ live = false } = {}): Promise<void> {
    for (const c of this.cards) c.show(false);
    await wait(300);
    await Promise.all(
      this.cards.map((c) => revealCard(c, rarityOf(c.opts.card), this.around, { live })),
    );
  }

  async flipAll({ live = false } = {}): Promise<void> {
    await Promise.all(this.cards.map((c) => c.flip(this.app, { duration: 800, live, lift: 0.04 })));
  }
}
