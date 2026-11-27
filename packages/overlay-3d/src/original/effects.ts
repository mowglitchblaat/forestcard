// The legacy overlay's effects whose look is the author's, ported from apps/overlay-combat/src/combat.html
// nearly line for line (same shapes, colours, timings, words): the fracture's bone, the execution's
// blades and its cut, the swallow (tongue, belly, teeth, spit), the parasitic link's tendril, the mist.
// What changed: a card is a Pixi card (its root and its face), found on screen by its box (boxOf); the
// DOM animations of a card (Element.animate) are tweens of its face; the SVGs are drawn by the browser
// into textures (svgTexture), so they look as they did.

import { Container, Graphics, Sprite, Text, Texture, type Application } from 'pixi.js';
import { H, W } from '@forestcard/layout';
import { glowTexture } from '../engine/textures.ts';
import { every, tween, wait, type Stoppable } from '../engine/time.ts';
import {
  boxOf,
  cl,
  ez,
  flot,
  nspr,
  orb,
  R,
  rr,
  svgTexture,
  type Box,
  type LegacyCanvas,
} from './fx.ts';
import { charmCast, charmHeld, skinContact, type Moment, type SkinKind } from './contact.ts';

/** What the legacy effects need of a card: its root (the scene moves it), its face, its box. */
export type LegacyCard = { root: Container; front: Container; box: { x: number; w: number } };

const K = (c: LegacyCard): Box => boxOf(c.front);

// ---- moving a card's face like the legacy's Element.animate ------------------------------------------

type Pose = {
  x?: number;
  y?: number;
  sx?: number;
  sy?: number;
  s?: number;
  rot?: number;
  a?: number;
  o?: number;
};
/**
 * Plays keyframes on a card's face (offsets in screen pixels, rotation in degrees, around its centre),
 * then puts it back. `o` of a keyframe: its offset in 0..1 (evenly spread when omitted).
 */
// A face's pose before its first running animation: two animations at once (a breath's jolt during
// another) start from it and the last one to end puts it back. Captured from a face already moved, the
// second would add half a card to its position, and the face would jump aside while it ran.
type Base = {
  px: number;
  py: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  r: number;
  a: number;
};
const running = new WeakMap<Container, { base: Base; n: number }>();

async function animate(card: LegacyCard, frames: Pose[], ms: number, keep = false): Promise<void> {
  const f = card.front;
  const k = card.root.worldTransform.a || 1; // screen pixels per card unit
  let run = running.get(f);
  if (!run) {
    run = {
      base: {
        px: f.pivot.x,
        py: f.pivot.y,
        x: f.x,
        y: f.y,
        sx: f.scale.x,
        sy: f.scale.y,
        r: f.rotation,
        a: f.alpha,
      },
      n: 0,
    };
    running.set(f, run);
  }
  run.n++;
  const base = run.base;
  // around its centre from now on: the position follows in the same frame, or the face would show for
  // one frame half a card up and to the left (a tween moves it only from the next frame on)
  f.pivot.set(W / 2, H / 2);
  f.position.set(base.x + W / 2, base.y + H / 2);
  const at = frames.map((p, i) => p.o ?? i / (frames.length - 1));
  const val = (p: Pose, key: keyof Pose, d: number) => (p[key] ?? (key === 's' ? 1 : d)) as number;
  try {
    await tween(
      ms,
      (u) => {
        let i = 0;
        while (i < frames.length - 2 && u > at[i + 1]!) i++;
        const a = frames[i]!,
          b = frames[i + 1]!,
          v = cl((u - at[i]!) / Math.max(1e-6, at[i + 1]! - at[i]!));
        const L = (key: keyof Pose, d: number) =>
          val(a, key, d) + (val(b, key, d) - val(a, key, d)) * v;
        const s = L('s', 1);
        f.position.set(base.x + W / 2 + L('x', 0) / k, base.y + H / 2 + L('y', 0) / k);
        f.scale.set(base.sx * s * L('sx', 1), base.sy * s * L('sy', 1));
        f.rotation = base.r + (L('rot', 0) * Math.PI) / 180;
        f.alpha = base.a * L('a', 1);
      },
      'linear',
      f,
    );
  } finally {
    run.n--;
  }
  if (run.n > 0) return;
  running.delete(f);
  if (!keep) {
    f.pivot.set(base.px, base.py);
    f.position.set(base.x, base.y);
    f.scale.set(base.sx, base.sy);
    f.rotation = base.r;
    f.alpha = base.a;
  }
}
const nudge = (c: LegacyCard, a: [number, number], b: [number, number], ms: number) =>
  animate(c, [{}, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }, {}], ms);

// a card's face as a canvas (the legacy's texCarte), for its halves and its belly picture
// Drawn without the face's filters (a status's shader): rendered off screen, a filter reading screen
// positions came out empty, and a poisoned card broke into blank shards.
function faceCanvas(app: Application, c: LegacyCard): HTMLCanvasElement {
  const off: [Container, Container['filters'], Container['filterArea']][] = [];
  const strip = (o: Container) => {
    if (o.filters) {
      off.push([o, o.filters, o.filterArea]);
      o.filters = null;
      o.filterArea = undefined;
    }
    for (const ch of o.children) strip(ch);
  };
  strip(c.front);
  try {
    return app.renderer.extract.canvas({ target: c.front, resolution: 1 }) as HTMLCanvasElement;
  } finally {
    for (const [o, filters, area] of off) {
      o.filters = filters ? [...filters] : null;
      o.filterArea = area;
    }
  }
}

export type LegacyEffects = ReturnType<typeof legacyEffects>;

