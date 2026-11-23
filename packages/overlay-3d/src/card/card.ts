// A card on screen: the layout's layers drawn with Pixi, one container per group, plus the card back.
// The card knows no effect by name: it exposes its layers (fxContext) and runs the ambient effects its
// configuration gives it. Its animations (flip, revealWith) take their effect from the caller.

import {
  Container,
  Graphics,
  Sprite,
  Text,
  type Application,
  type ColorSource,
  type Filter,
  type Texture,
} from 'pixi.js';
import {
  FRAME_SETS,
  H,
  W,
  cssFont,
  frameSetFor,
  type CardInput,
  type CategoryStyles,
  type Compo,
  type FontSpec,
  type FrameSet,
  type FrameSetName,
  type Group,
  type Layout,
} from '@forestcard/layout';
import { glowTexture } from '../engine/textures.ts';
import { detach, easing, every, tween, type Easing, type Stoppable } from '../engine/time.ts';
import { runAll } from '../fx/run.ts';
import type { FxEntry } from '../fx/registry.ts';
import type { FxCard, FxContext, LayerName } from '../fx/types.ts';
import { drawLayer, type Textures } from './draw.ts';
import { flip, type FlipOptions } from './flip.ts';

// --- text measurement for the layout: the same canvas metrics Pixi uses for Text ---
const measureCtx = document.createElement('canvas').getContext('2d');
export const measure = (text: string, font: FontSpec): number => {
  if (!measureCtx) return text.length * font.size * 0.5;
  measureCtx.font = cssFont(font);
  return measureCtx.measureText(text).width;
};

// Groups the viewer can switch off ("frame only", "drawing only"…), with their labels.
export const TOGGLABLE_GROUPS = {
  drawing: 'Dessin',
  underFrame: 'Effet sous le cadre',
  plaque: 'Écriteau',
  frame: 'Cadre',
  stats: 'Chiffres',
  overFrame: 'Effets par-dessus la carte',
} as const satisfies Partial<Record<Group, string>>;
export type TogglableGroup = keyof typeof TOGGLABLE_GROUPS;
export type Hidden = Partial<Record<TogglableGroup, boolean>>;

// What the front shows: the texture names it reads (the caller loads them into `textures`).
//   built  composed at display time from the drawing alone, the frame and the plaque (the layout):
//          the overlay's main path.
//   flat   the version's flattened image (variantes_carte.image_path): the fallback when the version
//          has no drawing. It has no layer between the drawing and the frame, so the effects drawn
//          there (fx layers 'drawing', 'under', 'frame') do not run on it, and no line zones.
export type Face = { kind: 'built'; drawing: string } | { kind: 'flat'; image: string };

// A card's data for display: the layout's input + its face, and the frame set it is drawn in
// (FRAME_SETS: standard by default; a set without frames for the card's tier falls back on standard).
export type CardData = CardInput & {
  id: string;
  name: string;
  face: Face;
  frames?: FrameSetName | null;
};

export type CardOptions = {
  card: CardData;
  compo?: Partial<Compo> | null;
  styles: CategoryStyles;
  textures: Textures;
  colour: ColorSource; // the rarity colour
  rainbow?: boolean;
  ambient?: readonly FxEntry[];
  textResolution?: number;
  hidden?: Hidden;
  // texture name of the back: the player's in a combat (the back they chose); the default one (DEFAULT_BACK)
  // anywhere else, a booster's opening included. Not the frame set's: a back is a player's, not a card's.
  back?: string;
};

export const DEFAULT_BACK = 'dos';

export type StatRole = 'atq' | 'pv';
type StatText = { text: Text; value: number; shown: number; fill: string; fit: number };

// What a scene adds around a card for its effects (see FxContext).
export type SceneLayers = { app: Application | null; behind?: Container; scene?: Container };

const GROUP_OF_LAYER: Record<LayerName, Group | null> = {
  under: 'underFrame',
  frame: 'frame',
  drawing: 'drawing',
  over: 'overFrame',
  behind: null,
  scene: null,
};

// Every card stands in the same W x H box (scenes place and size cards by it). A frame set of another
// proportion is fitted to the box's height and centred: its face is scaled by k and sits in `box`.
type Box = { x: number; w: number; k: number };
const boxOf = (set: FrameSet): Box => {
  const k = H / set.height;
  const w = set.width * k;
  return { x: (W - w) / 2, w, k };
};
// the back asked for, or the default one when its image is missing
const backOf = (o: CardOptions): Texture | undefined =>
  o.textures[o.back ?? DEFAULT_BACK] ?? o.textures[DEFAULT_BACK];
