// A card's face as layers, for the WebGL overlays (apps/overlay-3d): the bare drawing, the plaque and its
// lines, the frame, the ATQ and PV. The very layout of the card composer (apps/site/src/composeur.js,
// `rendre` and `ecriteau`), the same numbers, the same rules, written as data instead of canvas calls: a
// card built here looks like the image the admin makes from the same drawing and settings.
//
// Pure: no DOM. The caller measures text (`measure`, with the same canvas metrics the renderer uses)
// and gives the drawing's size; the layout says what goes where, in the frame set's units (1488 x 2070).

/** Every card stands in a W x H box (scenes place and size cards by it): the frames' size. */
export const W = 1488;
export const H = 2070;

export type CardType = 'combattant' | 'magie' | 'piege';
/** The rarities, from the lowest: the order a booster reveals them in. */
export const TIERS = ['commun', 'rare', 'epique', 'legendaire', 'ggez'] as const;
export type Tier = (typeof TIERS)[number];

/** A line of the plaque (packages/describe, plaqueLinesExplained). */
export type PlaqueLine = { t: string; c: string; ult: boolean; d: string; types: string[] };

/** The colours of an effect category: its pill's background and text, and its border. */
export type CategoryStyle = { background: string; color: string; border?: string };
/** The colours of each effect category (packages/describe, CATEGORY_STYLES); `autre`: the default. */
export type CategoryStyles = Readonly<Record<string, CategoryStyle>> & {
  readonly autre: CategoryStyle;
};

/**
 * The composer's settings, stored with the drawing on the Standard version (variantes_carte.compo):
 * the composer's own names and defaults (DEF).
 */
export type Compo = {
  police: string;
  style: 'pastille' | 'texte';
  taille: number;
  decal: number;
  marge: number;
  daUlt: boolean;
  lueur: boolean;
  details: boolean;
  dtaille: number;
  z: number;
  sx: number;
  sy: number;
  x: number;
  y: number;
  textes: string[] | null;
  dtextes: string[] | null;
};
export const DEFAULT_COMPO: Readonly<Compo> = {
  police: 'Lilita One',
  style: 'pastille',
  taille: 100,
  decal: 0,
  marge: 55,
  daUlt: true,
  lueur: false,
  details: true,
  dtaille: 100,
  z: 1,
  sx: 1,
  sy: 1,
  x: 0,
  y: 0,
  textes: null,
  dtextes: null,
};
/** The fonts the composer offers for the plaque (the page loads them). */
export const FONTS = [
  'Lilita One',
  'Russo One',
  'Bangers',
  'Cinzel Decorative',
  'Pirata One',
  'Metamorphous',
  'Arial Black',
] as const;

/** What the layout needs of a card. */
export type CardInput = {
  tier: Tier;
  type: CardType;
  atq?: number | string | null;
  pv?: number | string | null;
  lines: readonly PlaqueLine[];
  // the trap's condition and the ultimate's trigger, in words (frame sets that write them)
  trigger?: string | null;
  ultimateTrigger?: string | null;
};

export type FontSpec = {
  family: readonly string[];
  size: number;
  weight: number;
  italic: boolean;
};
/** A font as CSS writes it (canvas `font`, the measure). */
export const cssFont = (f: FontSpec): string =>
  `${f.italic ? 'italic ' : ''}${f.weight} ${f.size}px ${f.family.map((n) => (/\s/.test(n) && !n.includes('-') ? `"${n}"` : n)).join(',')}`;

/** The groups a face is drawn in, from the back: the overlay stacks one container per group. */
export type Group = 'base' | 'drawing' | 'underFrame' | 'plaque' | 'frame' | 'stats' | 'overFrame';

