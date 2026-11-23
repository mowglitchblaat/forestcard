// A flat fighter's ATQ and PV, live: the legacy overlay's numbers over a card shown by its image
// (combat.html: .sv, styleChiffres). A flat card has its numbers printed in its image and cannot change
// them (card.ts, setStat), so these are laid over its face:
//   plain    the version's « image pour le combat » (image_combat, without numbers): ATQ in red at the
//            bottom left, PV in blue at the bottom right;
//   or, violet  an alternative version whose numbers are printed (chiffres_cartes, 66-chiffres-
//            versions.sql): a metal medallion covers each printed number, the live one sits on it;
//   seazer   the Seazer frame's diamonds (with its combat image only): white numbers.
// A number that changes swells for a moment (the legacy's .pls). The ATQ turns orange under a rage and
// gold under a doubled attack (b-rage, b-x2).

import { Container, FillGradient, Sprite, Text, Texture } from 'pixi.js';
import { H, W } from '@forestcard/layout';
import { tween } from '../engine/time.ts';

export type NumbersStyle = 'plain' | 'or' | 'violet' | 'seazer';
export const isNumbersStyle = (v: unknown): v is NumbersStyle =>
  v === 'plain' || v === 'or' || v === 'violet' || v === 'seazer';

// combat.html, CHIF_PLACE: centres (fractions of the card), medallion diameter and text size (of its width)
const PLACE = {
  or: { l: 0.152, r: 0.85, y: 0.882, d: 0.15, s: 0.115 },
  violet: { l: 0.152, r: 0.85, y: 0.882, d: 0.15, s: 0.115 },
  seazer: { l: 0.15, r: 0.85, y: 0.9, d: 0, s: 0.1 },
} as const;

// the medallion: combat.html's radial-gradient, drawn once per colour
const medallions = new Map<string, Texture>();
function medallion(style: 'or' | 'violet'): Texture {
  const hit = medallions.get(style);
  if (hit) return hit;
  const S = 256,
    cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d')!,
    g = x.createRadialGradient(S / 2, S * 0.38, 0, S / 2, S / 2, S / 2);
  const stops: readonly (readonly [number, string])[] =
    style === 'or'
      ? [
          [0, '#6b4a10'],
          [0.62, '#3a2604'],
          [0.8, '#8a6414'],
          [0.92, '#f4d27a'],
          [1, '#7a560e'],
        ]
      : [
          [0, '#4c1a78'],
          [0.62, '#22083d'],
          [0.8, '#7a2fbf'],
          [0.92, '#e6b8ff'],
          [1, '#5b1d92'],
        ];
  for (const [o, c] of stops) g.addColorStop(o, c);
  x.fillStyle = g;
  x.beginPath();
  x.arc(S / 2, S / 2, S / 2, 0, 7);
  x.fill();
  const t = Texture.from(cv);
  medallions.set(style, t);
  return t;
}

function metal(style: 'or' | 'violet'): FillGradient {
  const stops =
    style === 'or'
      ? ['#ffffff', '#fff1b8', '#ffd24a', '#f0a91a', '#fff3c2']
      : ['#ffffff', '#fbe3ff', '#e39bff', '#b65cf0', '#fbe9ff'];
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    textureSpace: 'local',
    colorStops: [0, 0.3, 0.55, 0.72, 1].map((offset, i) => ({ offset, color: stops[i]! })),
  });
}

export type LiveNumbers = {
  set(atq: number, pv: number, boost: 'rage' | 'x2' | null): void;
  destroy(): void;
};

/** The live numbers of a flat card, on its face (`front`, card units: W x H). */
export function liveNumbers(front: Container, style: NumbersStyle): LiveNumbers {
  const root = new Container({ label: 'live-numbers' });
  front.addChild(root);
  const plain = style === 'plain';
  const P = plain ? null : PLACE[style];
  const size = plain ? 0.1636 * W : P!.s * W;
  const make = (which: 'atq' | 'pv'): Text => {
    const t = new Text({
      text: '',
      resolution: 1,
      style: plain
        ? {
            fontFamily: ['Arial Black', 'sans-serif'],
            fontWeight: '900',
            fontSize: size,
            fill: which === 'atq' ? 0xe0303c : 0x4747d6,
            dropShadow: { color: 0xffffff, blur: W * 0.016, distance: 0, alpha: 1 },
          }
        : style === 'seazer'
          ? {
              fontFamily: ['Arial Black', 'sans-serif'],
              fontWeight: '900',
              fontSize: size,
              fill: 0xffffff,
              dropShadow: { color: 0x000000, blur: W * 0.01, distance: 0, alpha: 0.8 },
            }
          : {
              fontFamily: ['Cinzel', 'Cinzel Decorative', 'Georgia', 'serif'],
              fontWeight: '900',
              fontSize: size,
              fill: metal(style),
              stroke: { color: style === 'or' ? 0x7a4e05 : 0x4a1475, width: W * 0.004 },
              dropShadow: { color: 0x000000, blur: W * 0.006, distance: W * 0.003, alpha: 0.9 },
            },
    });
    if (plain) {
      // combat.html: 5 % from the side, 1.5 % from the bottom
      t.anchor.set(which === 'atq' ? 0 : 1, 1);
      t.position.set(which === 'atq' ? W * 0.05 : W * 0.95, H * 0.985);
    } else {
      t.anchor.set(0.5);
      t.position.set((which === 'atq' ? P!.l : P!.r) * W, P!.y * H);
    }
    return t;
  };
  if (!plain && P!.d && (style === 'or' || style === 'violet'))
    for (const cx of [P!.l, P!.r]) {
      const m = new Sprite({ texture: medallion(style), anchor: 0.5 });
      m.width = m.height = P!.d * W;
      m.position.set(cx * W, P!.y * H);
      root.addChild(m);
    }
  const atq = make('atq'),
    pv = make('pv');
  root.addChild(atq, pv);
  const swell = (t: Text) =>
    void tween(
      500,
      (u) => t.scale.set(1 + 0.4 * Math.sin(Math.PI * Math.min(1, u / 0.8))),
      'linear',
      t,
    );
  const write = (t: Text, v: string) => {
    if (t.text === v) return;
    const was = t.text;
    t.text = v;
    if (was !== '') swell(t);
  };
  return {
    set(a, p, boost) {
      write(atq, String(Math.max(0, a)));
      write(pv, String(Math.max(0, p)));
      if (plain)
        atq.style.fill = boost === 'rage' ? 0xff4a24 : boost === 'x2' ? 0xffd23f : 0xe0303c;
    },
    destroy() {
      root.destroy({ children: true });
    },
  };
}