const roundedMask = (b: Box) => new Graphics().roundRect(b.x, 0, b.w, H, 60).fill(0xffffff);

export class Card implements FxCard {
  readonly root = new Container();
  readonly front = new Container();
  readonly back = new Container();
  groups: Partial<Record<Group, Container>> = {};
  frameTexture: Texture | null = null;
  layout!: Layout;
  frameSet: FrameSetName = 'standard';
  box: Box = boxOf(FRAME_SETS.standard);
  opts!: CardOptions;
  faceUp = true;
  private fx: Stoppable[] = [];
  // the ATQ and PV numbers of a built card, to change them live (setStat)
  private stats: Partial<Record<StatRole, StatText>> = {};
  private shaking: { amp: number; left: number; ms: number } | null = null;

  constructor(o: CardOptions) {
    this.root.pivot.set(W / 2, H / 2);
    this.root.addChild(this.back, this.front);
    this.rebuild(o);
  }

  /** H / W of the visible card: a reveal shader's proportions. */
  get aspect(): number {
    return H / this.box.w;
  }

  // Recompose the front from scratch: this is what replaces "Refaire toutes" in the admin.
  rebuild(o: CardOptions): void {
    this.opts = o;
    this.stopFx();
    for (const c of this.front.removeChildren()) c.destroy({ children: true });
    this.frameSet = frameSetFor(o.card.frames, o.card.tier);
    const set = FRAME_SETS[this.frameSet];
    this.box = boxOf(set);
    // the face, in its frame set's own units, fitted into the box
    const face = new Container({ label: 'face' });
    face.scale.set(this.box.k);
    face.position.set(this.box.x, 0);
    this.front.addChild(face);
    this.stats = {};
    if (o.card.face.kind === 'built') this.buildFace(o, set, face, o.card.face.drawing);
    else this.buildFlat(o, set, face, o.card.face.image);
    const mask = roundedMask(this.box); // everything on the front stays inside the card's rounded shape
    this.front.addChild(mask);
    this.front.mask = mask;
    this.buildBack(o);
    this.setHidden(o.hidden ?? {});
    this.fx = runAll(o.ambient, this.fxContext({ app: null }));
  }

  private buildFace(o: CardOptions, set: FrameSet, face: Container, drawing: string): void {
    const tex = o.textures[drawing];
    this.layout = set.layout({
      card: o.card,
      drawing: tex ? { width: tex.width, height: tex.height } : null,
      compo: o.compo,
      measure,
      styles: o.styles,
    });
    // one container per group, stacked in the order the layout first uses them
    const groups: Partial<Record<Group, Container>> = {};
    const out = { frame: null as Texture | null };
    for (const l of this.layout.layers) {
      let g = groups[l.group];
      if (!g) {
        g = new Container({ label: l.group });
        groups[l.group] = g;
        face.addChild(g);
      }
      const d = drawLayer(l, this.layout, o.textures, drawing, o.textResolution ?? 1, out);
      if (d) g.addChild(d);
      if (d instanceof Text && l.kind === 'text' && (l.role === 'atq' || l.role === 'pv')) {
        const value = Number(l.text);
        // a number may grow a digit: it shrinks to stay as wide as the layout let it be, or 1.6 em
        this.stats[l.role] = {
          text: d,
          value,
          shown: value,
          fill: l.fill,
          fit: Math.max(d.width, l.font.size * 1.6),
        };
      }
    }
    this.groups = groups;
    this.frameTexture = out.frame;
  }

  // The flattened image fills the card. Without it (not copied yet, or a broken path), the back with
  // the card's name: a slot is never empty.
  private buildFlat(o: CardOptions, set: FrameSet, face: Container, image: string): void {
    const w = set.width,
      h = set.height;
    this.layout = { width: w, height: h, layers: [], zones: [] };
    this.frameTexture = null;
    const base = new Container({ label: 'base' }),
      over = new Container({ label: 'overFrame' });
    const tex = o.textures[image];
    const fill = tex ?? backOf(o);
    if (fill) {
      const s = new Sprite(fill);
      s.width = w;
      s.height = h;
      base.addChild(s);
    } else base.addChild(new Graphics().roundRect(0, 0, w, h, 60).fill('#14141c'));
    if (!tex) {
      const name = new Text({
        text: o.card.name,
        resolution: o.textResolution ?? 1,
        style: {
          fontFamily: ['Lilita One', 'Arial Black', 'sans-serif'],
          fontSize: 130,
          fill: 0xffffff,
          align: 'center',
          wordWrap: true,
          wordWrapWidth: w * 0.8,
          stroke: { color: 0x000000, width: 18, join: 'round' },
        },
      });
      name.anchor.set(0.5);
      name.position.set(w / 2, h / 2);
      base.addChild(name);
    }
    face.addChild(base, over);
    this.groups = { base, overFrame: over };
  }