type Box = { x: number; y: number; w: number; h: number };
export type Layer =
  | { kind: 'background'; group: Group; colour: string }
  | ({ kind: 'drawing'; group: Group } & Box)
  // an empty place in the stack, where effects draw (under the frame, over the card)
  | { kind: 'slot'; group: Group }
  // the frame: the first of these textures that exists
  | { kind: 'frame'; group: Group; candidates: readonly string[] }
  // a band of a frame-sized image (`from`: its rows), stretched into the box
  | ({ kind: 'image'; group: Group; src: string; from: { y: number; h: number } } & Box)
  // a vertical gradient of one colour, alpha stops [t, alpha]
  | ({
      kind: 'gradient';
      group: Group;
      colour: readonly [number, number, number];
      stops: readonly (readonly [number, number])[];
    } & Box)
  | ({ kind: 'rect'; group: Group; radius: number; fill: string } & Box)
  | ({
      kind: 'pill';
      group: Group;
      fill: string;
      shadow: { dy: number };
      border: { color: string; width: number } | null;
    } & Box)
  | {
      kind: 'text';
      group: Group;
      role: 'line' | 'detail' | 'atq' | 'pv';
      text: string;
      font: FontSpec;
      fill: string;
      stroke: { color: string; width: number } | null;
      shadow: { alpha: number; blur: number; dy: number } | null;
      glow: { color: string; blur: number } | null;
      x: number; // its centre
      y: number;
    };

/** Where a plaque line is (layout units): the combat overlay lights it when its effect acts. */
export type Zone = { types: readonly string[]; ult: boolean; c: string; col: string } & Box;

export type Layout = {
  width: number;
  height: number;
  layers: Layer[];
  zones: Zone[];
};

export type LayoutArgs = {
  card: CardInput;
  drawing: { width: number; height: number } | null;
  compo?: Partial<Compo> | null;
  measure: (text: string, font: FontSpec) => number;
  styles: CategoryStyles;
};

// ---------------------------------------------------------------------------------------------------
// The composer's numbers (composeur.js)

// The plaque's band in the frame, per tier (y0, y1); magic and trap: the free zone of the frame under the
// drawing's window, from ZONE_TOP down.
const BAND: Readonly<Record<Tier | 'magie' | 'piege', readonly [number, number]>> = {
  ggez: [1294, 1789],
  legendaire: [1349, 1848],
  epique: [1200, 1708],
  rare: [1094, 1651],
  commun: [1430, 1700],
  magie: [1610, 2025],
  piege: [1690, 2025],
};
const ZONE_TOP = 1100;
const RANDOM = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
const ULTIMATE_LIKE = ['ultime', 'fatigue', 'rage', 'exec'];