export function legacyEffects(app: Application, fx: LegacyCanvas) {
  const vh = () => fx.vh;

  // ════════ FRACTURE: a bone tenses, trembles, then breaks in two ════════
  function os(c: LegacyCard): Promise<void> {
    const k = K(c),
      L = k.w * 0.62,
      r = k.w * 0.075,
      Sh = Array.from({ length: 8 }, () => ({ a: R(0, 6.28), v: R(0.4, 1), s: R(0.012, 0.03) }));
    function demi(
      x: CanvasRenderingContext2D,
      sd: number,
      off: number,
      rot: number,
      dy: number,
      a: number,
    ) {
      x.save();
      x.translate(k.cx + sd * off, k.cy + dy);
      x.rotate(rot * sd);
      x.globalAlpha = a;
      const e = (sd * L) / 2;
      x.fillStyle = '#f4ecd6';
      x.strokeStyle = '#8c7b55';
      x.lineWidth = Math.max(2, k.w * 0.012);
      x.shadowColor = 'rgba(0,0,0,.55)';
      x.shadowBlur = 8;
      for (const q of [-1, 1]) {
        x.beginPath();
        x.arc(e, q * r * 0.55, r * 0.62, 0, 7);
        x.fill();
        x.stroke();
      }
      x.beginPath();
      x.moveTo(0, -r * 0.5);
      x.lineTo(sd * r * 0.38, -r * 0.18);
      x.lineTo(sd * r * 0.06, r * 0.08);
      x.lineTo(sd * r * 0.42, r * 0.5);
      x.lineTo(e, r * 0.5);
      x.lineTo(e, -r * 0.5);
      x.closePath();
      x.fill();
      x.shadowBlur = 0;
      x.beginPath();
      x.moveTo(e, -r * 0.5);
      x.lineTo(0, -r * 0.5);
      x.lineTo(sd * r * 0.38, -r * 0.18);
      x.lineTo(sd * r * 0.06, r * 0.08);
      x.lineTo(sd * r * 0.42, r * 0.5);
      x.lineTo(e, r * 0.5);
      x.stroke();
      x.restore();
    }
    return fx.add(1.7, (x, t) => {
      const al = cl(t / 0.12) * (1 - cl((t - 1.2) / 0.45));
      if (t < 0.6) {
        const j = cl(t / 0.6) * k.w * 0.012,
          tn = Math.sin(t * 60);
        x.save();
        x.translate(tn * j, Math.cos(t * 47) * j);
        demi(x, -1, 0, 0, 0, al);
        demi(x, 1, 0, 0, 0, al);
        x.restore();
        x.strokeStyle = `rgba(255,255,255,${0.7 * cl(t / 0.6)})`;
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(k.cx - r * 0.2, k.cy - r * 0.7);
        x.lineTo(k.cx + r * 0.1, k.cy + r * 0.1);
        x.stroke();
      } else {
        const q = cl((t - 0.6) / 0.55),
          e = ez(q);
        x.globalCompositeOperation = 'lighter';
        orb(
          x,
          k.cx,
          k.cy,
          k.w * 0.5,
          `rgba(255,255,255,${0.7 * (1 - cl((t - 0.6) / 0.25))})`,
          'rgba(255,255,255,0)',
        );
        x.globalCompositeOperation = 'source-over';
        demi(x, -1, e * k.w * 0.1, e * 0.55, q * q * k.h * 0.12, al);
        demi(x, 1, e * k.w * 0.1, e * 0.55, q * q * k.h * 0.12, al);
        x.strokeStyle = `rgba(255,255,255,${0.8 * (1 - q)})`;
        x.lineWidth = 2.5;
        for (let i = 0; i < 8; i++) {
          const an = i * 0.785 + 0.2,
            r0 = k.w * 0.08 + e * k.w * 0.1;
          x.beginPath();
          x.moveTo(k.cx + Math.cos(an) * r0, k.cy + Math.sin(an) * r0);
          x.lineTo(
            k.cx + Math.cos(an) * (r0 + k.w * 0.09),
            k.cy + Math.sin(an) * (r0 + k.w * 0.09),
          );
          x.stroke();
        }
        for (const z of Sh) {
          const d = e * k.w * 0.4 * z.v;
          x.save();
          x.translate(k.cx + Math.cos(z.a) * d, k.cy + Math.sin(z.a) * d + q * q * k.h * 0.1);
          x.rotate(z.a + q * 5);
          x.fillStyle = `rgba(244,236,214,${al})`;
          x.beginPath();
          x.moveTo(0, -z.s * k.w);
          x.lineTo(z.s * k.w * 1.3, z.s * k.w);
          x.lineTo(-z.s * k.w, z.s * k.w * 0.6);
          x.closePath();
          x.fill();
          x.restore();
        }
      }
    });
  }

  // ════════ EXECUTION: each mark plants a blade (small, small, then a big one in the middle) ════════
  let lameN = 0;
  function svgLame(epee: boolean): string {
    const i = 'lm' + ++lameN;
    if (!epee)
      return `<svg viewBox="0 0 40 160" preserveAspectRatio="none"><defs>
 <linearGradient id="${i}a" x1="0" x2="1"><stop offset="0" stop-color="#050508"/><stop offset=".45" stop-color="#3a3644"/><stop offset=".55" stop-color="#16141c"/><stop offset="1" stop-color="#020203"/></linearGradient></defs>
 <path d="M12,7 L18,2 L22,6 L28,1 L27,40 C28,82 26,112 23,132 L20,160 L17,132 C14,112 12,82 13,40 Z" fill="url(#${i}a)" stroke="#000" stroke-width=".8"/>
 <path d="M20,8 L20,150" stroke="rgba(255,50,70,.55)" stroke-width=".9"/><path d="M27,40 C28,82 26,112 23,132 L20,160" fill="none" stroke="rgba(255,70,80,.75)" stroke-width=".7"/></svg>`;
    return `<svg viewBox="0 0 40 160" preserveAspectRatio="none"><defs>
 <linearGradient id="${i}a" x1="0" x2="1"><stop offset="0" stop-color="#060609"/><stop offset=".45" stop-color="#3c3846"/><stop offset=".55" stop-color="#17151d"/><stop offset="1" stop-color="#030304"/></linearGradient>
 <linearGradient id="${i}o" x1="0" x2="1"><stop offset="0" stop-color="#0d0c10"/><stop offset=".5" stop-color="#4a4452"/><stop offset="1" stop-color="#0d0c10"/></linearGradient></defs>
 <path d="M14,43 L26,43 L24.5,128 L20,159 L15.5,128 Z" fill="url(#${i}a)" stroke="#000" stroke-width=".8"/>
 <path d="M20,47 L20,150" stroke="rgba(255,50,70,.6)" stroke-width="1.1"/>
 <rect x="16" y="9" width="8" height="27" rx="2" fill="#09080b"/><path d="M16,14 L24,18 M16,20 L24,24 M16,26 L24,30" stroke="#3a2a30" stroke-width="1.3"/>
 <circle cx="20" cy="6" r="5" fill="url(#${i}o)" stroke="#000" stroke-width=".8"/>
 <path d="M1,36 Q20,30 39,36 L37,43 Q20,39 3,43 Z" fill="url(#${i}o)" stroke="#000" stroke-width=".8"/><circle cx="20" cy="38.5" r="3.2" fill="#b0102a" stroke="#ff4d5e" stroke-width=".6"/></svg>`;
  }
  // the blades on each card: their layer (on the card, under its marks), and each blade
  type Lame = { holder: Container; n: number; loop: Stoppable };
  const lames = new WeakMap<Container, Map<number, Lame>>();
  const lamesOf = (c: LegacyCard) => {
    let m = lames.get(c.root);
    if (!m) lames.set(c.root, (m = new Map()));
    return m;
  };
  // .lame.l1 {left 4%; top -16%; width 19%; height 44%} .l2 {right 4%} .l3 {left 34%; top -34%; width 32%; height 90%}
  const LAME_BOX = {
    1: [0.04, -0.16, 0.19, 0.44],
    2: [0.77, -0.16, 0.19, 0.44],
    3: [0.34, -0.34, 0.32, 0.9],
  } as const;

  async function lameIn(c: LegacyCard, n: number): Promise<void> {
    const m = lamesOf(c);
    const slot = Math.min(3, n) as 1 | 2 | 3;
    if (m.has(slot)) return;
    const big = slot >= 3,
      deg = slot === 1 ? -24 : slot === 2 ? 24 : 0;
    const [lx, ty, lw, lh] = LAME_BOX[slot];
    const bw = c.box.w,
      bx = c.box.x;
    const w = lw * bw,
      h = lh * H;
    const holder = new Container({ label: 'lame' });
    // transform-origin 50% 100%: the point at the bottom
    holder.position.set(bx + (lx + lw / 2) * bw, (ty + lh) * H);
    holder.rotation = (deg * Math.PI) / 180;
    // its red pulse (@keyframes lp) and the red pool under its point (::after)
    const glow = new Sprite({ texture: glowTexture(), anchor: 0.5, tint: 0xff2832 });
    glow.position.set(0, -h / 2);
    glow.width = w * 2.2;
    glow.height = h * 1.15;
    glow.blendMode = 'add';
    const pool = new Sprite({ texture: glowTexture(), anchor: 0.5, tint: 0xff2832 });
    pool.position.set(0, h * 0.06 - h * 0.07);
    pool.width = w * 0.7;
    pool.height = h * 0.14;
    pool.alpha = 0.85;
    pool.blendMode = 'add';
    const blade = new Sprite({
      texture: await svgTexture(svgLame(big), 80, 320),
      anchor: { x: 0.5, y: 1 },
    });
    blade.width = w;
    blade.height = h;
    holder.addChild(glow, blade, pool);
    if (c.root.destroyed) return;
    // over the face, under the marks (the marks' layer is the root's last child but one: the legacy z 4-5)
    c.root.addChildAt(holder, Math.min(c.root.children.length, c.root.getChildIndex(c.front) + 1));
    const loop = every(holder, (_dt, t) => {
      const p = 0.5 - 0.5 * Math.cos((t * Math.PI) / 1.1); // 1.1 s, alternate
      glow.alpha = 0.25 + 0.55 * p;
    });
    m.set(slot, { holder, n: slot, loop });
    // in: from above (-140 % of its height, -170 % for the sword), turned, then planted
    const from = big ? -1.7 : -1.4,
      dur = big ? 620 : 420;
    const x0 = holder.x,
      y0 = holder.y;
    await tween(
      dur,
      (u) => {
        let ty2: number, rot: number, s: number;
        if (u < 0.82) {
          const v = u / 0.82;
          ty2 = from + (0.04 - from) * v;
          rot = deg * 1.8 + (deg - deg * 1.8) * v;
          s = (big ? 1.25 : 1.1) + (1 - (big ? 1.25 : 1.1)) * v;
        } else {
          const v = (u - 0.82) / 0.18;
          ty2 = 0.04 * (1 - v);
          rot = deg;
          s = 1;
        }
        holder.position.set(x0 - Math.sin(holder.rotation) * ty2 * h * 0, y0 + ty2 * h);
        holder.rotation = (rot * Math.PI) / 180;
        holder.scale.set(s);
        holder.alpha = cl(u / 0.35);
      },
      'in-2',
      holder,
    );
    // planted: the card jolts, a red flash and sparks where it went in (the big one cracks the card)
    const k = K(c),
      tx = k.cx + (slot === 1 ? -k.w * 0.28 : slot === 2 ? k.w * 0.28 : 0),
      tyy = k.y + k.h * (big ? 0.56 : 0.28),
      Sp = Array.from({ length: big ? 26 : 12 }, () => ({
        a: R(-3.1, 0),
        v: R(0.3, 1),
        s: R(1.5, 3.5),
      }));
    void nudge(c, [big ? -9 : -4, big ? 6 : 3], [big ? 8 : 3, big ? -4 : -2], big ? 320 : 200);
    void fx.add(big ? 1.1 : 0.7, (x, t, u) => {
      const al = 1 - u;
      x.globalCompositeOperation = 'lighter';
      orb(
        x,
        tx,
        tyy,
        k.w * (big ? 0.5 : 0.22) * (0.4 + 0.6 * ez(cl(t / 0.2))),
        `rgba(255,60,60,${0.55 * al})`,
        'rgba(255,0,0,0)',
      );
      x.globalCompositeOperation = 'source-over';
      for (const p of Sp) {
        const dd = ez(cl(t / 0.5)) * k.w * (big ? 0.45 : 0.25) * p.v;
        x.fillStyle = `rgba(255,${(180 - u * 150) | 0},120,${al})`;
        x.beginPath();
        x.arc(
          tx + Math.cos(p.a) * dd,
          tyy + Math.sin(p.a) * dd + u * u * k.h * 0.1,
          p.s * (1 - u * 0.6),
          0,
          7,
        );
        x.fill();
      }
      if (big) {
        x.save();
        x.strokeStyle = `rgba(40,0,0,${0.8 * al})`;
        x.lineWidth = Math.max(1.5, k.w * 0.008);
        x.beginPath();
        for (let i = 0; i < 6; i++) {
          const an = i * 1.05 + 0.4,
            Lx = k.w * 0.32 * ez(cl(t / 0.25));
          x.moveTo(tx, tyy);
          x.lineTo(tx + Math.cos(an) * Lx, tyy + Math.sin(an) * Lx * 0.8);
        }
        x.stroke();
        x.restore();
      }
    });
  }

  /** The blades above `n` go (a mark taken away), all at 0. */
  function lamesOff(c: LegacyCard, keep = 0): void {
    const m = lamesOf(c);
    for (const [slot, l] of [...m]) {
      if (slot <= keep) continue;
      m.delete(slot);
      void tween(400, (u) => void (l.holder.alpha = 1 - u), 'linear', l.holder).finally(() => {
        l.loop.stop();
        if (!l.holder.destroyed) l.holder.destroy({ children: true });
      });
    }
  }

  // the cut, in fractions of the card (the same as the execution's slash)
  const COUPE = { a: [-0.15, 0.12], b: [1.15, 0.88] } as const;
  // the two halves at q (0: whole card, 1: halves fallen); edge: the colour of the cut's edge, or null
  function moities(
    x: CanvasRenderingContext2D,
    k: Box,
    tex: CanvasImageSource,
    q: number,
    al: number,
    edge: string | null,
  ) {
    const P0 = [k.x + COUPE.a[0] * k.w, k.y + COUPE.a[1] * k.h],
      P1 = [k.x + COUPE.b[0] * k.w, k.y + COUPE.b[1] * k.h],
      L = Math.hypot(P1[0]! - P0[0]!, P1[1]! - P0[1]!),
      d = [(P1[0]! - P0[0]!) / L, (P1[1]! - P0[1]!) / L],
      n = [-d[1]!, d[0]!],
      F = k.w * 3;
    const mx = (P0[0]! + P1[0]!) / 2,
      my = (P0[1]! + P1[1]!) / 2,
      gap = k.w * 0.05 * ez(cl(q / 0.2)),
      fall = q * q;
    for (const sd of [-1, 1]) {
      const haut = sd < 0,
        ox = sd * n[0]! * gap + (haut ? d[0]! * k.w * 0.3 * fall : -k.w * 0.06 * q),
        oy = sd * n[1]! * gap + (haut ? d[1]! * k.w * 0.3 * fall : 0) + k.h * 0.35 * fall,
        rot = (haut ? 0.38 : -0.22) * fall;
      x.save();
      x.globalAlpha = al;
      x.translate(mx + ox, my + oy);
      x.rotate(rot);
      x.translate(-mx, -my);
      x.beginPath();
      x.moveTo(P0[0]! - d[0]! * F, P0[1]! - d[1]! * F);
      x.lineTo(P1[0]! + d[0]! * F, P1[1]! + d[1]! * F);
      x.lineTo(P1[0]! + d[0]! * F + sd * n[0]! * F, P1[1]! + d[1]! * F + sd * n[1]! * F);
      x.lineTo(P0[0]! - d[0]! * F + sd * n[0]! * F, P0[1]! - d[1]! * F + sd * n[1]! * F);
      x.closePath();
      x.clip();
      rr(x, k.x, k.y, k.w, k.h, 12);
      x.clip();
      x.drawImage(tex, k.x, k.y, k.w, k.h);
      if (edge) {
        x.lineCap = 'round';
        x.shadowColor = edge;
        x.shadowBlur = 18;
        x.strokeStyle = edge;
        x.lineWidth = Math.max(2, k.w * 0.014);
        x.beginPath();
        x.moveTo(P0[0]!, P0[1]!);
        x.lineTo(P1[0]!, P1[1]!);
        x.stroke();
      }
      x.restore();
    }
  }
  // the cut cards: their face (the halves are drawn from it), and whether they lie cut
  const cutFace = new WeakMap<Container, { tex: HTMLCanvasElement; box: Box }>();
  const isCut = (c: LegacyCard): boolean => cutFace.has(c.root);

  function coupeFx(c: LegacyCard, k = K(c)): void {
    const tex = faceCanvas(app, c);
    cutFace.set(c.root, { tex, box: k });
    c.root.visible = false;
    void fx.add(1.9, (x, t) => {
      const q = cl((t - 0.15) / 1.4),
        al = 1 - cl((t - 1.3) / 0.6);
      moities(
        x,
        k,
        tex,
        q,
        al,
        `rgba(255,${60 + Math.round(140 * (1 - cl(t / 0.9)))},60,${(1 - cl(t / 1.1)) * al})`,
      );
    });
  }

  async function executionFx(c: LegacyCard): Promise<void> {
    const k = K(c);
    await Promise.all([1, 2, 3].map((n) => lameIn(c, n)));
    await wait(80);
    for (const l of lamesOf(c).values()) {
      const y0 = l.holder.y,
        h = (l.n >= 3 ? 0.9 : 0.44) * H;
      void tween(260, (u) => void (l.holder.y = y0 + 0.14 * h * u), 'in-2', l.holder);
    }
    void fx.add(1.5, (x, t, u) => {
      const e = ez(cl(t / 0.22)),
        al = 1 - cl((t - 0.35) / 1.1);
      x.fillStyle = `rgba(150,0,10,${0.35 * al})`;
      x.fillRect(k.x - k.w * 0.4, k.y - k.h * 0.2, k.w * 1.8, k.h * 1.4);
      const x0 = k.x - k.w * 0.15,
        y0 = k.y + k.h * 0.12,
        x1 = k.x + k.w * 1.15,
        y1 = k.y + k.h * 0.88,
        xm = x0 + (x1 - x0) * e,
        ym = y0 + (y1 - y0) * e;
      x.save();
      x.lineCap = 'round';
      x.shadowColor = 'rgba(255,30,40,1)';
      x.shadowBlur = 30;
      x.strokeStyle = `rgba(220,20,30,${al})`;
      x.lineWidth = k.w * 0.07 * (1 - u * 0.5);
      x.beginPath();
      x.moveTo(x0, y0);
      x.lineTo(xm, ym);
      x.stroke();
      x.shadowBlur = 0;
      x.strokeStyle = `rgba(255,240,240,${al})`;
      x.lineWidth = k.w * 0.018;
      x.beginPath();
      x.moveTo(x0, y0);
      x.lineTo(xm, ym);
      x.stroke();
      x.restore();
    });
    void nudge(c, [-10, 5], [8, -4], 240);
    await wait(250);
    lamesOff(c);
    coupeFx(c, k); // the blade has gone through: the card is cut along the slash
    await wait(450);
    flot(fx, k, 'EXÉCUTÉ !', '#ef4444', true);
    await wait(1000);
  }

  /** A cut card brought back: the halves rise and weld along the cut in a green-gold halo. */
  async function reformeCoupe(c: LegacyCard): Promise<void> {
    const cut = cutFace.get(c.root);
    if (!cut) return;
    const k = cut.box,
      tex = cut.tex;
    setTimeout(() => {
      c.root.visible = true;
      cutFace.delete(c.root);
    }, 1550);
    await fx.add(2.1, (x, t) => {
      x.globalCompositeOperation = 'lighter';
      orb(
        x,
        k.cx,
        k.cy,
        k.h * 0.7,
        `rgba(140,255,170,${0.45 * Math.sin(Math.PI * cl(t / 2.1))})`,
        'rgba(60,200,120,0)',
      );
      x.globalCompositeOperation = 'source-over';
      if (t < 1.55) {
        const p = cl(t / 1.3),
          q = 1 - ez(p);
        moities(
          x,
          k,
          tex,
          q,
          Math.min(1, p * 2.5),
          p > 0.75 ? `rgba(190,255,200,${(1 - cl((p - 0.75) / 0.25)) * 0.9 + 0.1})` : null,
        );
      }
      if (t > 1.4) {
        const u = cl((t - 1.4) / 0.65);
        x.globalCompositeOperation = 'lighter';
        orb(
          x,
          k.cx,
          k.cy,
          k.w * (0.35 + 0.8 * u),
          `rgba(255,255,215,${0.8 * (1 - u)})`,
          'rgba(150,255,170,0)',
        );
        x.strokeStyle = `rgba(190,255,200,${1 - u})`;
        x.lineWidth = 6;
        x.beginPath();
        x.arc(k.cx, k.cy, k.w * 0.7 * u, 0, 7);
        x.stroke();
      }
    });
  }

  /** A trap cut by an execution: the red blade goes through it, then it falls in two halves. */
  async function trancher(c: LegacyCard): Promise<void> {
    const k = K(c),
      tex = faceCanvas(app, c);
    void fx.add(0.7, (x, t) => {
      const e = ez(cl(t / 0.22)),
        al = 1 - cl((t - 0.3) / 0.4),
        x0 = k.x + COUPE.a[0] * k.w,
        y0 = k.y + COUPE.a[1] * k.h,
        x1 = k.x + COUPE.b[0] * k.w,
        y1 = k.y + COUPE.b[1] * k.h,
        xm = x0 + (x1 - x0) * e,
        ym = y0 + (y1 - y0) * e;
      x.save();
      x.lineCap = 'round';
      x.shadowColor = 'rgba(255,30,40,1)';
      x.shadowBlur = 24;
      x.strokeStyle = `rgba(220,20,30,${al})`;
      x.lineWidth = k.w * 0.09;
      x.beginPath();
      x.moveTo(x0, y0);
      x.lineTo(xm, ym);
      x.stroke();
      x.shadowBlur = 0;
      x.strokeStyle = `rgba(255,240,240,${al})`;
      x.lineWidth = k.w * 0.025;
      x.beginPath();
      x.moveTo(x0, y0);
      x.lineTo(xm, ym);
      x.stroke();
      x.restore();
    });
    void nudge(c, [-5, 3], [4, -2], 200);
    await wait(220);
    c.root.visible = false;
    flot(fx, k, 'Piège tranché !', '#ef4444');
    await fx.add(1.9, (x, t) => {
      const q = cl((t - 0.1) / 1.4),
        al = 1 - cl((t - 1.3) / 0.6);
      moities(
        x,
        k,
        tex,
        q,
        al,
        `rgba(255,${60 + Math.round(140 * (1 - cl(t / 0.9)))},60,${(1 - cl(t / 1.1)) * al})`,
      );
    });
  }

  // ════════ SWALLOW: the tongue grabs the card, the belly, the teeth chew, then it spits it out ════════
  type Belly = { holder: Container; pts: Graphics; loop: Stoppable; victim: LegacyCard };
  const bellies = new WeakMap<Container, Belly>();

  async function avalerFx(a: LegacyCard, v: LegacyCard): Promise<void> {
    const Ka = K(a),
      Kv = K(v),
      dir = Kv.cx > Ka.cx ? 1 : -1;
    const O = { x: Ka.cx + dir * Ka.w * 0.16, y: Ka.y + Ka.h * 0.4 },
      T = { x: Kv.cx, y: Kv.cy },
      Wt = Math.max(10, Ka.w * 0.13),
      DUR = 2.3;
    void animate(
      a,
      [{}, { x: -dir * 10, s: 1.06, rot: -dir * 3, o: 0.6 }, { x: dir * 8, s: 1.02 }],
      420,
    );
    await wait(320);
    const tA = 0.3,
      tB = 0.42,
      tC = 0.78; // the tongue goes out · it sticks · it pulls the card back · gulp
    const pull = animate(
      v,
      [
        { o: 0 },
        { o: tB },
        { x: (T.x - O.x) * -0.08, y: -Kv.h * 0.06, rot: dir * 8, s: 1.04, o: tB + 0.05 },
        { x: O.x - T.x, y: O.y - T.y, rot: -dir * 220, s: 0.1, o: tC },
        { x: O.x - T.x, y: O.y - T.y, s: 0, a: 0, o: 1 },
      ],
      DUR * 1000,
      true,
    );
    const tip = (u: number) => {
      if (u < tA) {
        const k = u / tA,
          e = k < 0.7 ? Math.pow(k / 0.7, 0.6) * 1.06 : 1.06 - 0.06 * ((k - 0.7) / 0.3);
        return { x: O.x + (T.x - O.x) * e, y: O.y + (T.y - O.y) * e };
      }
      if (u < tB) return { x: T.x + Math.sin(u * 90) * 2, y: T.y };
      const k = Math.min(1, (u - tB) / (tC - tB)),
        e = k * k * (0.4 + 0.6 * k);
      return { x: T.x + (O.x - T.x) * e, y: T.y + (O.y - T.y) * e };
    };
    void fx.add(DUR, (x, t, u) => {
      if (u >= tC) return;
      const P = tip(u),
        dx = P.x - O.x,
        dy = P.y - O.y,
        dd = Math.hypot(dx, dy) || 1,
        nx = -dy / dd,
        ny = dx / dd;
      const ext = u < tA,
        amp = Wt * (ext ? 0.32 * (1 - u / tA) + 0.06 : u < tB ? 0.04 : 0.12),
        sag = dd * (ext ? 0.03 : 0.05),
        th = Wt * (ext ? 0.75 + (0.25 * u) / tA : 1),
        N = 28,
        pts: { x: number; y: number; w: number }[] = [];
      for (let i = 0; i <= N; i++) {
        const q = i / N,
          ondule = Math.sin(q * Math.PI * 3.2 - t * 34) * amp * Math.sin(Math.PI * q),
          tombe = sag * Math.sin(Math.PI * q);
        pts.push({
          x: O.x + dx * q + nx * ondule,
          y: O.y + dy * q + ny * ondule + tombe,
          w: th * (1 - 0.28 * q),
        });
      }
      x.save();
      x.lineCap = 'round';
      x.lineJoin = 'round';
      const trace = (col: string, ex: number, dyo = 0, fw = 1) => {
        x.strokeStyle = col;
        for (let i = 0; i < N; i++) {
          const p0 = pts[i]!,
            p1 = pts[i + 1]!;
          x.lineWidth = Math.max(1.5, p0.w * fw + ex);
          x.beginPath();
          x.moveTo(p0.x, p0.y + dyo * p0.w);
          x.lineTo(p1.x, p1.y + dyo * p1.w);
          x.stroke();
        }
      };
      trace('#5c0b24', 5);
      trace('#b0174a', 0);
      trace('#ec4f7d', 0, -0.08, 0.72);
      trace('#ff8fab', 0, -0.2, 0.32);
      trace('rgba(120,10,40,.5)', 0, 0.02, 0.1);
      trace('rgba(255,235,242,.9)', 0, -0.3, 0.1);
      const R0 = th * 1.05,
        E = pts[N]!,
        an = Math.atan2(dy, dx),
        plat = u >= tA && u < tB ? 1.35 : 1;
      x.translate(E.x, E.y);
      x.rotate(an);
      x.fillStyle = '#5c0b24';
      x.beginPath();
      x.ellipse(0, 0, (R0 + 3) / plat, (R0 * 0.9 + 3) * plat, 0, 0, 7);
      x.fill();
      const g2 = x.createRadialGradient(-R0 * 0.3, -R0 * 0.35, 1, 0, 0, R0 * plat);
      g2.addColorStop(0, '#ffc2d4');
      g2.addColorStop(0.45, '#f0567f');
      g2.addColorStop(1, '#a3123f');
      x.fillStyle = g2;
      x.beginPath();
      x.ellipse(0, 0, R0 / plat, R0 * 0.9 * plat, 0, 0, 7);
      x.fill();
      x.restore();
      if (u >= tA && u < tB + 0.06) {
        x.save();
        x.globalCompositeOperation = 'lighter';
        orb(
          x,
          T.x,
          T.y,
          Kv.w * 0.55,
          `rgba(255,120,170,${0.45 * (1 - (u - tA) / (tB + 0.06 - tA))})`,
          'rgba(255,0,80,0)',
        );
        x.restore();
      }
      if (u >= tB) {
        x.save();
        for (let i = 0; i < 5; i++) {
          const q = (t * 1.7 + i * 0.21) % 1,
            kk = Math.min(N, Math.round(q * N)),
            pp = pts[kk]!;
          x.fillStyle = `rgba(255,200,220,${0.7 * (1 - q)})`;
          x.beginPath();
          x.arc(pp.x, pp.y + pp.w * 0.7 + q * q * 20, Wt * 0.12 * (1 - q * 0.5), 0, 7);
          x.fill();
        }
        x.restore();
      }
    });
    await wait(DUR * tC * 1000);
    void animate(
      a,
      [
        {},
        { sx: 1.16, sy: 0.86, o: 0.25 },
        { sx: 0.93, sy: 1.08, o: 0.5 },
        { sx: 1.05, sy: 0.96, o: 0.75 },
        {},
      ],
      620,
    );
    flot(fx, Ka, 'GLOUPS !', '#f472b6', true);
    const Sp = Array.from({ length: 22 }, () => ({ a: R(-Math.PI, 0), v: R(0.4, 1), s: R(2, 5) }));
    void fx.add(0.9, (x, t, u) => {
      x.save();
      for (const p of Sp) {
        const dd = ez(cl(t / 0.5)) * Ka.w * 0.5 * p.v;
        x.fillStyle = `rgba(255,${190 + ((p.s * 10) | 0)},225,${1 - u})`;
        x.beginPath();
        x.arc(
          O.x + Math.cos(p.a) * dd,
          O.y + Math.sin(p.a) * dd + u * u * Ka.h * 0.25,
          p.s * (1 - u * 0.5),
          0,
          7,
        );
        x.fill();
      }
      x.restore();
    });
    await pull;
    // the swallowed card: put back in place, faint and grey (.avalee); its picture in the belly
    const f = v.front;
    f.pivot.set(0, 0);
    f.position.set(0, 0);
    f.scale.set(1);
    f.rotation = 0;
    f.alpha = 1;
    v.root.alpha = 0.2;
    await belly(a, v);
    await wait(350);
  }

  // the belly: the swallowed card's picture in a round window at the bottom of the swallower
  async function belly(a: LegacyCard, v: LegacyCard): Promise<void> {
    const old = bellies.get(a.root);
    if (old) {
      old.loop.stop();
      old.holder.destroy({ children: true });
    }
    const bw = a.box.w,
      d = 0.4 * bw;
    const holder = new Container({ label: 'ventre' });
    holder.position.set(a.box.x + bw / 2, H * 1.09 - d / 2);
    const pic = new Sprite(Texture.from(faceCanvas(app, v)));
    pic.anchor.set(0.5);
    const kk = Math.max(d / pic.texture.width, d / pic.texture.height);
    pic.scale.set(kk);
    const mask = new Graphics().circle(0, 0, d / 2).fill(0xffffff);
    pic.mask = mask;
    const px = bw / 200; // ~ the legacy's 3px border at its size
    const ring = new Graphics()
      .circle(0, 0, d / 2 + px * 3)
      .stroke({ color: 0x4a0d22, width: px * 3 })
      .circle(0, 0, d / 2)
      .stroke({ color: 0xf472b6, width: px * 3 });
    const glow = new Sprite({ texture: glowTexture(), anchor: 0.5, tint: 0xf472b6, alpha: 0.75 });
    glow.width = glow.height = d * 1.7;
    glow.blendMode = 'add';
    const shade = new Graphics().circle(0, 0, d / 2).fill({ color: 0x000000, alpha: 0.25 });
    const plate = new Text({ text: '🍽️', style: { fontSize: d * 0.32 }, anchor: 0.5 });
    plate.position.set(d / 2 + d * 0.02, -d / 2 + d * 0.04);
    const pts = new Graphics();
    pts.position.set(0, d / 2 + d * 0.24);
    holder.addChild(glow, pic, mask, shade, ring, plate, pts);
    a.root.addChild(holder);
    const loop = every(holder, (_dt, t) => {
      holder.scale.set(1 + 0.06 * (0.5 - 0.5 * Math.cos((t * Math.PI * 2) / 1.1))); // @keyframes vbat
    });
    bellies.set(a.root, { holder, pts, loop, victim: v });
    await tween(
      450,
      (u) => void holder.scale.set(u < 0.6 ? (1.25 * u) / 0.6 : 1.25 - 0.25 * ((u - 0.6) / 0.4)),
      'out-cubic',
      holder,
    );
  }

  function avPoints(a: LegacyCard, n: number, max: number): void {
    const b = bellies.get(a.root);
    if (!b) return;
    const d = 0.4 * a.box.w,
      r = d * 0.045,
      gap = r * 2 + d * 0.03;
    b.pts.clear();
    for (let i = 0; i < max; i++) {
      const cx = (i - (max - 1) / 2) * gap;
      b.pts
        .circle(cx, 0, r)
        .fill(i < n ? 0xf472b6 : 0x3b0b1c)
        .stroke({ color: 0xf9a8d4, width: r * 0.25 });
    }
  }

  // the chewing: two rows of teeth close twice, crumbs fly
  async function macherFx(a: LegacyCard, n: number, max: number): Promise<void> {
    const k = K(a);
    const bw = a.box.w,
      bx = a.box.x;
    const rang = (haut: boolean) =>
      `<svg viewBox="0 0 200 60" preserveAspectRatio="none"><path d="M0,0 H200 V26 Q100,38 0,26 Z" fill="#7a1230"/>` +
      Array.from(
        { length: 8 },
        (_, i) =>
          `<path d="M${i * 25 + 2},27 L${i * 25 + 12.5},58 L${i * 25 + 23},27 Z" fill="#fffbeb" stroke="#d6c7a1" stroke-width="1.5"/>`,
      ).join('') +
      `</svg>` +
      (haut ? '' : '');
    const tex = await svgTexture(rang(true), 400, 120);
    const box = new Container({ label: 'dents' });
    const clip = new Graphics().roundRect(bx, 0, bw, H, bw * 0.04).fill(0xffffff);
    box.mask = clip;
    const top = new Sprite(tex),
      bot = new Sprite(tex);
    const tw = bw * 1.08,
      th = H * 0.46;
    top.width = bot.width = tw;
    top.height = th;
    bot.height = -th; // scaleY(-1)
    top.x = bot.x = bx - bw * 0.04;
    box.addChild(clip, top, bot);
    a.root.addChild(box);
    // translateY: -110 %, 8 %, -35 %, 8 %, -110 % of their height (the bottom row mirrored)
    const ky = [-1.1, 0.08, -0.35, 0.08, -1.1],
      at = [0, 0.22, 0.42, 0.64, 1];
    void animate(
      a,
      [{}, { sx: 1.05, sy: 0.93, o: 0.22 }, { o: 0.42 }, { sx: 1.05, sy: 0.93, o: 0.64 }, {}],
      900,
    );
    const bl = bellies.get(a.root);
    if (bl) {
      const h0 = bl.holder;
      void tween(
        700,
        (u) => void (h0.rotation = (Math.sin(u * Math.PI * 2) * -12 * (1 - u) * Math.PI) / 180),
        'linear',
        h0,
      );
    }
    setTimeout(() => {
      flot(fx, k, 'CRUNCH !', '#fde68a', true);
      const cx = k.cx,
        cy = k.cy,
        cols = ['#fde68a', '#f59e0b', '#b45309', '#fca5a5'],
        Pp = Array.from({ length: 26 }, () => ({
          a: R(0, Math.PI * 2),
          v: R(0.3, 1),
          s: R(2, 5),
          c: cols[(Math.random() * 4) | 0]!,
        }));
      void fx.add(1, (x, t, u) => {
        x.save();
        for (const p of Pp) {
          const dd = ez(cl(t / 0.45)) * k.w * 0.55 * p.v;
          x.fillStyle = p.c;
          x.globalAlpha = 1 - u;
          x.beginPath();
          x.rect(
            cx + Math.cos(p.a) * dd,
            cy + Math.sin(p.a) * dd * 0.7 + u * u * k.h * 0.35,
            p.s,
            p.s,
          );
          x.fill();
        }
        x.restore();
      });
    }, 200);
    avPoints(a, n, max);
    await tween(
      900,
      (u) => {
        let i = 0;
        while (i < at.length - 2 && u > at[i + 1]!) i++;
        const v = (u - at[i]!) / (at[i + 1]! - at[i]!),
          e = v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2; // ease-in-out
        const y = ky[i]! + (ky[i + 1]! - ky[i]!) * e;
        top.y = -0.02 * H + y * th;
        bot.y = H + 0.02 * H - y * th;
      },
      'linear',
      box,
    );
    await wait(50);
    box.destroy({ children: true });
  }

  // spit out: the swallower swells, the card comes out spinning, covered in drool
  async function recracherFx(a: LegacyCard, v: LegacyCard): Promise<void> {
    const Ka = K(a),
      Kv0 = boxOf(v.front),
      dir = Kv0.cx > Ka.cx ? 1 : -1,
      O = { x: Ka.cx + dir * Ka.w * 0.16, y: Ka.y + Ka.h * 0.4 };
    void animate(
      a,
      [{}, { sx: 0.9, sy: 1.12, o: 0.45 }, { sx: 1.14, sy: 0.88, x: dir * 6, o: 0.7 }, {}],
      700,
    );
    const b = bellies.get(a.root);
    if (b) {
      bellies.delete(a.root);
      void tween(
        450,
        (u) =>
          void b.holder.scale.set(u < 0.5 ? 1 + 0.35 * (u / 0.5) : 1.35 * (1 - (u - 0.5) / 0.5)),
        'linear',
        b.holder,
      ).finally(() => {
        b.loop.stop();
        b.holder.destroy({ children: true });
      });
    }
    await wait(380);
    flot(fx, Ka, 'PTOUH !', '#86efac', true);
    v.root.alpha = 1;
    const Kv = Kv0;
    void animate(
      v,
      [
        { x: O.x - Kv.cx, y: O.y - Kv.cy, rot: dir * 400, s: 0.1, a: 0.3 },
        { x: (O.x - Kv.cx) * 0.3, y: -Kv.h * 0.35, rot: dir * 40, s: 1.08, a: 1, o: 0.6 },
        { y: Kv.h * 0.04, rot: -dir * 4, s: 0.98, o: 0.85 },
        {},
      ],
      850,
    );
    const Dr = Array.from({ length: 18 }, () => ({ k: R(0, 1), o: R(-1, 1), s: R(3, 7) }));
    await fx.add(1.1, (x, t, u) => {
      x.save();
      for (const d of Dr) {
        const q = cl(t / 0.7) * (0.6 + 0.4 * d.k),
          px = O.x + (Kv.cx - O.x) * q + d.o * Kv.w * 0.25,
          py = O.y + (Kv.cy - O.y) * q - Math.sin(Math.PI * q) * Kv.h * 0.35 + u * u * Kv.h * 0.3;
        x.fillStyle = `rgba(190,255,200,${0.75 * (1 - u)})`;
        x.strokeStyle = `rgba(255,255,255,${0.6 * (1 - u)})`;
        x.beginPath();
        x.ellipse(px, py, d.s, d.s * 1.3, 0, 0, 7);
        x.fill();
        x.stroke();
      }
      x.restore();
    });
  }

  // the statuses pass from the swallowed card to the swallower (bubbles of colour)
  async function transfertFx(
    a: LegacyCard,
    from: LegacyCard,
    ks: readonly string[],
  ): Promise<void> {
    const Ka = K(a),
      Kf = boxOf(from.front);
    const COL: Record<string, string> = {
      brulure: '#fb923c',
      poison: '#4ade80',
      gel: '#7dd3fc',
      malediction: '#c084fc',
      saignement: '#ef4444',
      fatigue: '#94a3b8',
    };
    const B = ks.flatMap((k) =>
      Array.from({ length: 6 }, () => ({ c: COL[k] ?? '#fff', d: R(0, 0.35), o: R(-1, 1) })),
    );
    void fx.add(1.3, (x, t) => {
      x.save();
      x.globalCompositeOperation = 'lighter';
      for (const b of B) {
        const q = cl((t - b.d) / 0.8);
        if (q <= 0 || q >= 1) continue;
        const e = ez(q),
          px = Kf.cx + (Ka.cx - Kf.cx) * e + b.o * Kf.w * 0.2 * (1 - e),
          py = Kf.cy + (Ka.cy - Kf.cy) * e - Math.sin(Math.PI * e) * Ka.h * 0.3;
        orb(x, px, py, Ka.w * 0.07, b.c, 'rgba(0,0,0,0)');
      }
      x.restore();
    });
    flot(fx, Ka, 'Statuts ×1,5 !', '#f9a8d4');
    await wait(1200);
  }

  // ════════ NFX: the parasitic link and the mist (persistent drawings) ════════
  // a particle of the legacy's NFX loop (every kind uses some of these fields)
  type P = {
    k: string;
    t: number;
    life: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    s: number;
    a: number;
    r: number;
    w: number;
    c: number;
    sp: number;
    v: number;
    j: number;
    rev: boolean;
    g: number;
    r0: number;
    r1: number;
    col: string;
  };
  const P0: Omit<P, 'k' | 'life'> = {
    t: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    s: 0,
    a: 0,
    r: 0,
    w: 0,
    c: 0,
    sp: 0,
    v: 0,
    j: 0,
    rev: false,
    g: 0,
    r0: 0,
    r1: 0,
    col: '#fff',
  };
  const NFX = {
    t: 0,
    mist: [0, 0] as number[],
    lien: null as null | { c: 0 | 1; to: 0 | 1; n: number },
    P: [] as P[],
    O: [] as {
      from: () => { x: number; y: number } | null;
      to: () => { x: number; y: number } | null;
      col: string;
      t: number;
      dur: number;
      arc: number;
      res: (p: { x: number; y: number } | null) => void;
    }[],
    cards: [null, null] as (LegacyCard | null)[],
    B: [null, null] as (Box | null)[],
    on: false,
  };
  const nB = (c: number) => NFX.B[c] ?? null;
  const nbox = (c: number) => {
    const card = NFX.cards[c];
    return card && !card.root.destroyed && card.root.visible ? K(card) : null;
  };
  const nadd = (p: Partial<P> & { k: string; life: number }) => void NFX.P.push({ ...P0, ...p });
  function nburst(x: number, y: number, n: number, col: string, sp = 4, sz = 3, life = 50, g = 0) {
    for (let i = 0; i < n; i++) {
      const a = R(0, 6.283),
        v = R(0.3, 1) * sp;
      nadd({
        k: 'dot',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        s: R(0.6, 1.4) * sz,
        col,
        g,
        life: life * R(0.7, 1.2),
      });
    }
  }
  const nring = (x: number, y: number, r0: number, r1: number, col: string, w = 3, life = 30) =>
    nadd({ k: 'ring', x, y, r0, r1, col, w, life });
  function ntendril(s: number, j = 0) {
    const L = NFX.lien!,
      A = nB(L.c),
      B = nB(L.to);
    if (!A || !B) return null;
    const dir = B.cx > A.cx ? 1 : -1,
      x0 = A.cx + dir * A.w * 0.25,
      y0 = A.cy + A.h * 0.05,
      x1 = B.cx - dir * B.w * 0.25,
      y1 = B.cy + B.h * 0.05,
      env = Math.sin(Math.PI * s);
    const sag = [0.18, 0.12, 0.27, 0.07][j] ?? 0.18;
    return {
      x: x0 + (x1 - x0) * s,
      y:
        y0 +
        (y1 - y0) * s +
        env * A.h * (j % 2 ? -sag : sag) +
        Math.sin(s * 16 - NFX.t * 0.09 + j * 2.1) * 0.7 * vh() * env,
    };
  }
  // the loop runs at 60 steps a second whatever the frame rate (the legacy counted frames)
  let acc = 0,
    last = 0;
  function nfxStart() {
    if (NFX.on) return;
    NFX.on = true;
    last = performance.now();
    fx.keep((x) => nfxFrame(x));
  }
  function nfxFrame(x: CanvasRenderingContext2D): boolean {
    const now = performance.now();
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    let steps = 0;
    while (acc >= 1 / 60 && steps < 4) {
      acc -= 1 / 60;
      steps++;
      NFX.t++;
    }
    NFX.B = [nbox(0), nbox(1)];
    const u = vh();
    x.lineCap = 'round';
    x.lineJoin = 'round';
    if (NFX.lien && ntendril(0))
      for (let j = 0; j < Math.min(4, NFX.lien.n || 1); j++) {
        x.beginPath();
        for (let i = 0; i <= 32; i++) {
          const p = ntendril(i / 32, j)!;
          if (i) x.lineTo(p.x, p.y);
          else x.moveTo(p.x, p.y);
        }
        x.strokeStyle = 'rgba(163,32,63,.28)';
        x.lineWidth = 2.4 * u;
        x.stroke();
        x.strokeStyle = '#2a0812';
        x.lineWidth = 1.1 * u;
        x.stroke();
        x.strokeStyle = '#8c1a36';
        x.lineWidth = 0.6 * u;
        x.stroke();
        x.setLineDash([0.3 * u, 1.5 * u]);
        x.lineDashOffset = -NFX.t * 0.8;
        x.strokeStyle = '#ff7a96';
        x.lineWidth = 0.25 * u;
        x.stroke();
        x.setLineDash([]);
        x.fillStyle = '#c33558';
        for (let i = 1; i < 6; i++) {
          const p = ntendril(i / 6, j)!;
          x.beginPath();
          x.arc(p.x, p.y, (0.35 + 0.18 * Math.sin(NFX.t * 0.12 + i)) * u, 0, 7);
          x.fill();
        }
      }
    for (const c of [0, 1]) {
      const lv = NFX.mist[c]!;
      if (!lv) continue;
      const b = NFX.B[c];
      if (!b) continue;
      for (let s = 0; s < steps; s++)
        if ((NFX.t - s) % (lv > 1 ? 2 : 3) === 0)
          nadd({
            k: 'fog',
            c,
            a: R(0, 6.283),
            r: R(0.45, 0.75),
            w: lv > 1 ? R(0.035, 0.055) : R(0.003, 0.008) * (Math.random() < 0.5 ? 1 : -1),
            s: R(0.22, 0.36) * b.w,
            life: R(120, 170),
          });
      if (lv > 1) {
        x.strokeStyle = 'rgba(230,240,250,.45)';
        x.lineWidth = 2.5;
        for (let i = 0; i < 4; i++) {
          const a = NFX.t * 0.09 + i * 1.57;
          x.beginPath();
          x.ellipse(b.cx, b.cy, b.w * 0.68, b.h * 0.6, 0, a, a + 1.3);
          x.stroke();
        }
      }
    }
    const fog = nspr('fog');
    for (let i = NFX.P.length - 1; i >= 0; i--) {
      const p = NFX.P[i]!;
      p.t += steps;
      const k = p.t / p.life;
      if (k >= 1) {
        NFX.P.splice(i, 1);
        continue;
      }
      for (let s = 0; s < steps; s++) {
        if (p.k === 'fog') p.a += p.w;
        else if (p.k === 'puff') {
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.97;
          p.vy *= 0.97;
          p.s *= 1.02;
        } else if (p.k === 'path') p.sp += p.v;
        else if (p.k === 'dot' || p.k === 'glow') {
          p.vy += p.g || 0;
          p.x += p.vx;
          p.y += p.vy;
        }
      }
      if (p.k === 'fog') {
        const b = NFX.B[p.c] ?? null;
        if (!b || !NFX.mist[p.c]) {
          // the mist gone: its fog drifts away
          p.k = 'puff';
          const v = R(2, 4);
          p.vx = Math.cos(p.a) * v;
          p.vy = Math.sin(p.a) * v;
          p.life = p.t + 50;
          continue;
        }
        p.x = b.cx + Math.cos(p.a) * b.w * p.r * 1.1;
        p.y = b.cy + Math.sin(p.a) * b.h * p.r * 0.9;
        x.globalAlpha = Math.sin(Math.PI * k) * 0.2;
        x.drawImage(fog, p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
        continue;
      }
      if (p.k === 'puff') {
        x.globalAlpha = (1 - k) * 0.22;
        x.drawImage(fog, p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
        continue;
      }
      if (p.k === 'path') {
        if (!NFX.lien || p.sp >= 1) {
          NFX.P.splice(i, 1);
          continue;
        }
        const q = ntendril(
          p.rev ? 1 - p.sp : p.sp,
          Math.min(p.j || 0, Math.min(4, NFX.lien.n || 1) - 1),
        );
        if (!q) continue;
        const z = p.s * 4;
        x.globalAlpha = 1;
        x.drawImage(nspr('#6dff8a'), q.x - z / 2, q.y - z / 2, z, z);
        continue;
      }
      if (p.k === 'ring') {
        const r = p.r0 + (p.r1 - p.r0) * (1 - (1 - k) * (1 - k));
        x.beginPath();
        x.arc(p.x, p.y, r, 0, 7);
        x.strokeStyle = p.col;
        x.globalAlpha = 1 - k;
        x.lineWidth = p.w;
        x.stroke();
        continue;
      }
      x.globalAlpha = 1 - k;
      x.fillStyle = p.col;
      x.fillRect(p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
    }
    x.globalAlpha = 1;
    for (let i = NFX.O.length - 1; i >= 0; i--) {
      const o = NFX.O[i]!;
      o.t += steps;
      const k = Math.min(1, o.t / o.dur),
        f = o.from(),
        to = o.to();
      if (!f || !to) {
        NFX.O.splice(i, 1);
        o.res(null);
        continue;
      }
      const px = f.x + (to.x - f.x) * k,
        py = f.y + (to.y - f.y) * k - Math.sin(Math.PI * k) * o.arc;
      if (NFX.t % 2 === 0)
        nadd({
          k: 'dot',
          x: px + R(-3, 3),
          y: py + R(-3, 3),
          vx: R(-0.4, 0.4),
          vy: R(-0.4, 0.4),
          s: R(1.5, 3),
          col: o.col,
          life: 22,
        });
      x.drawImage(nspr(o.col), px - 20, py - 20, 40, 40);
      if (k >= 1) {
        NFX.O.splice(i, 1);
        o.res({ x: px, y: py });
      }
    }
    if (!NFX.mist[0] && !NFX.mist[1] && !NFX.lien && !NFX.P.length && !NFX.O.length) {
      NFX.on = false;
      return false;
    }
    return true;
  }
  const ncentre = (c: number) => () => {
    const b = nbox(c);
    return b && { x: b.cx, y: b.cy };
  };
  function ntir(from: number, to: number, col: string): Promise<{ x: number; y: number } | null> {
    nfxStart();
    return new Promise((res) =>
      NFX.O.push({ from: ncentre(from), to: ncentre(to), col, t: 0, dur: 45, arc: vh() * 6, res }),
    );
  }
  const NST_COL: Record<string, string> = {
    curse: '#c084fc',
    bleed: '#ef4444',
    poison: '#22c55e',
    burn: '#f97316',
    frost: '#7dd3fc',
    knell: '#a78bfa',
    fracture: '#fde68a',
    stun: '#facc15',
    fatigue: '#94a3b8',
    parasite: '#e0607e',
  };
  // the journal's status kinds, as the legacy named their colours
  const ST_KEY: Record<string, string> = {
    malediction: 'curse',
    saignement: 'bleed',
    poison: 'poison',
    brulure: 'burn',
    gel: 'frost',
    glas: 'knell',
    fracture: 'fracture',
    etourdi: 'stun',
    fatigue: 'fatigue',
    lien: 'parasite',
  };
  const stCol = (s: unknown) => NST_COL[ST_KEY[String(s)] ?? String(s)] ?? '#c9a0ff';

  // ════════ ELEMENTAL BREATH: a dragon's breath from the card that uses it to the other; its colours and
  // its specks (snowflakes for frost, bubbles for poison) say its element ════════
  const BREATH: Readonly<Record<string, readonly [string, string, string]>> = {
    brulure: ['255,244,190', '255,140,30', '190,35,0'],
    gel: ['240,252,255', '140,210,255', '50,110,210'],
    malediction: ['245,220,255', '175,85,245', '75,15,135'],
    poison: ['235,255,205', '125,225,60', '25,115,30'],
    saignement: ['255,210,210', '225,30,45', '105,0,12'],
    fatigue: ['230,235,248', '145,160,195', '55,65,98'],
    foudre: ['240,247,255', '120,175,255', '45,65,215'],
  };
  function souffle(from: LegacyCard, to: LegacyCard, el: string): Promise<void> {
    const C = BREATH[el] ?? BREATH['brulure']!,
      A = K(from),
      B = K(to),
      dir = Math.sign(B.cx - A.cx) || 1;
    const sx = A.cx + dir * A.w * 0.42,
      sy = A.y + A.h * 0.36,
      tx = B.cx,
      ty = B.cy,
      ang = Math.atan2(ty - sy, tx - sx),
      dist = Math.hypot(tx - sx, ty - sy),
      S = A.w / 280;
    const P = Array.from({ length: 170 }, () => ({
      tb: R(0, 0.8),
      sp: R(-0.16, 0.16),
      v: R(0.85, 1.15),
      s: R(10, 22) * S,
      w: R(0, 6.28),
      k: Math.random(),
    }));
    const X =
      el === 'gel'
        ? Array.from({ length: 26 }, () => ({
            tb: R(0.1, 0.8),
            sp: R(-0.2, 0.2),
            v: R(0.9, 1.2),
            s: R(4, 8) * S,
            r: R(0, 6),
          }))
        : el === 'poison'
          ? Array.from({ length: 22 }, () => ({
              tb: R(0.1, 0.8),
              sp: R(-0.2, 0.2),
              v: R(0.7, 1),
              s: R(4, 9) * S,
              r: 0,
            }))
          : [];
    void wait(450).then(() => nudge(to, [dir * 9, -3], [-dir * 5, 2], 380));
    return fx.add(1.75, (x, t) => {
      const LIFE = 0.55;
      // the glow at the breath's mouth
      const mo = t < 0.95 ? Math.min(1, t / 0.12) : Math.max(0, 1 - (t - 0.95) / 0.3);
      x.globalCompositeOperation = 'lighter';
      orb(x, sx, sy, A.w * 0.3 * mo, `rgba(${C[0]},${0.8 * mo})`, `rgba(${C[1]},0)`);
      for (const p of P) {
        const a = (t - p.tb) / LIFE;
        if (a <= 0 || a >= 1) continue;
        const d = dist * ez(a) * p.v,
          an = ang + p.sp * (0.4 + a),
          wob = Math.sin(t * 14 + p.w) * p.s * 0.6 * a;
        const px = sx + Math.cos(an) * d - Math.sin(an) * wob,
          py = sy + Math.sin(an) * d + Math.cos(an) * wob,
          r = p.s * (0.5 + 2.6 * a),
          fade = a < 0.15 ? a / 0.15 : 1 - (a - 0.15) / 0.85;
        x.globalCompositeOperation = p.k < 0.35 ? 'source-over' : 'lighter';
        const col = p.k < 0.35 ? C[2] : a < 0.35 ? C[0] : C[1];
        orb(x, px, py, r, `rgba(${col},${0.75 * fade})`, `rgba(${col},0)`);
      }
      x.globalCompositeOperation = 'source-over';
      for (const q of X) {
        const a = (t - q.tb) / 0.6;
        if (a <= 0 || a >= 1) continue;
        const d = dist * ez(a) * q.v,
          an = ang + q.sp,
          px = sx + Math.cos(an) * d,
          py = sy + Math.sin(an) * d,
          al = 1 - a;
        if (el === 'gel') {
          x.save();
          x.translate(px, py);
          x.rotate(q.r + t * 6);
          x.strokeStyle = `rgba(255,255,255,${al})`;
          x.lineWidth = 1.4;
          x.beginPath();
          for (let j = 0; j < 3; j++) {
            const b = j * 1.047;
            x.moveTo(-Math.cos(b) * q.s, -Math.sin(b) * q.s);
            x.lineTo(Math.cos(b) * q.s, Math.sin(b) * q.s);
          }
          x.stroke();
          x.restore();
        } else {
          x.strokeStyle = `rgba(${C[0]},${al})`;
          x.lineWidth = 1.5;
          x.beginPath();
          x.arc(px, py - a * 8 * S, q.s, 0, 7);
          x.stroke();
        }
      }
      // the hit on the target
      const hi = Math.max(0, Math.min(1, (t - 0.3) / 0.2)) * Math.max(0, 1 - (t - 1.15) / 0.5);
      if (hi > 0) {
        x.globalCompositeOperation = 'lighter';
        orb(x, tx, ty, B.w * 0.75 * hi, `rgba(${C[1]},${0.55 * hi})`, `rgba(${C[2]},0)`);
        x.globalCompositeOperation = 'source-over';
      }
    });
  }

  // ════════ ULTIMATE: the legacy's red aura (auraFx): a red halo around the card, its edges glowing
  // inside, dark smoke and embers rising from its border; the card swells a little meanwhile ════════
  const soft = (size: number, c0: string, c1: string): HTMLCanvasElement => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d')!,
      m = size / 2,
      r = g.createRadialGradient(m, m, 0, m, m, m);
    r.addColorStop(0, c0);
    r.addColorStop(1, c1);
    g.fillStyle = r;
    g.fillRect(0, 0, size, size);
    return cv;
  };
  let smoke: HTMLCanvasElement | null = null,
    ember: HTMLCanvasElement | null = null;
  function aura(c: LegacyCard): Promise<void> {
    smoke ??= soft(96, 'rgba(14,0,6,1)', 'rgba(14,0,6,0)');
    ember ??= soft(96, 'rgba(200,10,10,1)', 'rgba(120,0,0,0)');
    const S = smoke,
      E = ember;
    const DUR = 2.7,
      k0 = K(c),
      W = k0.w,
      H = k0.h,
      pad = Math.round(W * 0.55),
      CW = W + 2 * pad,
      CH = H + 2 * pad,
      sc = W / 320,
      rad = 12 * sc;
    const hc = '200,10,20',
      ec = '255,50,40';
    // the halo and the inner glow, drawn once at the card's size
    const glow = document.createElement('canvas');
    glow.width = CW;
    glow.height = CH;
    {
      const g = glow.getContext('2d')!;
      g.strokeStyle = `rgba(${ec},.55)`;
      g.lineWidth = 4 * sc;
      for (const [bl, al] of [
        [110, 0.9],
        [45, 1],
      ] as const) {
        g.save();
        g.shadowColor = `rgba(${hc},${al})`;
        g.shadowBlur = bl * sc;
        rr(g, pad, pad, W, H, rad);
        g.stroke();
        g.restore();
      }
    }
    const inner = document.createElement('canvas');
    inner.width = Math.max(1, Math.round(W));
    inner.height = Math.max(1, Math.round(H));
    {
      const g = inner.getContext('2d')!;
      rr(g, 0, 0, W, H, rad);
      g.clip();
      const ig = g.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.8);
      ig.addColorStop(0, `rgba(${hc},0)`);
      ig.addColorStop(1, `rgba(${hc},.4)`);
      g.fillStyle = ig;
      g.fillRect(0, 0, W, H);
    }
    // a point on the card's border, and its outward normal
    const per = (): [number, number, number, number] => {
      const s = Math.random() * (2 * W + 2 * H);
      if (s < W) return [s, 0, 0, -1];
      if (s < W + H) return [W, s - W, 1, 0];
      if (s < 2 * W + H) return [s - W - H, H, 0, 1];
      return [0, s - 2 * W - H, -1, 0];
    };
    type Puff = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      s: number;
      l: number;
      d: number;
      ph: number;
    };
    let P: Puff[] = [],
      last = 0,
      acc = 0;
    void animate(c, [{}, { s: 1.06, o: 0.2 }, { s: 1.06, o: 0.8 }, { o: 1 }], 2300);
    const done = fx.add(DUR, (x, t) => {
      const dt = Math.min(0.05, Math.max(0, t - last));
      last = t;
      const k = dt * 60;
      // the card may have moved: everything follows its box (positions are kept relative to it)
      const b = K(c),
        ox = b.cx - W / 2 - pad,
        oy = b.cy - H / 2 - pad;
      const env = t < 0.4 ? t / 0.4 : t < DUR - 0.7 ? 1 : Math.max(0, (DUR - t) / 0.7),
        pul = 1 + 0.18 * Math.sin(t * 5) + 0.08 * Math.sin(t * 13);
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = cl(env * (0.7 + 0.3 * pul));
      x.drawImage(glow, ox, oy, CW, CH);
      x.globalAlpha = cl(env * pul);
      x.drawImage(inner, ox + pad, oy + pad, W, H);
      if (t < DUR - 0.8) {
        acc += 130 * dt;
        while (acc >= 1) {
          acc--;
          const [px, py, nx, ny] = per();
          P.push({
            x: px + pad + nx * 0.05 * W,
            y: py + pad + ny * 0.05 * W,
            vx: nx * R(0.2, 0.9) * sc,
            vy: ny * R(0.2, 0.9) * sc - R(0.5, 1.4) * sc,
            s: R(0.14, 0.26) * W,
            l: 0,
            d: R(1.8, 2.6),
            ph: Math.random() * 6,
          });
        }
      }
      for (const p of P) {
        p.l += dt / p.d;
        const u = p.l;
        if (u >= 1) continue;
        p.x += (p.vx + Math.sin(t * 1.6 + p.y * 0.015 + p.ph) * 0.9 * sc) * k;
        p.y += (p.vy + Math.cos(t * 1.2 + p.x * 0.015 + p.ph) * 0.4 * sc) * k;
        const a = Math.pow(Math.sin(Math.PI * u), 0.8) * env,
          r = p.s * (0.6 + 0.7 * u);
        x.globalCompositeOperation = 'source-over';
        x.globalAlpha = a * 0.55;
        x.drawImage(S, ox + p.x - r, oy + p.y - r, r * 2, r * 2);
        x.globalCompositeOperation = 'lighter';
        x.globalAlpha = a * 0.25 * (1 - u * 0.5);
        x.drawImage(E, ox + p.x - r * 0.8, oy + p.y - r * 0.8, r * 1.6, r * 1.6);
      }
      P = P.filter((p) => p.l < 1);
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
    });
    // the legacy went on after 2.2 s, the aura fading meanwhile
    return Promise.race([done, wait(2200)]);
  }

  // ════════ BREAK (briser): cracks of light run over the card, which shakes; then it bursts into
  // triangles that fly apart and fall, in a flash, a ring, grey smoke and debris ════════
  function briser(c: LegacyCard): Promise<void> {
    const K0 = K(c),
      tw = Math.max(1, Math.round(K0.w)),
      th = Math.max(1, Math.round(K0.h));
    const cr: [number, number][][] = [];
    const branch = (px: number, py: number, a: number, len: number, dep: number) => {
      const pts: [number, number][] = [[px, py]];
      for (let i = 0; i < 6; i++) {
        a += R(-0.5, 0.5);
        px += Math.cos(a) * len * R(0.7, 1.1);
        py += Math.sin(a) * len * R(0.7, 1.1);
        pts.push([px, py]);
        if (dep < 2 && i > 1 && Math.random() < 0.35)
          branch(px, py, a + R(-1, 1), len * 0.8, dep + 1);
      }
      cr.push(pts);
    };
    const ox = K0.cx + R(-0.1, 0.1) * K0.w,
      oy = K0.cy + R(-0.1, 0.1) * K0.h;
    for (let b = 0; b < 8; b++) branch(ox, oy, b * 0.785 + R(-0.25, 0.25), K0.w * 0.1, 0);
    // the shake (the legacy's .tremble) while the cracks run
    const shake = every(c.front, () => {
      c.front.x = R(-1, 1) * W * 0.006;
      c.front.y = R(-1, 1) * H * 0.004;
    });
    void fx.add(0.6, (x, t) => {
      x.save();
      rr(x, K0.x, K0.y, K0.w, K0.h, 12);
      x.clip();
      const p = cl(t / 0.5);
      x.globalCompositeOperation = 'lighter';
      x.lineCap = 'round';
      x.lineJoin = 'round';
      for (const [col, lw] of [
        ['rgba(255,170,80,.45)', 8],
        ['rgba(255,255,255,.95)', 2.2],
      ] as const) {
        x.strokeStyle = col;
        x.lineWidth = lw;
        x.beginPath();
        for (const pts of cr) {
          const n = p * (pts.length - 1),
            w = Math.floor(n);
          x.moveTo(pts[0]![0], pts[0]![1]);
          for (let i = 1; i <= w; i++) x.lineTo(pts[i]![0], pts[i]![1]);
          if (w < pts.length - 1) {
            const f = n - w;
            x.lineTo(
              pts[w]![0] + (pts[w + 1]![0] - pts[w]![0]) * f,
              pts[w]![1] + (pts[w + 1]![1] - pts[w]![1]) * f,
            );
          }
        }
        x.stroke();
      }
      x.restore();
    });
    return wait(520).then(() => {
      shake.stop();
      c.front.position.set(0, 0);
      // the face, at its size on screen, drawn once: the shards are pieces of it
      const face = faceCanvas(app, c),
        tex = document.createElement('canvas');
      tex.width = tw;
      tex.height = th;
      tex.getContext('2d')!.drawImage(face, 0, 0, tw, th);
      const K1 = K(c);
      const NX = 5,
        NY = 7,
        pt: [number, number][][] = [];
      for (let j = 0; j <= NY; j++) {
        pt[j] = [];
        for (let i = 0; i <= NX; i++)
          pt[j]![i] = [
            (i / NX) * tw + (i && i < NX ? R(-0.06, 0.06) * tw : 0),
            (j / NY) * th + (j && j < NY ? R(-0.05, 0.05) * th : 0),
          ];
      }
      type Shard = {
        tri: [number, number][];
        gx: number;
        gy: number;
        bx: number;
        by: number;
        bw: number;
        bh: number;
        dx: number;
        up: number;
        dn: number;
        rz: number;
        de: number;
        du: number;
      };
      const SH: Shard[] = [];
      for (let j = 0; j < NY; j++)
        for (let i = 0; i < NX; i++) {
          const a = pt[j]![i]!,
            b = pt[j]![i + 1]!,
            e = pt[j + 1]![i + 1]!,
            f = pt[j + 1]![i]!;
          for (const tri of [
            [a, b, e],
            [a, e, f],
          ]) {
            const gx = (tri[0]![0] + tri[1]![0] + tri[2]![0]) / 3,
              gy = (tri[0]![1] + tri[1]![1] + tri[2]![1]) / 3,
              xs = tri.map((q) => q[0]),
              ys = tri.map((q) => q[1]),
              bx = Math.max(0, Math.floor(Math.min(...xs)) - 1),
              by = Math.max(0, Math.floor(Math.min(...ys)) - 1),
              vx = (gx / tw - 0.5) * 2,
              vy = (gy / th - 0.5) * 2;
            SH.push({
              tri,
              gx,
              gy,
              bx,
              by,
              bw: Math.min(tw - bx, Math.ceil(Math.max(...xs)) - bx + 2),
              bh: Math.min(th - by, Math.ceil(Math.max(...ys)) - by + 2),
              dx: vx * K1.w * R(0.6, 1.2) + R(-0.1, 0.1) * K1.w,
              up: -K1.h * R(0.05, 0.3) * (vy < 0 ? 1.4 : 0.6),
              dn: K1.h * R(0.6, 1.3),
              rz: R(-4.2, 4.2),
              de: Math.hypot(vx, vy) * 0.1,
              du: R(1.2, 1.8),
            });
          }
        }
      c.root.visible = false;
      void fx.add(2.3, (x, t) => {
        for (const sh of SH) {
          const p = (t - sh.de) / sh.du;
          if (p >= 1) continue;
          let dx = 0,
            dy = 0,
            rot = 0,
            al = 1;
          if (p > 0) {
            if (p < 0.3) {
              const q = p / 0.3,
                e = 1 - Math.pow(1 - q, 3);
              dx = sh.dx * 0.55 * e;
              dy = sh.up * e;
              rot = sh.rz * 0.5 * e;
            } else {
              const q = (p - 0.3) / 0.7;
              dx = sh.dx * (0.55 + 0.45 * q);
              dy = sh.up + (sh.dn - sh.up) * q * q;
              rot = sh.rz * (0.5 + 0.5 * q);
              al = 1 - q;
            }
          }
          x.save();
          x.translate(K1.x + sh.gx + dx, K1.y + sh.gy + dy);
          x.rotate(rot);
          x.translate(-sh.gx, -sh.gy);
          x.beginPath();
          x.moveTo(sh.tri[0]![0], sh.tri[0]![1]);
          x.lineTo(sh.tri[1]![0], sh.tri[1]![1]);
          x.lineTo(sh.tri[2]![0], sh.tri[2]![1]);
          x.closePath();
          x.clip();
          x.globalAlpha = al;
          x.drawImage(tex, sh.bx, sh.by, sh.bw, sh.bh, sh.bx, sh.by, sh.bw, sh.bh);
          x.restore();
        }
      });
      const S = K1.w / 420;
      const deb = Array.from({ length: 18 }, () => ({
        a: Math.random() * 6.28,
        v: R(200, 700) * S,
        w: R(3, 10) * S,
        r: Math.random() * 6,
        g: R(0.45, 0.8),
      }));
      const smo = Array.from({ length: 6 }, () => ({
        vx: R(-0.9, 0.9),
        vy: R(-0.7, 0.5),
        d: R(0, 0.25),
      }));
      void fx.add(1.6, (x, t) => {
        x.globalCompositeOperation = 'lighter';
        const fu = cl(1 - t / 0.3);
        if (fu > 0)
          orb(
            x,
            K1.cx,
            K1.cy,
            K1.w * (0.5 + t),
            `rgba(255,255,255,${fu * 0.9})`,
            'rgba(255,255,255,0)',
          );
        if (t < 0.5) {
          const r = K1.w * (0.2 + 1.1 * cl(t / 0.5));
          x.strokeStyle = `rgba(255,235,200,${1 - t / 0.5})`;
          x.lineWidth = 6 * (1 - t / 0.5) + 1;
          x.beginPath();
          x.ellipse(K1.cx, K1.cy, r, r * 1.2, 0, 0, 7);
          x.stroke();
        }
        x.globalCompositeOperation = 'source-over';
        for (const m of smo) {
          const q = cl((t - m.d) / 1.1);
          if (q <= 0 || q >= 1) continue;
          orb(
            x,
            K1.cx + m.vx * q * K1.w,
            K1.cy + m.vy * q * K1.h - q * K1.h * 0.1,
            K1.w * (0.15 + 0.35 * q),
            `rgba(150,150,150,${0.35 * (1 - q)})`,
            'rgba(150,150,150,0)',
          );
        }
        for (const d of deb) {
          const al = cl(1 - t / 1.4);
          if (al <= 0) continue;
          x.save();
          x.translate(
            K1.cx + Math.cos(d.a) * d.v * t,
            K1.cy + Math.sin(d.a) * d.v * t + 700 * S * t * t,
          );
          x.rotate(d.r + t * 6);
          const g = Math.round(190 * d.g + 40);
          x.fillStyle = `rgba(${g},${g},${g + 5},${al})`;
          x.fillRect(-d.w, -d.w * 0.6, d.w * 2, d.w * 1.2);
          x.restore();
        }
      });
    });
  }

  // ════════ PROGRAMMING (progFx, activFx): a gear forms on the card and drops into its slot; at the
  // activation, circuits light up from the slots over the whole card around two turning gears ════════
  function engrenage(
    x: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    rot: number,
    col: string,
    al: number,
  ): void {
    const n = 10,
      ri = r * 0.78;
    x.save();
    x.translate(cx, cy);
    x.rotate(rot);
    x.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a0 = (i * Math.PI) / n,
        a1 = ((i + 1) * Math.PI) / n,
        R2 = i % 2 ? ri : r;
      x.lineTo(Math.cos(a0 + 0.08) * R2, Math.sin(a0 + 0.08) * R2);
      x.lineTo(Math.cos(a1 - 0.08) * R2, Math.sin(a1 - 0.08) * R2);
    }
    x.closePath();
    x.globalAlpha = al;
    x.fillStyle = col;
    x.shadowColor = col;
    x.shadowBlur = r * 0.5;
    x.fill();
    x.shadowBlur = 0;
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    x.arc(0, 0, r * 0.36, 0, 7);
    x.fill();
    x.restore();
  }
  function progGear(c: LegacyCard, ultimate: boolean): Promise<void> {
    const col = ultimate ? '#fb923c' : '#38bdf8';
    return fx.add(1.5, (x, t) => {
      const k = K(c);
      const ap = cl((t - 0.25) / 0.35),
        vol = ez(cl((t - 1) / 0.45)),
        cy = k.cy + (k.y + k.h * 0.9 - k.cy) * vol,
        r = k.w * (0.22 * ez(ap)) * (1 - 0.8 * vol);
      if (ap > 0 && r > 1) engrenage(x, k.cx, cy, r, t * 2.4, col, 1 - cl((t - 1.35) / 0.15));
    });
  }
  function activFx(c: LegacyCard): Promise<void> {
    const K0 = K(c),
      traces: { pts: [number, number][]; d: number }[] = [];
    for (let i = 0; i < 12; i++) {
      let px = K0.x + K0.w * (0.15 + 0.7 * Math.random()),
        py = K0.y + K0.h * 0.94;
      const pts: [number, number][] = [[px, py]];
      for (let j = 0; j < 5; j++) {
        if (j % 2 === 0) py -= K0.h * (0.1 + 0.15 * Math.random());
        else px += (Math.random() < 0.5 ? -1 : 1) * K0.w * (0.08 + 0.15 * Math.random());
        px = Math.max(K0.x + 4, Math.min(K0.x + K0.w - 4, px));
        py = Math.max(K0.y + 4, py);
        pts.push([px, py]);
      }
      traces.push({ pts, d: Math.random() * 0.25 });
    }
    return fx.add(2, (x, t) => {
      const fade = 1 - cl((t - 1.6) / 0.4);
      engrenage(
        x,
        K0.cx,
        K0.cy,
        K0.w * 0.34 * ez(cl(t / 0.4)),
        -t * 1.6,
        'rgba(56,189,248,.35)',
        0.6 * fade,
      );
      engrenage(
        x,
        K0.cx + K0.w * 0.2,
        K0.cy - K0.h * 0.18,
        K0.w * 0.14 * ez(cl((t - 0.1) / 0.4)),
        t * 3.2,
        'rgba(125,211,252,.5)',
        0.7 * fade,
      );
      x.lineCap = 'round';
      x.lineJoin = 'round';
      for (const T of traces) {
        const u = cl((t - T.d) / 0.7);
        if (u <= 0) continue;
        const P = T.pts,
          L = P.length - 1,
          n = u * L,
          k0 = Math.floor(n);
        x.strokeStyle = `rgba(125,211,252,${0.95 * fade})`;
        x.lineWidth = 2.5;
        x.shadowColor = '#38bdf8';
        x.shadowBlur = 12;
        x.beginPath();
        x.moveTo(P[0]![0], P[0]![1]);
        for (let q = 1; q <= k0; q++) x.lineTo(P[q]![0], P[q]![1]);
        if (k0 < L) {
          const f = n - k0,
            a = P[k0]!,
            b = P[k0 + 1]!;
          x.lineTo(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
        }
        x.stroke();
        for (let q = 1; q <= k0; q++) {
          x.fillStyle = `rgba(224,242,254,${fade})`;
          x.beginPath();
          x.arc(P[q]![0], P[q]![1], 3, 0, 7);
          x.fill();
        }
        x.shadowBlur = 0;
      }
      // the power coming on
      if (t > 0.55 && t < 0.95) {
        x.fillStyle = `rgba(186,230,253,${0.35 * (1 - cl((t - 0.55) / 0.4))})`;
        x.fillRect(K0.x, K0.y, K0.w, K0.h);
      }
    });
  }

  // ════════ THE LASER (nLaser, modernised): the shooter charges (violet energy converging on its
  // muzzle, a ring closing in), kicks back as it fires; a thick beam, violet halo, lilac body, white
  // core, energy running along it, hits the target: a blinding flare, two shock rings, sparks thrown
  // back toward the shooter, the target jolted; then a burn smoulders on it. The fuller the target's
  // life (pct), the thicker the beam and the bigger the impact. Resolves at the impact. ════════
  function tirLaser(from: LegacyCard, to: LegacyCard, pct: number): Promise<void> {
    const A = K(from),
      B = K(to),
      I = Math.max(0.35, Math.min(1, pct / 100)),
      dir = Math.sign(B.cx - A.cx) || 1,
      x0 = A.cx + dir * A.w * 0.4,
      y0 = A.cy - A.h * 0.04,
      x1 = B.cx,
      y1 = B.cy,
      ang = Math.atan2(y1 - y0, x1 - x0),
      len = Math.hypot(x1 - x0, y1 - y0),
      S = A.w / 280,
      w0 = (10 + 16 * I) * S;
    const CHARGE = 0.45,
      FIRE = 0.55;
    const motes = Array.from({ length: 34 }, () => ({
      a: R(0, 6.283),
      r: R(60, 150) * S,
      d: R(0, 0.25),
      s: R(3, 7) * S,
    }));
    const sparks = Array.from({ length: Math.round(26 + 34 * I) }, () => ({
      a: ang + Math.PI + R(-1.1, 1.1),
      v: R(260, 720) * S,
      t0: R(0, 0.25),
      s: R(1.5, 3.8) * S,
      hot: Math.random() < 0.3,
    }));
    const smoke = Array.from({ length: 10 }, () => ({
      dx: R(-0.12, 0.12) * B.w,
      t0: R(0, 0.8),
      s: R(18, 34) * S,
    }));
    let hit: () => void = () => {};
    const impact = new Promise<void>((r) => (hit = r));
    let recoiled = false,
      jolted = false;
    void fx.add(2.4, (x, t) => {
      // the charge
      if (t < CHARGE + 0.05) {
        const u = cl(t / CHARGE);
        for (const m of motes) {
          const k = cl((u - m.d) / (1 - m.d));
          if (k <= 0 || k >= 1) continue;
          const r = m.r * (1 - ez(k));
          x.globalAlpha = 0.9 * Math.sin(Math.PI * k);
          x.drawImage(
            nspr('#c084fc'),
            x0 + Math.cos(m.a) * r - m.s * 2,
            y0 + Math.sin(m.a) * r - m.s * 2,
            m.s * 4,
            m.s * 4,
          );
        }
        const orbR = w0 * (0.4 + 1.2 * u);
        x.globalAlpha = 0.95;
        x.drawImage(nspr('#e9d5ff'), x0 - orbR * 2, y0 - orbR * 2, orbR * 4, orbR * 4);
        x.globalAlpha = 0.7 * u;
        x.strokeStyle = '#d8b4fe';
        x.lineWidth = 3 * S;
        x.beginPath();
        x.arc(x0, y0, w0 * 4 * (1 - u) + w0, 0, 7);
        x.stroke();
      }
      // the shot
      if (t >= CHARGE) {
        if (!recoiled) {
          recoiled = true;
          void nudge(from, [-dir * 16 * S, 0], [-dir * 6 * S, 0], 300);
        }
        const k = t - CHARGE,
          reach = cl(k / 0.08),
          fade = 1 - cl((k - FIRE) / 0.35);
        if (fade > 0) {
          const ex = x0 + (x1 - x0) * reach,
            ey = y0 + (y1 - y0) * reach,
            w =
              w0 *
              (1 + 0.15 * Math.sin(t * 60) + 0.08 * (Math.random() - 0.5)) *
              (k < FIRE ? 1 : 0.3 + 0.7 * fade);
          x.save();
          x.globalCompositeOperation = 'lighter';
          x.lineCap = 'round';
          x.beginPath();
          x.moveTo(x0, y0);
          x.lineTo(ex, ey);
          const layers: [string, number, number][] = [
            ['#7e22ce', 5, 0.22],
            ['#9333ea', 2.6, 0.6],
            ['#c084fc', 1.5, 0.85],
            ['#f0abfc', 0.7, 0.8],
            ['#ffffff', 0.25, 0.95],
          ];
          for (const [col, m, al] of layers) {
            x.globalAlpha = al * fade;
            x.strokeStyle = col;
            x.lineWidth = w * m;
            x.stroke();
          }
          // energy running along the beam
          x.setLineDash([w * 0.9, w * 2.6]);
          x.lineDashOffset = -t * len * 2.2;
          x.globalAlpha = 0.9 * fade;
          x.strokeStyle = '#ecfeff';
          x.lineWidth = w * 0.22;
          x.stroke();
          x.setLineDash([]);
          // the muzzle flare and the point of impact
          const z = w * (2.6 + 0.6 * Math.sin(t * 40));
          x.globalAlpha = fade;
          x.drawImage(nspr('#c084fc'), x0 - z, y0 - z, z * 2, z * 2);
          if (reach >= 1)
            x.drawImage(nspr('#f5d0fe'), ex - z * 1.6, ey - z * 1.6, z * 3.2, z * 3.2);
          x.restore();
        }
        if (reach >= 1) {
          if (!jolted) {
            jolted = true;
            hit();
            void nudge(to, [dir * (10 + 14 * I) * S, -4 * S], [-dir * 5 * S, 2 * S], 340);
          }
          const h = k - 0.08;
          // the flare, then the shock rings
          if (h < 0.25) {
            x.globalAlpha = 0.85 * (1 - h / 0.25);
            const fr = B.w * (0.35 + 0.4 * I) * ez(h / 0.25);
            x.drawImage(nspr('#ffffff'), x1 - fr, y1 - fr, fr * 2, fr * 2);
          }
          for (const [delay, mx, col, lw] of [
            [0, 0.55 + 0.5 * I, 'rgba(233,213,255,', 6],
            [0.08, 0.35 + 0.3 * I, 'rgba(168,85,247,', 4],
          ] as const) {
            const q = cl((h - delay) / 0.45);
            if (q <= 0 || q >= 1) continue;
            x.globalAlpha = 1;
            x.strokeStyle = `${col}${(1 - q) * 0.95})`;
            x.lineWidth = lw * S * (1 - q) + 1;
            x.beginPath();
            x.arc(x1, y1, B.w * 0.05 + B.w * mx * ez(q), 0, 7);
            x.stroke();
          }
          // sparks thrown back toward the shooter
          for (const p of sparks) {
            const q = h - p.t0;
            if (q <= 0 || q > 0.6) continue;
            const px = x1 + Math.cos(p.a) * p.v * q,
              py = y1 + Math.sin(p.a) * p.v * q + 420 * S * q * q;
            x.globalAlpha = 1 - q / 0.6;
            x.strokeStyle = p.hot ? '#ffffff' : '#f0abfc';
            x.lineWidth = p.s;
            x.beginPath();
            x.moveTo(px, py);
            x.lineTo(px - Math.cos(p.a) * p.v * 0.03, py - Math.sin(p.a) * p.v * 0.03);
            x.stroke();
          }
          // the burn smoulders, smoke rising
          if (h > 0.3) {
            const b = cl((h - 0.3) / 0.3) * (1 - cl((h - 1.2) / 0.5));
            x.globalAlpha = 0.85 * b;
            const br = B.w * (0.12 + 0.08 * I);
            x.drawImage(nspr('#6b21a8'), x1 - br * 1.6, y1 - br * 1.6, br * 3.2, br * 3.2);
            x.globalAlpha = 0.6 * b * (0.7 + 0.3 * Math.sin(t * 14));
            x.drawImage(nspr('#f97316'), x1 - br * 0.6, y1 - br * 0.6, br * 1.2, br * 1.2);
            for (const m of smoke) {
              const q = cl((h - 0.35 - m.t0) / 1.1);
              if (q <= 0 || q >= 1) continue;
              x.globalAlpha = 0.35 * Math.sin(Math.PI * q);
              x.fillStyle = '#3b3047';
              x.beginPath();
              x.arc(
                x1 + m.dx + Math.sin(q * 6 + m.t0 * 9) * 8 * S,
                y1 - q * B.h * 0.45,
                m.s * (0.6 + q),
                0,
                7,
              );
              x.fill();
            }
          }
        }
      }
      x.globalAlpha = 1;
    });
    return impact;
  }

  // ════════ THE TRANSCENDENCE (combat.html: a golden aura, a halo without its cross; modernised):
  // a pillar of golden light falls on the card from above, the card rises into it; a halo forms over
  // it, rays turn behind it, motes of light climb; a flash and a ring of light at the peak, then the
  // card settles, its level written (Transcendance I, II, III). Resolves when it has settled. ════════
  const say = (c: LegacyCard, txt: string, col: string, big = false) =>
    flot(fx, K(c), txt, col, big);
  function transcend(c: LegacyCard, level: number): Promise<void> {
    const B = K(c),
      S = B.w / 280,
      lv = Math.max(1, Math.min(3, level)),
      T = 2.4;
    const motes = Array.from({ length: 22 + 10 * lv }, () => ({
      x: R(-0.6, 0.6),
      d: R(0, 1.4),
      v: R(0.35, 0.8),
      s: R(2, 5) * S,
    }));
    void nudge(c, [0, -0.06 * B.h], [0, 0], 1600);
    say(c, `Transcendance ${['I', 'II', 'III'][lv - 1]} !`, '#fef3c7', true);
    return fx.add(T, (x, t) => {
      const on = Math.min(1, t / 0.35) * (1 - cl((t - 1.9) / 0.5)),
        hx = B.cx,
        hy = B.y - B.h * 0.06;
      x.save();
      x.globalCompositeOperation = 'lighter';
      // the pillar from above, soft-edged
      const pw = B.w * (0.7 + 0.12 * lv) * (0.92 + 0.08 * Math.sin(t * 9));
      x.globalAlpha = 0.55 * on;
      x.drawImage(nspr('#ffe08a'), B.cx - pw / 2, -B.h * 0.4, pw, B.y + B.h * 1.25);
      x.globalAlpha = 0.5 * on;
      x.drawImage(nspr('#fffbe8'), B.cx - pw * 0.18, -B.h * 0.4, pw * 0.36, B.y + B.h * 1.05);
      // rays turning behind the card
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.5;
        x.globalAlpha = 0.08 * on;
        x.fillStyle = '#ffe9a8';
        x.beginPath();
        x.moveTo(B.cx, B.cy);
        x.arc(B.cx, B.cy, B.h * (0.5 + 0.1 * lv), a, a + 0.1);
        x.closePath();
        x.fill();
      }
      // the motes climbing
      for (const m of motes) {
        const k = (t * m.v + m.d) % 1.4;
        x.globalAlpha = on * Math.sin((Math.PI * k) / 1.4);
        const px = B.cx + m.x * B.w,
          py = B.y + B.h * (1 - k);
        x.drawImage(nspr('#fde68a'), px - m.s * 2, py - m.s * 2, m.s * 4, m.s * 4);
      }
      // the halo over the card
      const hr = B.w * 0.32 * ez(Math.min(1, t / 0.6));
      x.globalAlpha = on;
      x.strokeStyle = '#fff3c4';
      x.lineWidth = (6 + 2 * lv) * S;
      x.shadowColor = '#fcd34d';
      x.shadowBlur = 24 * S;
      x.beginPath();
      x.ellipse(hx, hy, hr, hr * 0.26, 0, 0, Math.PI * 2);
      x.stroke();
      x.shadowBlur = 0;
      // the flash and the ring at the peak
      const p = cl((t - 0.55) / 0.6);
      if (p > 0 && p < 1) {
        x.globalAlpha = 0.9 * (1 - p);
        const fr = B.w * (0.4 + 0.5 * p);
        x.drawImage(nspr('#fffbe6'), B.cx - fr, B.cy - fr, fr * 2, fr * 2);
        x.strokeStyle = `rgba(255,236,170,${1 - p})`;
        x.lineWidth = 5 * S * (1 - p) + 1;
        x.beginPath();
        x.arc(B.cx, B.cy, B.w * 0.2 + B.w * (0.7 + 0.2 * lv) * ez(p), 0, Math.PI * 2);
        x.stroke();
      }
      x.restore();
      x.globalAlpha = 1;
    });
  }

  // ════════ THE LIGHTNING'S BOUNCE (nRebond, modernised): from the bottom of the fighter, a jagged
  // yellow bolt leaps to its own magic or trap (face down or not), flickering three times, with a flash
  // where it lands. Then: nothing to strike (grey sparks), the card charged (a crackle of small arcs
  // runs around it for a while), or a charged card struck again (a big flash, it is destroyed: the
  // caller breaks it). Resolves when the bolt has landed. ════════
  function rebond(from: LegacyCard, to: LegacyCard, result: string, slot: string): Promise<void> {
    const A = K(from),
      B = K(to),
      S = A.w / 280,
      x0 = A.cx,
      y0 = A.y + A.h * 0.82,
      x1 = B.cx,
      y1 = B.cy;
    const zig = (seed: number) => {
      const pts: [number, number][] = [[x0, y0]],
        n = 9,
        len = Math.hypot(x1 - x0, y1 - y0),
        nx = -(y1 - y0) / len,
        ny = (x1 - x0) / len;
      let r = seed;
      const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280 - 0.5;
      for (let i = 1; i < n; i++) {
        const k = i / n,
          off = rnd() * len * 0.12 * Math.sin(Math.PI * k);
        pts.push([x0 + (x1 - x0) * k + nx * off, y0 + (y1 - y0) * k + ny * off]);
      }
      pts.push([x1, y1]);
      return pts;
    };
    const sparks = Array.from({ length: 18 }, () => ({
      a: R(0, 6.283),
      v: R(120, 360) * S,
      s: R(1.5, 3) * S,
    }));
    const grey = result === 'empty',
      gone = result === 'destroyed',
      charged = result === 'charged';
    if (!grey)
      say(
        from,
        slot === 'magie'
          ? gone
            ? 'Magie détruite !'
            : 'Magie chargée'
          : gone
            ? 'Piège détruit !'
            : 'Piège chargé',
        '#fde047',
        gone,
      );
    let landed: () => void = () => {};
    const done = new Promise<void>((r) => (landed = r));
    let hit = false;
    void fx.add(charged ? 3.2 : 1.1, (x, t) => {
      x.save();
      x.globalCompositeOperation = 'lighter';
      x.lineCap = 'round';
      x.lineJoin = 'round';
      // the bolt, three flickers
      if (t < 0.45) {
        const pts = zig(Math.floor(t * 30) + 1);
        const reach = Math.min(1, t / 0.08);
        const m = Math.max(1, Math.floor(pts.length * reach));
        for (const [col, w, al] of [
          ['#a16207', 14, 0.25],
          ['#fde047', 6, 0.8],
          ['#ffffff', 2.2, 1],
        ] as const) {
          x.globalAlpha = al * (0.6 + 0.4 * Math.sin(t * 70));
          x.strokeStyle = col;
          x.lineWidth = w * S;
          x.beginPath();
          pts.slice(0, m).forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
          x.stroke();
        }
      }
      if (t >= 0.08 && !hit) {
        hit = true;
        landed();
      }
      // where it lands
      const h = t - 0.08;
      if (h > 0 && h < 0.5) {
        const fr = B.w * (gone ? 1.1 : 0.6) * ez(Math.min(1, h / 0.2));
        x.globalAlpha = (gone ? 1 : 0.8) * (1 - h / 0.5);
        x.drawImage(nspr(grey ? '#a3a3a3' : '#fef08a'), x1 - fr, y1 - fr, fr * 2, fr * 2);
        for (const p of sparks) {
          const d = p.v * h;
          x.globalAlpha = 1 - h / 0.5;
          x.strokeStyle = grey ? '#a3a3a3' : '#fde047';
          x.lineWidth = p.s;
          x.beginPath();
          x.moveTo(x1 + Math.cos(p.a) * d, y1 + Math.sin(p.a) * d);
          x.lineTo(x1 + Math.cos(p.a) * (d + 10 * S), y1 + Math.sin(p.a) * (d + 10 * S));
          x.stroke();
        }
      }
      // the charge: small arcs crackling around the card, fading
      if (charged && h > 0.15) {
        const fade = 1 - cl((h - 2.4) / 0.7);
        for (let i = 0; i < 3; i++) {
          if (Math.random() < 0.45) continue;
          const side = Math.floor(Math.random() * 4),
            u = Math.random();
          const px = side < 2 ? B.x + u * B.w : side === 2 ? B.x : B.x + B.w,
            py = side < 2 ? (side === 0 ? B.y : B.y + B.h) : B.y + u * B.h;
          x.globalAlpha = 0.9 * fade;
          x.strokeStyle = Math.random() < 0.5 ? '#fde047' : '#ffffff';
          x.lineWidth = 1.8 * S;
          x.beginPath();
          x.moveTo(px, py);
          let qx = px,
            qy = py;
          for (let k = 0; k < 4; k++) {
            qx += R(-12, 12) * S;
            qy += R(-12, 12) * S;
            x.lineTo(qx, qy);
          }
          x.stroke();
        }
        x.globalAlpha = 0.18 * fade * (0.6 + 0.4 * Math.sin(t * 12));
        x.drawImage(nspr('#fde047'), B.x - B.w * 0.2, B.y - B.h * 0.1, B.w * 1.4, B.h * 1.2);
      }
      x.restore();
      x.globalAlpha = 1;
    });
    return done;
  }

  // ════════ THE CHARM AND THE SKINS (original/contact.ts): played on the canvas, the cards jolted ════════
  // Plays a moment; resolves at its `at` (the impact), or at its end.
  function play(m: Moment, impact?: () => void): Promise<void> {
    let hit: () => void = () => {};
    const at = new Promise<void>((r) => (hit = r));
    let fired = false;
    const done = fx.add(m.dur, (x, t, u) => {
      m.draw(x, t, u);
      if (!fired && m.at !== undefined && t >= m.at) {
        fired = true;
        impact?.();
        hit();
      }
    });
    return m.at === undefined ? done : at;
  }
  const SKIN_KINDS = ['brulure', 'saignement', 'gel', 'poison', 'malediction', 'fracture', 'foudre'];
  const skinKind = (k: unknown): SkinKind =>
    (SKIN_KINDS.includes(String(k)) ? String(k) : 'brulure') as SkinKind;

  return {
    isCut,
    // a charm thrown by side `from` on side `to`: resolves when the heart locks around the target
    charm(from: 0 | 1, to: 0 | 1): Promise<void> {
      const a = NFX.cards[from],
        b = NFX.cards[to];
      if (!a || !b) return Promise.resolve();
      return play(charmCast(K(a), K(b)), () => void nudge(b, [0, -6], [0, 2], 420));
    },
    // side `from`, charmed, holds back its blow on side `to` (pct: the share it keeps)
    charmHeld(from: 0 | 1, to: 0 | 1, pct: number): Promise<void> {
      const a = NFX.cards[from],
        b = NFX.cards[to];
      if (!a || !b) return Promise.resolve();
      const dir = Math.sign(K(b).cx - K(a).cx) || 1;
      void nudge(a, [-dir * 6, 0], [dir * 3, 0], 380);
      return play(charmHeld(K(a), K(b), pct));
    },
    // side `from`'s skin touched by side `to`: it flares and strikes back; resolves at the impact
    skinContact(from: 0 | 1, to: 0 | 1, kind: unknown): Promise<void> {
      const h = NFX.cards[from],
        a = NFX.cards[to];
      if (!h || !a) return Promise.resolve();
      const dir = Math.sign(K(a).cx - K(h).cx) || 1;
      return play(skinContact(K(h), K(a), skinKind(kind)), () => {
        void nudge(a, [dir * 12, -3], [-dir * 4, 1], 360);
      });
    },
    /** The two fighters, for the link and the mist (the scene sets them after each deal or relay). */
    setFighters(a: LegacyCard | null, b: LegacyCard | null) {
      NFX.cards = [a, b];
    },
    fracture: (c: LegacyCard) => os(c),
    // a programmed effect: its gear forms and drops to the slots; the activation's circuits
    programGear: (c: LegacyCard, ultimate: boolean) => progGear(c, ultimate),
    programActivate: (c: LegacyCard) => activFx(c),
    // the card breaks (the legacy's briser); resolves once it has burst, its pieces still falling
    shatter: (c: LegacyCard) => briser(c),
    ultimate: (c: LegacyCard) => aura(c),
    // the breath of side `from` on side `to`, of an element (the engine's: brulure, gel, foudre…)
    breath(from: 0 | 1, to: 0 | 1, el: string) {
      const a = NFX.cards[from],
        b = NFX.cards[to];
      if (a && b) void souffle(a, b, el);
    },
    // the laser of side `from` on side `to` (pct: the target's life, in %); resolves at the impact
    laser(from: 0 | 1, to: 0 | 1, pct: number): Promise<void> {
      const a = NFX.cards[from],
        b = NFX.cards[to];
      return a && b ? tirLaser(a, b, pct) : Promise.resolve();
    },
    markBlade: (c: LegacyCard, n: number) => lameIn(c, n),
    marksDown: (c: LegacyCard, n: number) => lamesOff(c, n),
    execute: (c: LegacyCard) => executionFx(c),
    reformCut: (c: LegacyCard) => reformeCoupe(c),
    sliceTrap: (c: LegacyCard) => trancher(c),
    // the lightning's bounce from side `from`'s fighter to its card `to` (magic or trap)
    bounce(from: 0 | 1, to: LegacyCard, result: string, slot: string): Promise<void> {
      const a = NFX.cards[from];
      return a ? rebond(a, to, result, slot) : Promise.resolve();
    },
    swallow: (a: LegacyCard, v: LegacyCard) => avalerFx(a, v),
    chew: async (
      a: LegacyCard,
      n: number,
      max: number,
      dmg: number | null,
      victim: LegacyCard | null,
    ) => {
      await macherFx(a, n, max);
      if (dmg !== null && victim) flot(fx, K(a), '-' + dmg, '#ff6a6a');
      await wait(300);
    },
    spit: (a: LegacyCard, v: LegacyCard) => recracherFx(a, v),
    passStatuses: (a: LegacyCard, from: LegacyCard, ks: readonly string[]) =>
      transfertFx(a, from, ks),
    say: (c: LegacyCard, txt: string, col: string, big = false) => flot(fx, K(c), txt, col, big),
    transcend: (c: LegacyCard, level: number) => transcend(c, level),
    // the mist: level 1 (it turns), 2 (the turned wind)
    mist(c: 0 | 1, lv: number) {
      nfxStart();
      NFX.mist[c] = lv;
      const b = nbox(c);
      if (b) nring(b.cx, b.cy, b.w * 0.3, b.w * 0.9, 'rgba(225,235,245,.6)', 3, 40);
      const card = NFX.cards[c];
      if (card) flot(fx, K(card), lv > 1 ? 'Vent tourné' : 'Brume', '#e2e8f0');
    },
    mistEnd(c: 0 | 1) {
      NFX.mist[c] = 0;
    },
    mistBlocks(c: 0 | 1, s: unknown) {
      nfxStart();
      const b = nbox(c);
      if (b) {
        for (let i = 0; i < 10; i++)
          nadd({
            k: 'puff',
            x: b.cx + R(-1, 1) * b.w * 0.4,
            y: b.cy + R(-1, 1) * b.h * 0.3,
            vx: R(-1.5, 1.5),
            vy: R(-1.5, 1.5),
            s: R(0.1, 0.18) * b.w,
            life: 40,
          });
        nburst(b.cx, b.cy, 14, stCol(s), 2, 2, 30);
      }
      const card = NFX.cards[c];
      if (card) flot(fx, K(card), 'Dissipé', '#e2e8f0');
    },
    async mistReturns(c: 0 | 1, to: 0 | 1, s: unknown) {
      const card = NFX.cards[c];
      if (card) flot(fx, K(card), 'Renvoyé !', '#e2e8f0');
      const col = NST_COL[ST_KEY[String(s)] ?? String(s)] ?? '#b35cff';
      const p = await ntir(c, to, col);
      if (p) nburst(p.x, p.y, 24, col, 4, 3);
    },
    // the parasitic link: a tendril of flesh between the bearer and the other card
    link(c: 0 | 1, to: 0 | 1 | null, on: boolean, nb: number) {
      if (!on || nb === 0) {
        if (NFX.lien && NFX.lien.c === c) NFX.lien = null;
        return;
      }
      nfxStart();
      if (NFX.lien && NFX.lien.c === c && to === null) {
        NFX.lien.n = nb;
        return;
      }
      NFX.lien = { c, to: to ?? (c === 0 ? 1 : 0), n: nb || 1 };
      NFX.B = [nbox(0), nbox(1)];
      for (let i = 0; i <= 10; i++) {
        const q = ntendril(i / 10);
        if (q) nburst(q.x, q.y, 4, '#c33558', 2, 2, 30);
      }
      const card = NFX.cards[c];
      if (card)
        flot(
          fx,
          K(card),
          (nb || 1) > 1 ? 'Lien parasitaire ×' + nb : 'Lien parasitaire',
          '#fda4af',
        );
    },
    // a heal shared: it runs up the tendril one way or the other, spread over each strand
    async linkHeal(healed: 0 | 1) {
      if (!NFX.lien) return;
      nfxStart();
      const rev = NFX.lien.c !== healed;
      const nb = Math.min(4, NFX.lien.n || 1),
        tot = nb > 1 ? 10 + 6 * nb : 14;
      for (let i = 0; i < tot; i++)
        setTimeout(
          () =>
            nadd({
              k: 'path',
              sp: 0,
              rev,
              j: i % nb,
              v: R(0.018, 0.026),
              s: R(0.25, 0.45) * vh(),
              life: 999,
            }),
          i * (nb > 1 ? 30 : 45),
        );
      await wait(1000);
    },
    reset() {
      NFX.mist = [0, 0];
      NFX.lien = null;
      NFX.P.length = 0;
      for (const o of NFX.O) o.res(null);
      NFX.O.length = 0;
    },
  };
}
