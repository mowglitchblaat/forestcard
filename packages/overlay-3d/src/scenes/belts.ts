// The championship's belts in a combat (combat.html: beltsDebut, beltsMaj, ceintureMilieu, titreBan,
// ceintureFin). Each side shows the belts its player holds over its fighter: the first one big across
// the bottom of the card, the next two smaller, slanted over its top corners; they glow, breathing.
// They belong to the side, not to the card: a relay's new fighter wears them too. A title fight
// shows its banner at the top of the screen (the belt on both sides, « COMBAT POUR LE TITRE », the
// belt's name, who defends it); a vacant belt waits between the two cards. At the end, the banner says
// who leaves with it, and the belt goes to the winner with a pop.

import { Container, Sprite, Text, type Texture } from 'pixi.js';
import { H, W } from '@forestcard/layout';
import { COMBAT } from '../config/combat.ts';
import { detach, every, tween } from '../engine/time.ts';
import type { TitleFight } from '../input/combat-message.ts';

const ORDER = ['libre', 'epique', 'rare'];
const NAMES: Record<string, string> = { rare: 'Rare', epique: 'Épique', libre: 'Libre' };
export const beltKey = (d: string): string => `cadres/ceinture-${d}.webp`;

type BeltsOptions = {
  parent: Container;
  textures: Readonly<Record<string, Texture>>;
  title: TitleFight | null;
  belts: readonly [readonly string[], readonly string[]];
  resolution: number;
};

export class CombatBelts {
  private readonly root = new Container({ label: 'belts' });
  private readonly sides: [Container, Container];
  private held: [string[], string[]];
  private title: TitleFight | null;
  private readonly textures: Readonly<Record<string, Texture>>;
  private middle: Sprite | null = null;
  private banner: { root: Container; line: Text } | null = null;
  private readonly resolution: number;

  constructor(o: BeltsOptions) {
    this.textures = o.textures;
    this.title = o.title ? { ...o.title } : null;
    this.resolution = o.resolution;
    // the order of combat.html: libre, épique, rare; the belt at stake first on its champion
    this.held = [0, 1].map((i) => {
      let list = [...(o.belts[i] ?? [])].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
      if (this.title) {
        list = list.filter((d) => d !== this.title!.division);
        if (this.title.side === i) list.unshift(this.title.division);
      }
      return list;
    }) as [string[], string[]];
    this.sides = [new Container(), new Container()];
    this.root.addChild(...this.sides);
    o.parent.addChild(this.root);
    this.root.alpha = 0;
    // they breathe: a slow glow
    every(this.root, (_dt, t) => {
      for (const s of this.sides)
        for (const b of s.children) b.alpha = 0.88 + 0.12 * Math.sin(t * 2.4);
      if (this.middle) this.middle.alpha = 0.9 + 0.1 * Math.sin(t * 2.4);
    });
    this.draw(0);
    this.draw(1);
    if (this.title && this.title.side === null) this.showMiddle();
  }

  private sprite(d: string): Sprite | null {
    const tex = this.textures[beltKey(d)];
    return tex ? new Sprite({ texture: tex, anchor: 0.5 }) : null;
  }

  // the belts of side i, over its fighter's place
  private draw(i: 0 | 1, pop: string | null = null): void {
    const P = COMBAT.place,
      h = P.fighter,
      w = (P.fighter * W) / H,
      x0 = P.fighterX[i]! - w / 2,
      y0 = P.y - h / 2;
    const side = this.sides[i];
    side.removeChildren().forEach((c) => c.destroy());
    this.held[i].slice(0, 3).forEach((d, k) => {
      const b = this.sprite(d);
      if (!b) return;
      const width = k === 0 ? w * 1.28 : w * 0.62;
      b.scale.set(width / b.texture.width);
      if (k === 0) b.position.set(x0 + w / 2, y0 + h * 0.86 - b.height / 2);
      else {
        b.position.set(x0 + w * (k === 1 ? 0.13 : 0.87), y0 + h * 0.07 + b.height / 2);
        b.rotation = ((k === 1 ? -45 : 45) * Math.PI) / 180;
      }
      side.addChild(b);
      if (d === pop) {
        const s0 = b.scale.x;
        detach(
          tween(900, (u) => b.scale.set(s0 * (0.2 + 0.8 * u + 0.25 * Math.sin(Math.PI * u))), 'out-cubic', b),
        );
      }
    });
  }