  // The back (CardOptions.back), in the same box as the face.
  private buildBack(o: CardOptions): void {
    const wasVisible = this.back.visible && this.back.children.length > 0;
    for (const c of this.back.removeChildren()) c.destroy({ children: true });
    const back = backOf(o);
    if (back) {
      const s = new Sprite(back);
      s.position.set(this.box.x, 0);
      s.width = this.box.w;
      s.height = H;
      this.back.addChild(s);
    }
    const mask = roundedMask(this.box);
    this.back.addChild(mask);
    this.back.mask = mask;
    this.back.visible = wasVisible;
  }

  /** What an effect needs to draw on or around this card. */
  fxContext(scene: SceneLayers): FxContext {
    const s = this.root.scale.x;
    const layers: FxContext['layers'] = { behind: scene.behind, scene: scene.scene };
    for (const [name, group] of Object.entries(GROUP_OF_LAYER) as [LayerName, Group | null][])
      if (group) layers[name] = this.groups[group];
    return {
      layers,
      card: this,
      app: scene.app,
      // the card's own layers are in its frame set's units
      W: this.layout.width,
      H: this.layout.height,
      x: this.root.position.x,
      y: this.root.position.y,
      cardW: this.box.w * s,
      cardH: H * s,
      colour: this.opts.colour,
      rainbow: !!this.opts.rainbow,
    };
  }

  setHidden(hidden: Hidden): void {
    this.opts = { ...this.opts, hidden };
    for (const k of Object.keys(TOGGLABLE_GROUPS) as TogglableGroup[]) {
      const g = this.groups[k];
      if (g) g.visible = !hidden[k];
    }
  }

  // Show a face without animation (cards are dealt face down).
  show(faceUp: boolean): void {
    this.faceUp = faceUp;
    this.front.visible = faceUp;
    this.back.visible = !faceUp;
  }

  flip(app: Application, o: FlipOptions = {}): Promise<void> {
    return flip(this, app, o);
  }

  /**
   * The back goes away over the face through a filter driven by uProgress 0 -> 1 (reveal/*.ts).
   * Both faces are drawn; the filter decides, per pixel, what is already gone.
   */
  async revealWith(
    f: { filter: Filter; u: { uProgress: number; uTime: number } },
    { duration, ease = 'smooth' }: { duration: number; ease?: Easing },
  ): Promise<void> {
    this.front.visible = true;
    this.back.visible = true;
    this.root.addChild(this.back); // the back above the face
    this.back.filters = [f.filter];
    const e = easing(ease);
    let last = 0;
    try {
      await tween(duration, (k) => {
        f.u.uProgress = e(k);
        f.u.uTime += ((k - last) * duration) / 1000;
        last = k;
      });
    } finally {
      // the filter was made for this reveal (reveal/reveal.ts)
      if (!this.back.destroyed) this.back.filters = null;
      f.filter.destroy();
    }
    this.back.visible = false;
    this.faceUp = true;
  }

