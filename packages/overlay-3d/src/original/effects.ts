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
import { boxOf, cl, ez, flot, nspr, orb, R, rr, svgTexture, type Box, type LegacyCanvas } from './fx.ts';

/** What the legacy effects need of a card: its root (the scene moves it), its face, its box. */
export type LegacyCard = { root: Container; front: Container; box: { x: number; w: number } };

const K = (c: LegacyCard): Box => boxOf(c.front);

// ---- moving a card's face like the legacy's Element.animate ------------------------------------------

type Pose = { x?: number; y?: number; sx?: number; sy?: number; s?: number; rot?: number; a?: number; o?: number };
/**
 * Plays keyframes on a card's face (offsets in screen pixels, rotation in degrees, around its centre),
 * then puts it back. `o` of a keyframe: its offset in 0..1 (evenly spread when omitted).
 */
async function animate(card: LegacyCard, frames: Pose[], ms: number, keep = false): Promise<void> {
  const f = card.front;
  const k = card.root.worldTransform.a || 1; // screen pixels per card unit
  const base = { px: f.pivot.x, py: f.pivot.y, x: f.x, y: f.y, sx: f.scale.x, sy: f.scale.y, r: f.rotation, a: f.alpha };
  f.pivot.set(W / 2, H / 2);
  const at = frames.map((p, i) => p.o ?? i / (frames.length - 1));
  const val = (p: Pose, key: keyof Pose, d: number) => (p[key] ?? (key === 's' ? 1 : d)) as number;
  await tween(
    ms,
    (u) => {
      let i = 0;
      while (i < frames.length - 2 && u > at[i + 1]!) i++;
      const a = frames[i]!,
        b = frames[i + 1]!,
        v = cl((u - at[i]!) / Math.max(1e-6, at[i + 1]! - at[i]!));
      const L = (key: keyof Pose, d: number) => val(a, key, d) + (val(b, key, d) - val(a, key, d)) * v;
      const s = L('s', 1);
      f.position.set(base.x + W / 2 + L('x', 0) / k, base.y + H / 2 + L('y', 0) / k);
      f.scale.set(base.sx * s * L('sx', 1), base.sy * s * L('sy', 1));
      f.rotation = base.r + (L('rot', 0) * Math.PI) / 180;
      f.alpha = base.a * L('a', 1);
    },
    'linear',
    f,
  );
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
function faceCanvas(app: Application, c: LegacyCard): HTMLCanvasElement {
  return app.renderer.extract.canvas({ target: c.front, resolution: 1 }) as HTMLCanvasElement;
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
    function demi(x: CanvasRenderingContext2D, sd: number, off: number, rot: number, dy: number, a: number) {
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
        orb(x, k.cx, k.cy, k.w * 0.5, `rgba(255,255,255,${0.7 * (1 - cl((t - 0.6) / 0.25))})`, 'rgba(255,255,255,0)');
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
          x.lineTo(k.cx + Math.cos(an) * (r0 + k.w * 0.09), k.cy + Math.sin(an) * (r0 + k.w * 0.09));
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
  const LAME_BOX = { 1: [0.04, -0.16, 0.19, 0.44], 2: [0.77, -0.16, 0.19, 0.44], 3: [0.34, -0.34, 0.32, 0.9] } as const;

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
    const blade = new Sprite({ texture: await svgTexture(svgLame(big), 80, 320), anchor: { x: 0.5, y: 1 } });
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
      Sp = Array.from({ length: big ? 26 : 12 }, () => ({ a: R(-3.1, 0), v: R(0.3, 1), s: R(1.5, 3.5) }));
    void nudge(c, [big ? -9 : -4, big ? 6 : 3], [big ? 8 : 3, big ? -4 : -2], big ? 320 : 200);
    void fx.add(big ? 1.1 : 0.7, (x, t, u) => {
      const al = 1 - u;
      x.globalCompositeOperation = 'lighter';
      orb(x, tx, tyy, k.w * (big ? 0.5 : 0.22) * (0.4 + 0.6 * ez(cl(t / 0.2))), `rgba(255,60,60,${0.55 * al})`, 'rgba(255,0,0,0)');
      x.globalCompositeOperation = 'source-over';
      for (const p of Sp) {
        const dd = ez(cl(t / 0.5)) * k.w * (big ? 0.45 : 0.25) * p.v;
        x.fillStyle = `rgba(255,${(180 - u * 150) | 0},120,${al})`;
        x.beginPath();
        x.arc(tx + Math.cos(p.a) * dd, tyy + Math.sin(p.a) * dd + u * u * k.h * 0.1, p.s * (1 - u * 0.6), 0, 7);
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
  function moities(x: CanvasRenderingContext2D, k: Box, tex: CanvasImageSource, q: number, al: number, edge: string | null) {
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
      moities(x, k, tex, q, al, `rgba(255,${60 + Math.round(140 * (1 - cl(t / 0.9)))},60,${(1 - cl(t / 1.1)) * al})`);
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
      orb(x, k.cx, k.cy, k.h * 0.7, `rgba(140,255,170,${0.45 * Math.sin(Math.PI * cl(t / 2.1))})`, 'rgba(60,200,120,0)');
      x.globalCompositeOperation = 'source-over';
      if (t < 1.55) {
        const p = cl(t / 1.3),
          q = 1 - ez(p);
        moities(x, k, tex, q, Math.min(1, p * 2.5), p > 0.75 ? `rgba(190,255,200,${(1 - cl((p - 0.75) / 0.25)) * 0.9 + 0.1})` : null);
      }
      if (t > 1.4) {
        const u = cl((t - 1.4) / 0.65);
        x.globalCompositeOperation = 'lighter';
        orb(x, k.cx, k.cy, k.w * (0.35 + 0.8 * u), `rgba(255,255,215,${0.8 * (1 - u)})`, 'rgba(150,255,170,0)');
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
      moities(x, k, tex, q, al, `rgba(255,${60 + Math.round(140 * (1 - cl(t / 0.9)))},60,${(1 - cl(t / 1.1)) * al})`);
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
    void animate(a, [{}, { x: -dir * 10, s: 1.06, rot: -dir * 3, o: 0.6 }, { x: dir * 8, s: 1.02 }], 420);
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
        pts.push({ x: O.x + dx * q + nx * ondule, y: O.y + dy * q + ny * ondule + tombe, w: th * (1 - 0.28 * q) });
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
        orb(x, T.x, T.y, Kv.w * 0.55, `rgba(255,120,170,${0.45 * (1 - (u - tA) / (tB + 0.06 - tA))})`, 'rgba(255,0,80,0)');
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
    void animate(a, [{}, { sx: 1.16, sy: 0.86, o: 0.25 }, { sx: 0.93, sy: 1.08, o: 0.5 }, { sx: 1.05, sy: 0.96, o: 0.75 }, {}], 620);
    flot(fx, Ka, 'GLOUPS !', '#f472b6', true);
    const Sp = Array.from({ length: 22 }, () => ({ a: R(-Math.PI, 0), v: R(0.4, 1), s: R(2, 5) }));
    void fx.add(0.9, (x, t, u) => {
      x.save();
      for (const p of Sp) {
        const dd = ez(cl(t / 0.5)) * Ka.w * 0.5 * p.v;
        x.fillStyle = `rgba(255,${190 + ((p.s * 10) | 0)},225,${1 - u})`;
        x.beginPath();
        x.arc(O.x + Math.cos(p.a) * dd, O.y + Math.sin(p.a) * dd + u * u * Ka.h * 0.25, p.s * (1 - u * 0.5), 0, 7);
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
      b.pts.circle(cx, 0, r).fill(i < n ? 0xf472b6 : 0x3b0b1c).stroke({ color: 0xf9a8d4, width: r * 0.25 });
    }
  }

  // the chewing: two rows of teeth close twice, crumbs fly
  async function macherFx(a: LegacyCard, n: number, max: number): Promise<void> {
    const k = K(a);
    const bw = a.box.w,
      bx = a.box.x;
    const rang = (haut: boolean) =>
      `<svg viewBox="0 0 200 60" preserveAspectRatio="none"><path d="M0,0 H200 V26 Q100,38 0,26 Z" fill="#7a1230"/>` +
      Array.from({ length: 8 }, (_, i) => `<path d="M${i * 25 + 2},27 L${i * 25 + 12.5},58 L${i * 25 + 23},27 Z" fill="#fffbeb" stroke="#d6c7a1" stroke-width="1.5"/>`).join('') +
      `</svg>` + (haut ? '' : '');
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
    void animate(a, [{}, { sx: 1.05, sy: 0.93, o: 0.22 }, { o: 0.42 }, { sx: 1.05, sy: 0.93, o: 0.64 }, {}], 900);
    const bl = bellies.get(a.root);
    if (bl) {
      const h0 = bl.holder;
      void tween(700, (u) => void (h0.rotation = (Math.sin(u * Math.PI * 2) * -12 * (1 - u) * Math.PI) / 180), 'linear', h0);
    }
    setTimeout(() => {
      flot(fx, k, 'CRUNCH !', '#fde68a', true);
      const cx = k.cx,
        cy = k.cy,
        cols = ['#fde68a', '#f59e0b', '#b45309', '#fca5a5'],
        Pp = Array.from({ length: 26 }, () => ({ a: R(0, Math.PI * 2), v: R(0.3, 1), s: R(2, 5), c: cols[(Math.random() * 4) | 0]! }));
      void fx.add(1, (x, t, u) => {
        x.save();
        for (const p of Pp) {
          const dd = ez(cl(t / 0.45)) * k.w * 0.55 * p.v;
          x.fillStyle = p.c;
          x.globalAlpha = 1 - u;
          x.beginPath();
          x.rect(cx + Math.cos(p.a) * dd, cy + Math.sin(p.a) * dd * 0.7 + u * u * k.h * 0.35, p.s, p.s);
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
    void animate(a, [{}, { sx: 0.9, sy: 1.12, o: 0.45 }, { sx: 1.14, sy: 0.88, x: dir * 6, o: 0.7 }, {}], 700);
    const b = bellies.get(a.root);
    if (b) {
      bellies.delete(a.root);
      void tween(450, (u) => void b.holder.scale.set(u < 0.5 ? 1 + 0.35 * (u / 0.5) : 1.35 * (1 - (u - 0.5) / 0.5)), 'linear', b.holder).finally(() => {
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
  async function transfertFx(a: LegacyCard, from: LegacyCard, ks: readonly string[]): Promise<void> {
    const Ka = K(a),
      Kf = boxOf(from.front);
    const COL: Record<string, string> = { brulure: '#fb923c', poison: '#4ade80', gel: '#7dd3fc', malediction: '#c084fc', saignement: '#ef4444', fatigue: '#94a3b8' };
    const B = ks.flatMap((k) => Array.from({ length: 6 }, () => ({ c: COL[k] ?? '#fff', d: R(0, 0.35), o: R(-1, 1) })));
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
    k: string; t: number; life: number; x: number; y: number; vx: number; vy: number; s: number; a: number;
    r: number; w: number; c: number; sp: number; v: number; j: number; rev: boolean; g: number; r0: number;
    r1: number; col: string;
  };
  const P0: Omit<P, 'k' | 'life'> = { t: 0, x: 0, y: 0, vx: 0, vy: 0, s: 0, a: 0, r: 0, w: 0, c: 0, sp: 0, v: 0, j: 0, rev: false, g: 0, r0: 0, r1: 0, col: '#fff' };
  const NFX = {
    t: 0,
    mist: [0, 0] as number[],
    lien: null as null | { c: 0 | 1; to: 0 | 1; n: number },
    P: [] as P[],
    O: [] as { from: () => { x: number; y: number } | null; to: () => { x: number; y: number } | null; col: string; t: number; dur: number; arc: number; res: (p: { x: number; y: number } | null) => void }[],
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
      nadd({ k: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: R(0.6, 1.4) * sz, col, g, life: life * R(0.7, 1.2) });
    }
  }
  const nring = (x: number, y: number, r0: number, r1: number, col: string, w = 3, life = 30) => nadd({ k: 'ring', x, y, r0, r1, col, w, life });
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
      y: y0 + (y1 - y0) * s + env * A.h * (j % 2 ? -sag : sag) + Math.sin(s * 16 - NFX.t * 0.09 + j * 2.1) * 0.7 * vh() * env,
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
          nadd({ k: 'fog', c, a: R(0, 6.283), r: R(0.45, 0.75), w: lv > 1 ? R(0.035, 0.055) : R(0.003, 0.008) * (Math.random() < 0.5 ? 1 : -1), s: R(0.22, 0.36) * b.w, life: R(120, 170) });
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
        const q = ntendril(p.rev ? 1 - p.sp : p.sp, Math.min(p.j || 0, Math.min(4, NFX.lien.n || 1) - 1));
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
      if (NFX.t % 2 === 0) nadd({ k: 'dot', x: px + R(-3, 3), y: py + R(-3, 3), vx: R(-0.4, 0.4), vy: R(-0.4, 0.4), s: R(1.5, 3), col: o.col, life: 22 });
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
    return new Promise((res) => NFX.O.push({ from: ncentre(from), to: ncentre(to), col, t: 0, dur: 45, arc: vh() * 6, res }));
  }
  const NST_COL: Record<string, string> = { curse: '#c084fc', bleed: '#ef4444', poison: '#22c55e', burn: '#f97316', frost: '#7dd3fc', knell: '#a78bfa', fracture: '#fde68a', stun: '#facc15', fatigue: '#94a3b8', parasite: '#e0607e' };
  // the journal's status kinds, as the legacy named their colours
  const ST_KEY: Record<string, string> = { malediction: 'curse', saignement: 'bleed', poison: 'poison', brulure: 'burn', gel: 'frost', glas: 'knell', fracture: 'fracture', etourdi: 'stun', fatigue: 'fatigue', lien: 'parasite' };
  const stCol = (s: unknown) => NST_COL[ST_KEY[String(s)] ?? String(s)] ?? '#c9a0ff';

  return {
    isCut,
    /** The two fighters, for the link and the mist (the scene sets them after each deal or relay). */
    setFighters(a: LegacyCard | null, b: LegacyCard | null) {
      NFX.cards = [a, b];
    },
    fracture: (c: LegacyCard) => os(c),
    markBlade: (c: LegacyCard, n: number) => lameIn(c, n),
    marksDown: (c: LegacyCard, n: number) => lamesOff(c, n),
    execute: (c: LegacyCard) => executionFx(c),
    reformCut: (c: LegacyCard) => reformeCoupe(c),
    sliceTrap: (c: LegacyCard) => trancher(c),
    swallow: (a: LegacyCard, v: LegacyCard) => avalerFx(a, v),
    chew: async (a: LegacyCard, n: number, max: number, dmg: number | null, victim: LegacyCard | null) => {
      await macherFx(a, n, max);
      if (dmg !== null && victim) flot(fx, K(a), '-' + dmg, '#ff6a6a');
      await wait(300);
    },
    spit: (a: LegacyCard, v: LegacyCard) => recracherFx(a, v),
    passStatuses: (a: LegacyCard, from: LegacyCard, ks: readonly string[]) => transfertFx(a, from, ks),
    say: (c: LegacyCard, txt: string, col: string, big = false) => flot(fx, K(c), txt, col, big),
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
          nadd({ k: 'puff', x: b.cx + R(-1, 1) * b.w * 0.4, y: b.cy + R(-1, 1) * b.h * 0.3, vx: R(-1.5, 1.5), vy: R(-1.5, 1.5), s: R(0.1, 0.18) * b.w, life: 40 });
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
      if (card) flot(fx, K(card), (nb || 1) > 1 ? 'Lien parasitaire ×' + nb : 'Lien parasitaire', '#fda4af');
    },
    // a heal shared: it runs up the tendril one way or the other, spread over each strand
    async linkHeal(healed: 0 | 1) {
      if (!NFX.lien) return;
      nfxStart();
      const rev = NFX.lien.c !== healed;
      const nb = Math.min(4, NFX.lien.n || 1),
        tot = nb > 1 ? 10 + 6 * nb : 14;
      for (let i = 0; i < tot; i++)
        setTimeout(() => nadd({ k: 'path', sp: 0, rev, j: i % nb, v: R(0.018, 0.026), s: R(0.25, 0.45) * vh(), life: 999 }), i * (nb > 1 ? 30 : 45));
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
