// Booster opening: the pack, then the cards dealt face down on a grid and revealed, each the way its
// rarity says, at the pace config/booster.ts sets. Played from an event like the one Streamer.bot sends
// (ouvrir_booster).
// Everything is placed in stage pixels (1920 x 1080), inside the zone chosen for the booster's size
// (BOOSTER.zones, anchored bottom left by default). Effects may spill out of the zone.

import { Container, NineSliceSprite, Text, type Application } from 'pixi.js';
import { TIERS } from '@forestcard/layout';
import type { Card, CardData, Hidden } from '../card/card.ts';
import { BOOSTER, pacingFor, zoneFor } from '../config/booster.ts';
import { DISPLAY } from '../config/display.ts';
import { anchored, anchorFactors, type Stage } from '../engine/stage.ts';
import { softPanelTexture } from '../engine/textures.ts';
import { tween, wait } from '../engine/time.ts';
import { revealCard } from '../reveal/reveal.ts';
import {
  cardLayers,
  dressedCard,
  gridLayout,
  rarityOf,
  textResolutionFor,
  type Deps,
} from './common.ts';
import { dealFromPack } from './deal.ts';
import { openPack } from './pack.ts';
import { sweepLeft } from './sweep.ts';

export type BoosterEvent = {
  t: 'booster';
  pseudo: string;
  booster: string;
  // texture name of the booster's image (types_boosters.image_path, loaded into deps.textures by the
  // caller); the generic pack without it
  image?: string | null;
  cartes: readonly (CardData & { compo?: object | null })[];
};

/** `layer`: where the scene goes, in stage coordinates (a child of stage.root, or stage.root itself). */
export type BoosterContext = {
  app: Application;
  stage: Stage;
  layer: Container;
  deps: Deps;
  live: () => boolean;
  // groups of the cards not drawn; DISPLAY.hidden by default (no plaque)
  hidden?: Hidden;
};

export async function playBooster(ctx: BoosterContext, ev: BoosterEvent): Promise<void> {
  const { app, stage, layer } = ctx,
    B = BOOSTER;
  const Z = zoneFor(ev.cartes.length),
    zone = anchored(stage, Z.anchor, Z.width, Z.height, Z.margin);
  const scene = new Container({ label: 'booster' });
  layer.addChild(scene);
  let cards: Card[] = [];
  // Whatever happens, the scene leaves the screen with its cards: on an error the player goes on with the
  // next event, and nothing of this one may stay behind (engine/player.ts).
  try {
    // The cards are built before anything shows: a card that cannot be built (unexpected data) fails the
    // event at once, instead of after a pack opened on screen for nothing.
    // Rarest last, on the grid and in time.
    const C = B.cards,
      P = pacingFor(ev.cartes.length);
    const list =
      P.order === 'rarity'
        ? [...ev.cartes].sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier))
        : [...ev.cartes];
    const area = {
      x0: zone.x + C.padding,
      y0: zone.y + B.title.band,
      w: zone.w - 2 * C.padding,
      h: zone.h - B.title.band - C.padding,
    };
    // The grid hugs the zone's anchored corner; the title sits right above it, the pack in its middle.
    const grid = gridLayout(list.length, area, {
      maxWidth: C.maxWidth,
      maxRows: C.maxRows,
      gap: C.gap,
      align: anchorFactors(Z.anchor),
    });
    const box = grid.box;
    const res = textResolutionFor(grid.scale * stage.scale, app);
    for (const c of list) {
      const card = dressedCard(c, ctx.deps, {
        compo: c.compo,
        textResolution: res,
        hidden: ctx.hidden ?? DISPLAY.hidden,
      });
      cards.push(card); // at once: if the next card fails to build, this one is still destroyed
      card.show(false);
    }

    // Optional darkening of the zone only (backdrop.alpha > 0), its edges fading out; none by default.
    const F = B.backdrop.feather;
    const dim = new NineSliceSprite({
      texture: softPanelTexture(F),
      leftWidth: F,
      rightWidth: F,
      topHeight: F,
      bottomHeight: F,
    });
    dim.position.set(zone.x - F, zone.y - F);
    dim.setSize(zone.w + 2 * F, zone.h + 2 * F);
    dim.tint = 0x05060a;
    dim.visible = B.backdrop.alpha > 0;
    const title = new Text({
      text: B.title.text.replace('{pseudo}', ev.pseudo).replace('{booster}', ev.booster),
      style: {
        fontFamily: ['Lilita One', 'sans-serif'],
        fontSize: B.title.size,
        fill: 0xffffff,
        dropShadow: {
          color: 0x000000,
          blur: B.title.shadow.blur,
          distance: B.title.shadow.distance,
          angle: Math.PI / 2,
          alpha: B.title.shadow.alpha,
        },
        ...(B.title.outline > 0
          ? {
              stroke: {
                color: 0x000000,
                width: B.title.outline,
                alpha: 0.6,
                join: 'round' as const,
              },
            }
          : {}),
      },
      anchor: 0.5,
      resolution: Math.max(0.25, stage.scale * app.renderer.resolution), // 1:1 with the screen
    });
    title.position.set(box.x + box.w / 2, box.y - B.title.band / 2);
    dim.alpha = title.alpha = 0;
    scene.addChild(dim, title);
    await tween(500, (u) => {
      dim.alpha = B.backdrop.alpha * u;
      title.alpha = u;
    });

    const pack = await openPack(
      app,
      scene,
      { name: ev.booster, image: (ev.image && ctx.deps.textures[ev.image]) || null },
      { x: box.x + box.w / 2, y: box.y + box.h / 2 },
      Math.min(B.pack.height, box.h * 0.95),
      stage.height,
      B.pack,
    );

    const { behind, cards: cardLayer } = cardLayers(scene);
    for (const c of cards) cardLayer.addChild(c.root);
    await Promise.all([pack.after, dealFromPack(cards, pack, grid, C, B.pack.exit, box.y)]);

    // Quick rarities in a cascade: each starts `cascade` ms after the previous, without waiting for it.
    // The others one at a time, after the running cascade has ended.
    const around = { app, behind, scene };
    let running: Promise<void>[] = [];
    for (const card of cards) {
      const rarity = rarityOf(card.opts.card);
      if (P.quick.includes(card.opts.card.tier)) {
        const r = revealCard(card, rarity, around, { live: ctx.live() });
        r.catch(() => {}); // handled by Promise.all(running) below; not reported as unhandled meanwhile
        running.push(r);
        await wait(P.cascade);
      } else {
        await Promise.all(running);
        running = [];
        await revealCard(card, rarity, around, { live: ctx.live() });
        await wait(P.betweenReveals);
      }
    }
    await Promise.all(running);
    await wait(B.hold);
    // the title and what is left of the reveal effects (they stay where the cards were) fade as the cards go
    await sweepLeft(cards, grid, { ...B.sweep, fade: [title, dim, behind] });
  } finally {
    for (const c of cards) c.destroy();
    scene.destroy({ children: true });
  }
}