  // a vacant belt: between the two cards, over them
  private showMiddle(): void {
    if (!this.title || this.middle) return;
    const b = this.sprite(this.title.division);
    if (!b) return;
    const P = COMBAT.place;
    b.scale.set(500 / b.texture.width);
    b.position.set((P.fighterX[0] + P.fighterX[1]) / 2, P.y - P.fighter / 2 + b.height / 2 - 10);
    this.root.addChild(b);
    this.middle = b;
  }

  /** At the deal: the belts and the title's banner appear (pseudos: the players, side 0 and 1). */
  show(pseudos: readonly string[]): void {
    detach(tween(600, (u) => void (this.root.alpha = u), 'smooth', this.root));
    if (!this.title) return;
    const t = this.title,
      champion = t.side === null ? null : pseudos[t.side];
    const root = new Container({ label: 'title-banner' });
    const style = (size: number, fill: number, italic = false) => ({
      fontFamily: ['Lilita One', 'Arial Black', 'sans-serif'],
      fontSize: size,
      fill,
      fontStyle: italic ? ('italic' as const) : ('normal' as const),
      stroke: { color: 0x000000, width: 5, join: 'round' as const },
      align: 'center' as const,
    });
    const small = new Text({ text: '🏆 COMBAT POUR LE TITRE 🏆', anchor: 0.5, resolution: this.resolution, style: style(26, 0xfde68a) });
    const big = new Text({
      text: `CEINTURE ${(NAMES[t.division] ?? t.division).toUpperCase()}`,
      anchor: 0.5,
      resolution: this.resolution,
      style: style(50, 0xffffff),
    });
    const line = new Text({
      text: champion ? `${champion} défend sa ceinture` : 'Ceinture vacante : le vainqueur la prend',
      anchor: 0.5,
      resolution: this.resolution,
      style: style(28, 0xe5e7eb, true),
    });
    small.y = -48;
    line.y = 46;
    root.addChild(small, big, line);
    for (const dir of [-1, 1]) {
      const b = this.sprite(t.division);
      if (!b) continue;
      b.scale.set(190 / b.texture.width);
      b.x = dir * (Math.max(big.width, line.width) / 2 + 130);
      root.addChild(b);
    }
    root.position.set(960, 92);
    root.alpha = 0;
    this.root.parent?.addChild(root);
    detach(tween(500, (u) => void (root.alpha = u), 'smooth', root));
    this.banner = { root, line };
  }

  /** At the end: who leaves with the belt (winner: the side, null: a draw). */
  end(winner: 0 | 1 | null, pseudos: readonly string[]): void {
    const t = this.title;
    if (!t) return;
    const line = this.banner?.line;
    const name = (i: 0 | 1) => pseudos[i] ?? '?';
    if (winner === null) {
      if (line)
        line.text =
          t.side !== null ? `Match nul : ${name(t.side)} garde sa ceinture` : 'Match nul : la ceinture reste vacante';
      return;
    }
    if (t.side === winner) {
      if (line) line.text = `${name(winner)} conserve sa ceinture !`;
      this.draw(winner, t.division);
      return;
    }
    if (line) {
      line.text = `👑 NOUVEAU CHAMPION : ${name(winner)} !`;
      line.style.fill = 0xfde68a;
    }
    this.held = this.held.map((list) => list.filter((d) => d !== t.division)) as [string[], string[]];
    this.held[winner].unshift(t.division);
    t.side = winner;
    if (this.middle) {
      this.middle.destroy();
      this.middle = null;
    }
    this.draw(0);
    this.draw(1);
    this.draw(winner, t.division);
  }

  /** The cards go back: everything fades. */
  leave(): Promise<void> {
    const banner = this.banner?.root;
    return tween(300, (u) => {
      this.root.alpha = 1 - u;
      if (banner) banner.alpha = 1 - u;
    });
  }

  destroy(): void {
    this.banner?.root.destroy({ children: true });
    this.root.destroy({ children: true });
  }
}