  // Lights the plaque line `i`, from the layout's own zones (no stored compo.zones).
  /**
   * An effect of the card acts: the short name of its plaque line `i` pops on the card, in its category's
   * colours (the plaque's pill), rises a little and fades. What an overlay shows instead of a plaque
   * (config/display.ts).
   */
  announce(i: number): void {
    const line = this.opts.card.lines[i];
    if (!line) return;
    const st = this.opts.styles[line.c] ?? this.opts.styles.autre;
    const size = H * 0.06;
    const label = new Text({
      text: line.t,
      resolution: this.opts.textResolution ?? 1,
      anchor: 0.5,
      style: {
        fontFamily: ['Lilita One', 'Arial Black', 'sans-serif'],
        fontSize: size,
        fill: st.color,
      },
    });
    const pw = label.width + size * 1.3,
      ph = size * 1.55;
    const border = st.border?.split(' ').pop();
    const pill = new Graphics()
      .roundRect(-pw / 2, -ph / 2 + size * 0.12, pw, ph, ph / 2)
      .fill({ color: 0x000000, alpha: 0.4 })
      .roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2)
      .fill(st.background);
    if (border)
      pill
        .roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2)
        .stroke({ color: border, width: size * 0.08 });
    const box = new Container({ label: 'announce' });
    box.addChild(pill, label);
    // never wider than the card
    const fit = Math.min(1, (W * 0.92) / pw);
    const y0 = H * 0.6;
    box.position.set(W / 2, y0);
    this.root.addChild(box);
    const pop = easing('out-back');
    detach(
      tween(
        1800,
        (u) => {
          box.scale.set(fit * (u < 0.15 ? 0.6 + 0.4 * pop(u / 0.15) : 1));
          box.position.y = y0 - H * 0.05 * u;
          box.alpha = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
        },
        'linear',
        box,
      ),
      () => box.destroy({ children: true }),
    );
  }

  /**
   * ATQ or PV changes: the number counts to its new value, red going down, green going up, with a pulse.
   * A flat card has its numbers in its image: nothing changes on it.
   */
  setStat(role: StatRole, value: number): void {
    const s = this.stats[role];
    if (!s) return;
    const from = s.shown,
      to = Math.max(0, Math.round(value));
    s.value = to;
    if (to === from) return;
    s.text.style.fill = to < from ? '#ff6a6a' : '#86efac';
    detach(
      tween(
        700,
        (u) => {
          s.shown = from + (to - from) * (1 - (1 - u) ** 3);
          s.text.text = String(Math.round(s.shown));
          const raw = s.text.width / s.text.scale.x;
          const p = Math.sin(Math.PI * Math.min(1, u * 1.6));
          s.text.scale.set(Math.min(1, s.fit / raw) * (1 + 0.16 * p));
        },
        'linear',
        s.text,
      ),
      () => {
        if (!s.text.destroyed) s.text.style.fill = s.fill;
      },
    );
  }

  /** The ATQ or PV a built card shows (its latest value), or null on a flat card. */
  stat(role: StatRole): number | null {
    return this.stats[role]?.value ?? null;
  }

  lightLine(i: number): void {
    const z = this.layout.zones[i];
    if (!z) return;
    const st = this.opts.styles[z.c] ?? this.opts.styles.autre;
    const col = st.background.startsWith('#') ? st.background : '#ffffff';
    const g = new Graphics()
      .roundRect(z.x - 20, z.y, z.w + 40, z.h, z.h / 2)
      .fill({ color: col, alpha: 0.35 })
      .roundRect(z.x - 20, z.y, z.w + 40, z.h, z.h / 2)
      .stroke({ color: 0xffffff, width: 10, alpha: 0.9 });
    g.blendMode = 'add';
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.position.set(z.x + z.w / 2, z.y + z.h / 2);
    halo.width = z.w * 1.5;
    halo.height = z.h * 3;
    halo.tint = col;
    halo.blendMode = 'add';
    g.addChild(halo);
    (this.groups.overFrame ?? this.front).addChild(g);
    detach(
      tween(
        1400,
        (u) => {
          g.alpha = Math.sin(u * Math.PI);
        },
        'linear',
        g,
      ),
      () => g.destroy(),
    );
  }

  /**
   * The card jolts (a blade lands, a hit): it shakes by `amount` (card units) for `ms`, dying down. A
   * stronger jolt takes over a weaker one; the card is back in place when it ends.
   */
  shake(amount: number, ms: number): void {
    const s = this.shaking;
    if (s && (s.amp * s.left) / s.ms >= amount) return;
    const running = !!s;
    this.shaking = { amp: amount, left: ms, ms };
    if (running) return;
    const loop = every(this.root, (dt) => {
      const k = this.shaking;
      if (!k || (k.left -= dt * 1000) <= 0) {
        this.shaking = null;
        this.root.pivot.set(W / 2, H / 2);
        loop.stop();
        return;
      }
      const a = (k.amp * k.left) / k.ms;
      this.root.pivot.set(W / 2 + (Math.random() * 2 - 1) * a, H / 2 + (Math.random() * 2 - 1) * a);
    });
  }

  stopFx(): void {
    for (const f of this.fx) f.stop();
    this.fx = [];
  }

  destroy(): void {
    this.stopFx();
    this.root.destroy({ children: true });
  }
}