// a category's text colour on the plaque: its catalogue colour; dark backgrounds turn to their light
// colour, 'autre' is white (composeur.js: eclaircir, coul)
function lighten(h: string): string {
  const v = parseInt(h.slice(1), 16),
    r = v >> 16,
    g = (v >> 8) & 255,
    b = v & 255,
    l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (l > 0.45) return h;
  const t = 0.45 - l + 0.15,
    m = (x: number) => Math.round(x + (255 - x) * t);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
const styleOf = (styles: CategoryStyles, c: string): CategoryStyle => styles[c] ?? styles.autre;
function textColour(styles: CategoryStyles, c: string): string {
  if (c === 'autre') return '#f4f4f5';
  const s = styleOf(styles, c);
  if (ULTIMATE_LIKE.includes(c)) return s.color;
  return /^#[0-9a-f]{6}$/i.test(s.background) ? lighten(s.background) : s.background;
}
// 'alea': the composer paints a rainbow gradient; a layer has one colour: the middle one
const solid = (styles: CategoryStyles, c: string, of: 'text' | 'pill') =>
  c === 'alea' ? RANDOM[2]! : of === 'text' ? textColour(styles, c) : styleOf(styles, c).background;

/** The plaque's lines: automatic (ultimate then passives), or the admin's own text line by line. */
export function plaqueLinesOf(card: CardInput, o: Compo): PlaqueLine[] {
  const auto = card.lines;
  let L: PlaqueLine[] = [...auto];
  if (o.textes)
    L = o.textes.map((t, i) => ({
      t,
      c: auto[i]?.c ?? 'autre',
      ult: !!auto[i]?.ult,
      d: auto[i]?.d ?? '',
      types: auto[i]?.types ?? [],
    }));
  if (o.dtextes) {
    const d = o.dtextes;
    L = L.map((l, i) => ({ ...l, d: d[i] ?? l.d }));
  }
  return L.filter((l) => l.t.trim());
}

// The plaque: its background, its lines (titles, the ultimate larger; explanations small under each)
function plaque(
  out: Layer[],
  zones: Zone[],
  where: Tier | 'magie' | 'piege',
  L: readonly PlaqueLine[],
  o: Compo,
  a: LayoutArgs,
): void {
  const [y0, y1] = BAND[where],
    k = o.taille / 100;
  const font = (size: number, italic: boolean): FontSpec => ({
    family: [o.police, 'Arial Black', 'sans-serif'],
    size,
    weight: o.police === 'Arial Black' ? 900 : 400,
    italic,
  });
  const dfont = (size: number): FontSpec => ({
    family: ['Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
    size,
    weight: 700,
    italic: false,
  });
  const zone = where === 'magie' || where === 'piege',
    expl = o.details !== false && L.some((l) => l.d && l.d.trim()),
    maxW = W * 0.86,
    pill = o.style === 'pastille',
    hmax = zone ? (y1 - ZONE_TOP) * 0.92 : expl ? Math.min(860, H * 0.42) : (y1 - y0) * 0.86;
  // an explanation wrapped, 4 lines at most (the last one cut with « … »)
  const wrap = (t: string, s: number, max: number): string[] => {
    const f = dfont(s),
      lines: string[] = [];
    let cur = '';
    for (const m of t.split(/\s+/)) {
      const tt = cur ? cur + ' ' + m : m;
      if (a.measure(tt, f) > max && cur) {
        lines.push(cur);
        cur = m;
      } else cur = tt;
    }
    if (cur) lines.push(cur);
    if (lines.length > 4) {
      const z = lines.slice(0, 4);
      let d = z[3]!;
      while (d.length && a.measure(d + ' …', f) > max) d = d.replace(/\s*\S+$/, '');
      z[3] = d + ' …';
      return z;
    }
    return lines;
  };
  // the layout at scale f
  const plan = (f: number) => {
    const tU = 150 * k * f,
      tP = 116 * k * f,
      ds = (64 * k * f * (o.dtaille || 100)) / 100,
      gap = 26 * k * f;
    const P = L.map((l) => {
      const da = l.ult && o.daUlt,
        pt = pill && !da;
      let s = l.ult ? tU : tP;
      while (a.measure(l.t, font(s, da)) > maxW * (pt ? 0.9 : 1) && s > 30) s -= 4;
      const th = s * (pt ? 1.25 : 1.02),
        dl = expl && l.d && l.d.trim() ? wrap(l.d.trim(), ds, maxW * 0.96) : [],
        dh = dl.length ? ds * 0.3 + dl.length * ds * 1.18 : 0;
      return { l, da, pt, s, th, dl, dh };
    });
    return {
      P,
      ds,
      gap,
      tot: P.reduce((acc, p) => acc + p.th + p.dh, 0) + gap * Math.max(0, P.length - 1),
    };
  };
  let f = 1,
    pl = plan(f);
  while (pl.tot > hmax && f > 0.4) {
    f *= 0.95;
    pl = plan(f);
  }
  const { P, ds, gap, tot } = pl;
  let cy0 = (y0 + y1) / 2 + o.decal;
  const m = o.marge * k;
  // in the frame's free zone, or higher on the drawing when the text is tall or moved
  if (zone) cy0 = Math.min(Math.max(cy0, ZONE_TOP + tot / 2 + m * 0.4), y1 - tot / 2 - m * 0.4);
  // the plaque never comes down onto the frame's bottom nor onto the numbers
  else if (L.length && cy0 + tot / 2 + m > 1800) cy0 = 1800 - tot / 2 - m;
  const e0 = L.length ? cy0 - tot / 2 - m : y0,
    e1 = L.length ? cy0 + tot / 2 + m : y1;
  const group: Group = 'plaque';
  if (zone) {
    if (L.length)
      out.push({
        kind: 'rect',
        group,
        x: W * 0.05,
        y: cy0 - tot / 2 - m * 0.4,
        w: W * 0.9,
        h: tot + m * 0.8,
        radius: 40,
        fill: 'rgba(6,6,10,.55)',
      });
  } else if (where === 'commun')
    out.push({
      kind: 'gradient',
      group,
      x: 0,
      y: e0,
      w: W,
      h: e1 - e0,
      colour: [8, 10, 9],
      stops: [
        [0, 0],
        [0.18, 0.76],
        [0.82, 0.76],
        [1, 0],
      ],
    });
  else
    out.push({
      kind: 'image',
      group,
      src: `cadres/ecriteau-${where}.png`,
      from: { y: y0, h: y1 - y0 },
      x: 0,
      y: e0,
      w: W,
      h: e1 - e0,
    });
  let y = cy0 - tot / 2;
  for (const { l, da, pt, s, th, dl, dh } of P) {
    const cy = y + th / 2,
      ft = font(s, da),
      tw = a.measure(l.t, ft);
    const lw = Math.min(maxW, Math.max(tw + s * 1.2, dl.length ? maxW * 0.96 : 0));
    zones.push({
      types: l.types,
      ult: l.ult,
      c: l.c,
      col: styleOf(a.styles, l.c).background,
      x: W / 2 - lw / 2,
      y: y - gap * 0.35,
      w: lw,
      h: th + dh + gap * 0.7,
    });
    const text = (
      fill: string,
      rest: Partial<Extract<Layer, { kind: 'text' }>>,
      dy = 0,
    ): Layer => ({
      kind: 'text',
      group,
      role: 'line',
      text: l.t,
      font: ft,
      fill,
      stroke: null,
      shadow: null,
      glow: null,
      x: W / 2,
      y: cy + dy,
      ...rest,
    });
    if (da)
      // the ultimate keeps its own look: italic, dark red, a red outline (and a red glow, lueur)
      out.push(
        text('#7a001c', {
          stroke: { color: '#d0132f', width: s * 0.07 },
          glow: o.lueur ? { color: 'rgba(255,40,30,.9)', blur: s * 0.4 } : null,
        }),
      );
    else if (pt) {
      const C = styleOf(a.styles, l.c),
        pw = tw + s * 1.1,
        ph = s * 1.18;
      out.push({
        kind: 'pill',
        group,
        x: W / 2 - pw / 2,
        y: cy - ph / 2,
        w: pw,
        h: ph,
        fill: solid(a.styles, l.c, 'pill'),
        shadow: { dy: s * 0.06 },
        border: C.border ? { color: C.border.split(' ').pop()!, width: s * 0.05 } : null,
      });
      // a clean text on the pill: no outline
      out.push(text(C.color, {}, s * 0.04));
    } else
      out.push(
        text(solid(a.styles, l.c, 'text'), {
          stroke: { color: '#0b0b0f', width: s * 0.2 },
          shadow: { alpha: 0.6, blur: s * 0.18, dy: s * 0.05 },
        }),
      );
    y += th;
    if (dl.length) {
      let yy = y + ds * 0.3 + ds * 0.59;
      for (const t of dl) {
        out.push({
          kind: 'text',
          group,
          role: 'detail',
          text: t,
          font: dfont(ds),
          fill: '#ffffff',
          stroke: { color: 'rgba(8,8,12,.95)', width: ds * 0.2 },
          shadow: null,
          glow: null,
          x: W / 2,
          y: yy,
        });
        yy += ds * 1.18;
      }
      y += dh;
    }
    y += gap;
  }
}

/** The whole face, at the frames' size (composeur.js: rendre, with the numbers). */
export function standardLayout(a: LayoutArgs): Layout {
  const o: Compo = { ...DEFAULT_COMPO, ...stripNull(a.compo) };
  const { card } = a;
  const layers: Layer[] = [],
    zones: Zone[] = [];
  layers.push({ kind: 'background', group: 'base', colour: '#14141c' });
  // the drawing covers the card, zoomed and moved by the settings
  if (a.drawing && a.drawing.width > 0 && a.drawing.height > 0) {
    const s = Math.max(W / a.drawing.width, H / a.drawing.height) * o.z,
      w = a.drawing.width * s * (o.sx || 1),
      h = a.drawing.height * s * (o.sy || 1);
    layers.push({
      kind: 'drawing',
      group: 'drawing',
      x: (W - w) / 2 + o.x * W,
      y: (H - h) / 2 + o.y * H,
      w,
      h,
    });
  } else layers.push({ kind: 'drawing', group: 'drawing', x: 0, y: 0, w: W, h: H });
  layers.push({ kind: 'slot', group: 'underFrame' });
  const fighter = card.type === 'combattant',
    L = plaqueLinesOf(card, o);
  // a fighter's plaque goes under the frame; without effect, no plaque
  if (fighter && L.length) plaque(layers, zones, card.tier, L, o, a);
  layers.push({
    kind: 'frame',
    group: 'frame',
    candidates: [
      `cadres/${card.type}-${card.tier}.png`,
      ...['legendaire', 'epique', 'rare', 'commun'].map((r) => `cadres/${card.type}-${r}.png`),
      `cadres/combattant-${card.tier}.png`,
    ],
  });
  // magic, trap: no plaque (the charter), the text goes in the frame's free zone, under the drawing
  if (!fighter && L.length)
    plaque(layers, zones, card.type === 'piege' ? 'piege' : 'magie', L, o, a);
  if (fighter) {
    const num = (
      v: number | string | null | undefined,
      cx: number,
      fill: string,
      role: 'atq' | 'pv',
    ) => {
      if (v === null || v === undefined || v === '') return;
      const s = 150;
      layers.push({
        kind: 'text',
        group: 'stats',
        role,
        text: String(v),
        font: { family: ['Arial Black', 'sans-serif'], size: s, weight: 900, italic: false },
        fill,
        stroke: { color: '#ffffff', width: s * 0.16 },
        shadow: null,
        glow: null,
        x: cx,
        y: H * 0.925,
      });
    };
    num(card.atq, W * 0.13, '#e0303c', 'atq');
    num(card.pv, W * 0.87, '#4747d6', 'pv');
  }
  layers.push({ kind: 'slot', group: 'overFrame' });
  return { width: W, height: H, layers, zones };
}

// the stored settings may hold nulls for "default"
function stripNull(c: Partial<Compo> | null | undefined): Partial<Compo> {
  const out: Partial<Compo> = {};
  if (!c) return out;
  for (const [key, v] of Object.entries(c))
    if (v !== null && v !== undefined) Object.assign(out, { [key]: v });
  // textes / dtextes may be null on purpose (automatic lines): kept as null
  if ('textes' in c) out.textes = c.textes ?? null;
  if ('dtextes' in c) out.dtextes = c.dtextes ?? null;
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Frame sets: the frames a card is drawn in. One for now, the standard frames of assets/cadres.

export type FrameSet = {
  name: string;
  label: string;
  width: number;
  height: number;
  tiers: readonly Tier[];
  layout: (a: LayoutArgs) => Layout;
};

export const FRAME_SETS = {
  standard: {
    name: 'standard',
    label: 'Standard',
    width: W,
    height: H,
    tiers: TIERS,
    layout: standardLayout,
  },
} as const satisfies Record<string, FrameSet>;

export type FrameSetName = keyof typeof FRAME_SETS;

export const isFrameSetName = (v: unknown): v is FrameSetName =>
  typeof v === 'string' && Object.hasOwn(FRAME_SETS, v);

/** The frame set a card is drawn in: its own when it has frames for the card's tier, else standard. */
export function frameSetFor(frames: FrameSetName | null | undefined, tier: Tier): FrameSetName {
  if (
    frames &&
    isFrameSetName(frames) &&
    (FRAME_SETS[frames].tiers as readonly Tier[]).includes(tier)
  )
    return frames;
  return 'standard';
}
