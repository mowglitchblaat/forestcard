// The moments of the charm and the skins (November 2026), drawn on the legacy's Canvas 2D (fx.ts) like
// the laser and the breath: a charm thrown, a charmed blow held back, the contact of a skin. Pure
// drawings: each returns its duration and its draw(x, t, u); effects.ts plays them on its canvas, moves
// the cards (nudge) and finds them on screen (Box).
//
// Cost: a few dozen sprites and paths a frame, only while the moment runs; the soft sprites come from
// nspr() (drawn once, shared).

import { cl, ez, nspr, R, type Box, type Draw } from './fx.ts';

export type Moment = { dur: number; draw: Draw; at?: number };

// A heart path, its point at (0, 0) and its top near -s (y down).
function heart(x: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  x.beginPath();
  x.moveTo(cx, cy);
  x.bezierCurveTo(cx - s * 1.1, cy - s * 0.55, cx - s * 0.65, cy - s * 1.35, cx, cy - s * 0.9);
  x.bezierCurveTo(cx + s * 0.65, cy - s * 1.35, cx + s * 1.1, cy - s * 0.55, cx, cy);
  x.closePath();
}
function fillHeart(
  x: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  col: string,
  alpha: number,
): void {
  if (alpha <= 0 || s <= 0) return;
  x.globalAlpha = alpha;
  x.fillStyle = col;
  heart(x, cx, cy + s * 0.45, s);
  x.fill();
  // its shine
  x.globalAlpha = alpha * 0.7;
  x.fillStyle = '#fff';
  x.beginPath();
  x.ellipse(cx - s * 0.32, cy - s * 0.12, s * 0.16, s * 0.1, -0.6, 0, 7);
  x.fill();
}

// ════════ THE CHARM THROWN: the caster blows a ribbon of hearts that spirals to the target; around
// the target a big heart closes like a lock (it beats twice, a click of light), small hearts burst and
// drift up. Resolves when the lock closes (at). ════════
export function charmCast(A: Box, B: Box): Moment {
  const S = A.w / 280;
  const hearts = Array.from({ length: 26 }, (_, i) => ({
    d: i * 0.022 + R(0, 0.05),
    ph: R(0, 6.28),
    s: R(11, 21) * S,
    w: R(14, 34) * S,
    c: Math.random() < 0.3 ? '#fda4af' : Math.random() < 0.5 ? '#f472b6' : '#ec4899',
  }));
  const pops = Array.from({ length: 22 }, () => ({
    a: R(0, 6.28),
    v: R(90, 260) * S,
    s: R(6, 13) * S,
    t0: R(0, 0.15),
  }));
  const FLY = 0.7,
    LOCK = FLY + 0.35;
  return {
    dur: 2.2,
    at: LOCK,
    draw(x, t) {
      x.save();
      x.globalCompositeOperation = 'lighter';
      // the caster's breath: a pink glow at its edge
      const dir = Math.sign(B.cx - A.cx) || 1;
      const x0 = A.cx + dir * A.w * 0.35,
        y0 = A.cy - A.h * 0.12;
      if (t < FLY + 0.2) {
        const g = Math.sin(Math.PI * cl(t / (FLY + 0.2)));
        x.globalAlpha = 0.8 * g;
        const r = A.w * 0.35;
        x.drawImage(nspr('#f472b6'), x0 - r, y0 - r, r * 2, r * 2);
      }
      x.globalCompositeOperation = 'source-over';
      // the ribbon of hearts, spiralling along the way
      for (const h of hearts) {
        const k = cl((t - h.d) / FLY);
        if (k <= 0 || k >= 1) continue;
        const e = ez(k);
        const px = x0 + (B.cx - x0) * e,
          py = y0 + (B.cy - y0) * e - Math.sin(Math.PI * e) * A.h * 0.18;
        const sw = Math.sin(e * 9 + h.ph) * h.w * Math.sin(Math.PI * e);
        fillHeart(x, px, py + sw, h.s * (0.6 + 0.6 * Math.sin(Math.PI * k)), h.c, 0.95);
      }
      // the lock: a big heart outline closing around the target, beating
      if (t > FLY - 0.1) {
        const k = cl((t - FLY + 0.1) / 0.35);
        const fade = 1 - cl((t - 1.6) / 0.6);
        const beat = 1 + 0.08 * Math.sin(cl((t - LOCK) / 0.6) * Math.PI * 4) * (t > LOCK ? 1 : 0);
        const s = B.w * (1.6 - 0.95 * ez(k)) * beat;
        x.globalAlpha = 0.9 * fade * k;
        x.lineWidth = 7 * S;
        x.strokeStyle = '#f9a8d4';
        x.shadowColor = '#ec4899';
        x.shadowBlur = 24 * S;
        heart(x, B.cx, B.cy + s * 0.48, s);
        x.stroke();
        x.lineWidth = 2.5 * S;
        x.strokeStyle = '#fff';
        x.stroke();
        x.shadowBlur = 0;
        // the click of light when it closes
        if (t > LOCK && t < LOCK + 0.3) {
          const q = (t - LOCK) / 0.3;
          x.globalCompositeOperation = 'lighter';
          x.globalAlpha = (1 - q) * 0.9;
          const r = B.w * (0.3 + 0.5 * q);
          x.drawImage(nspr('#f9a8d4'), B.cx - r, B.cy - r, r * 2, r * 2);
          x.globalCompositeOperation = 'source-over';
        }
      }
      // small hearts bursting from the target, drifting up
      for (const p of pops) {
        const q = t - LOCK - p.t0;
        if (q <= 0 || q > 1.1) continue;
        const px = B.cx + Math.cos(p.a) * p.v * ez(cl(q / 0.6)),
          py = B.cy + Math.sin(p.a) * p.v * ez(cl(q / 0.6)) * 0.7 - q * 60 * S;
        fillHeart(x, px, py, p.s, '#f472b6', 1 - q / 1.1);
      }
      x.restore();
      x.globalAlpha = 1;
    },
  };
}

// ════════ A CHARMED BLOW: the charmed attacker's blow goes soft. Over its card, hearts flutter out and
// a dazed swirl turns; toward its target the blow becomes a pink puff that grows weaker the less it
// keeps (pct), and the share it keeps floats up, "♥ 23 %". ════════
export function charmHeld(A: Box, B: Box, pct: number): Moment {
  const S = A.w / 280,
    I = cl(pct / 65);
  const flutter = Array.from({ length: 9 }, () => ({
    a: R(-2.6, -0.5),
    v: R(50, 120) * S,
    s: R(7, 12) * S,
    t0: R(0, 0.25),
  }));
  const puffs = Array.from({ length: 10 }, () => ({ dx: R(-0.5, 0.5), dy: R(-0.4, 0.4), s: R(0.6, 1.2) }));
  return {
    dur: 1.4,
    draw(x, t) {
      x.save();
      // the dazed swirl over the attacker
      const sx = A.cx,
        sy = A.y + A.h * 0.18;
      const sw = cl(t / 0.2) * (1 - cl((t - 1.0) / 0.4));
      x.globalAlpha = 0.85 * sw;
      x.strokeStyle = '#f9a8d4';
      x.lineWidth = 3 * S;
      x.beginPath();
      for (let k = 0; k < 40; k++) {
        const a = k * 0.35 + t * 6,
          r = k * 1.1 * S;
        const px = sx + Math.cos(a) * r * 1.4,
          py = sy + Math.sin(a) * r * 0.5;
        if (k) x.lineTo(px, py);
        else x.moveTo(px, py);
      }
      x.stroke();
      for (const f of flutter) {
        const q = t - f.t0;
        if (q <= 0 || q > 1) continue;
        fillHeart(
          x,
          sx + Math.cos(f.a) * f.v * q + Math.sin(q * 12) * 6 * S,
          sy + Math.sin(f.a) * f.v * q,
          f.s,
          '#f472b6',
          1 - q,
        );
      }
      // the soft blow: a pink puff on the target, as big as the blow it keeps
      const q = cl((t - 0.15) / 0.6);
      if (q > 0 && q < 1) {
        x.globalCompositeOperation = 'lighter';
        for (const p of puffs) {
          const r = B.w * (0.08 + 0.18 * I) * p.s * (0.5 + ez(q));
          x.globalAlpha = (1 - q) * (0.25 + 0.5 * I);
          x.drawImage(
            nspr('#f9a8d4'),
            B.cx + p.dx * B.w * 0.5 * q - r,
            B.cy + p.dy * B.h * 0.3 * q - r,
            r * 2,
            r * 2,
          );
        }
        x.globalCompositeOperation = 'source-over';
      }
      // the share it keeps
      const tq = cl((t - 0.2) / 1.1);
      if (tq > 0 && tq < 1) {
        x.globalAlpha = Math.sin(Math.PI * tq);
        x.font = `900 ${Math.round(30 * S)}px system-ui, sans-serif`;
        x.textAlign = 'center';
        x.lineWidth = 5 * S;
        x.strokeStyle = '#500724';
        const ty = A.y - 8 * S - tq * 30 * S;
        x.strokeText(`♥ ${pct} %`, A.cx, ty);
        x.fillStyle = '#fbcfe8';
        x.fillText(`♥ ${pct} %`, A.cx, ty);
      }
      x.restore();
      x.globalAlpha = 1;
    },
  };
}

// ════════ THE CONTACT OF A SKIN: the moment the attacker's blow touches the skin. On the side of the
// skinned card facing the attacker, its matter flares, then it strikes back: each skin in its own way,
// and it lands on the attacker (at). ════════
export type SkinKind =
  | 'brulure'
  | 'saignement'
  | 'gel'
  | 'poison'
  | 'malediction'
  | 'fracture'
  | 'foudre';

const SKIN_COLORS: Record<SkinKind, [string, string, string]> = {
  // flare, matter, light
  brulure: ['#fb923c', '#ea580c', '#fde68a'],
  saignement: ['#ef4444', '#5b3a1e', '#fecaca'],
  gel: ['#7dd3fc', '#bae6fd', '#ffffff'],
  poison: ['#84cc16', '#365314', '#d9f99d'],
  malediction: ['#a855f7', '#1e0b2e', '#e9d5ff'],
  fracture: ['#d6d3d1', '#57534e', '#fafaf9'],
  foudre: ['#60a5fa', '#1e3a8a', '#e0f2fe'],
};

export function skinContact(H: Box, A: Box, kind: SkinKind): Moment {
  const S = H.w / 280;
  const [flare, matter, light] = SKIN_COLORS[kind];
  const dir = Math.sign(A.cx - H.cx) || 1;
  // where the blow touched: the skinned card's side facing the attacker
  const hx = H.cx + dir * H.w * 0.46,
    hy = H.cy - H.h * 0.05;
  const tx = A.cx - dir * A.w * 0.1,
    ty = A.cy;
  const FLY = 0.32,
    T0 = 0.18;
  const bits = Array.from({ length: 16 }, () => ({
    a: Math.atan2(ty - hy, tx - hx) + R(-0.5, 0.5),
    v: R(0.75, 1.1),
    lift: R(0.02, 0.14),
    off: R(-1, 1),
    s: R(8, 16) * S,
    d: R(0, 0.12),
    spin: R(-8, 8),
  }));
  const splash = Array.from({ length: 18 }, () => ({
    a: R(0, 6.28),
    v: R(60, 200) * S,
    s: R(2, 5) * S,
  }));
  const len = Math.hypot(tx - hx, ty - hy);
  return {
    dur: 1.5,
    at: T0 + FLY,
    draw(x, t) {
      x.save();
      // 1. the skin flares where it was touched
      const f = cl(t / 0.12) * (1 - cl((t - 0.3) / 0.4));
      if (f > 0) {
        x.globalCompositeOperation = 'lighter';
        x.globalAlpha = 0.9 * f;
        const r = H.w * 0.38;
        x.drawImage(nspr(flare), hx - r, hy - r * 1.4, r * 2, r * 2.8);
        x.globalCompositeOperation = 'source-over';
        drawFlare(x, kind, hx, hy, H, S, f, dir, t);
      }
      // 2. it strikes back
      const k = cl((t - T0) / FLY);
      if (k > 0) drawStrike(x, kind, { hx, hy, tx, ty, len, S, k, t, dir, bits, matter, light, flare });
      // 3. it lands on the attacker
      const h = t - T0 - FLY;
      if (h > 0) {
        const q = cl(h / 0.7);
        x.globalCompositeOperation = 'lighter';
        x.globalAlpha = (1 - q) * 0.85;
        const r = A.w * (0.2 + 0.35 * ez(q));
        x.drawImage(nspr(flare), tx - r, ty - r, r * 2, r * 2);
        x.globalCompositeOperation = 'source-over';
        for (const p of splash) {
          const e = ez(cl(h / 0.6));
          if (h > 0.9) break;
          x.globalAlpha = 1 - h / 0.9;
          x.fillStyle = Math.random() < 0.5 ? flare : light;
          x.beginPath();
          x.arc(
            tx + Math.cos(p.a) * p.v * e,
            ty + Math.sin(p.a) * p.v * e + 120 * S * h * h * (kind === 'foudre' ? 0 : 1),
            p.s * (1 - h / 0.9),
            0,
            7,
          );
          x.fill();
        }
        drawLanding(x, kind, tx, ty, A, S, h, flare, light);
      }
      x.restore();
      x.globalAlpha = 1;
    },
  };
}

// What each skin does where it is touched.
function drawFlare(
  x: CanvasRenderingContext2D,
  kind: SkinKind,
  hx: number,
  hy: number,
  H: Box,
  S: number,
  f: number,
  dir: number,
  t: number,
): void {
  const n = 7;
  x.globalAlpha = f;
  for (let i = 0; i < n; i++) {
    const yy = hy + (i - (n - 1) / 2) * H.h * 0.11;
    const out = (18 + 22 * Math.sin(i * 2.3)) * S * f;
    switch (kind) {
      case 'saignement':
      case 'fracture': {
        // thorns, or stone spikes, pushed out of the side
        x.fillStyle = kind === 'saignement' ? '#3f2614' : '#78716c';
        x.beginPath();
        x.moveTo(hx, yy - 9 * S);
        x.lineTo(hx + dir * (out + 16 * S), yy);
        x.lineTo(hx, yy + 9 * S);
        x.fill();
        if (kind === 'saignement') {
          x.fillStyle = '#b91c1c';
          x.beginPath();
          x.arc(hx + dir * (out + 12 * S), yy, 3 * S, 0, 7);
          x.fill();
        }
        break;
      }
      case 'gel': {
        // ice crystals
        x.strokeStyle = '#e0f2fe';
        x.lineWidth = 2.5 * S;
        const cx = hx + dir * out * 0.6,
          r = 10 * S * f;
        for (let a = 0; a < 3; a++) {
          const an = (a * Math.PI) / 3;
          x.beginPath();
          x.moveTo(cx - Math.cos(an) * r, yy - Math.sin(an) * r);
          x.lineTo(cx + Math.cos(an) * r, yy + Math.sin(an) * r);
          x.stroke();
        }
        break;
      }
      case 'foudre': {
        x.strokeStyle = '#bfdbfe';
        x.lineWidth = 2 * S;
        x.beginPath();
        x.moveTo(hx, yy);
        for (let s = 1; s <= 4; s++)
          x.lineTo(hx + dir * (out * s) / 4, yy + R(-10, 10) * S);
        x.stroke();
        break;
      }
      case 'malediction': {
        x.fillStyle = '#2e1065';
        x.beginPath();
        x.arc(hx + dir * out * 0.5, yy + Math.sin(t * 9 + i) * 5 * S, 9 * S * f, 0, 7);
        x.fill();
        break;
      }
      case 'poison': {
        x.fillStyle = '#65a30d';
        x.beginPath();
        x.arc(hx + dir * out * 0.4, yy, (5 + 4 * Math.sin(i)) * S * f, 0, 7);
        x.fill();
        break;
      }
      default: {
        // lava: drops of molten rock bulging out
        x.fillStyle = i % 2 ? '#f97316' : '#fde047';
        x.beginPath();
        x.arc(hx + dir * out * 0.45, yy, (6 + 3 * Math.sin(i * 1.7)) * S * f, 0, 7);
        x.fill();
      }
    }
  }
}

type StrikeCtx = {
  hx: number;
  hy: number;
  tx: number;
  ty: number;
  len: number;
  S: number;
  k: number;
  t: number;
  dir: number;
  bits: { a: number; v: number; lift: number; off: number; s: number; d: number; spin: number }[];
  matter: string;
  light: string;
  flare: string;
};

// How each skin strikes back, from the skinned card to the attacker (k: 0..1 of the way).
function drawStrike(x: CanvasRenderingContext2D, kind: SkinKind, c: StrikeCtx): void {
  const { hx, hy, tx, ty, len, S, k, t, bits } = c;
  const at = (u: number, lift: number) => ({
    x: hx + (tx - hx) * u,
    y: hy + (ty - hy) * u - Math.sin(Math.PI * u) * len * lift,
  });
  if (kind === 'foudre') {
    // an arc that crackles from one card to the other, flickering
    if (k >= 1 && t > 0.9) return;
    const fade = k < 1 ? 1 : 1 - cl((t - 0.55) / 0.35);
    for (const [w, col, al] of [
      [9, '#3b82f6', 0.35],
      [4, '#93c5fd', 0.8],
      [1.6, '#ffffff', 1],
    ] as const) {
      x.globalAlpha = al * fade;
      x.strokeStyle = col;
      x.lineWidth = w * c.S;
      x.beginPath();
      x.moveTo(hx, hy);
      const steps = 10;
      const seed = Math.floor(t * 30);
      for (let s = 1; s <= steps; s++) {
        const u = (s / steps) * k;
        const p = at(u, 0);
        const j = s === steps ? 0 : (Math.sin(seed * 12.9 + s * 78.2) * 43758.5453) % 1;
        x.lineTo(p.x, p.y + j * 26 * S);
      }
      x.stroke();
    }
    return;
  }
  if (kind === 'malediction') {
    // dark wisps crawling over, with a pair of eyes
    for (let i = 0; i < 3; i++) {
      x.globalAlpha = 0.75 * (k < 1 ? 1 : 1 - cl((t - 0.55) / 0.4));
      x.strokeStyle = i === 1 ? '#a855f7' : '#3b0764';
      x.lineWidth = (10 - i * 3) * S;
      x.lineCap = 'round';
      x.beginPath();
      for (let s = 0; s <= 20; s++) {
        const u = (s / 20) * k;
        const p = at(u, 0.08);
        const w = Math.sin(u * 14 - t * 10 + i * 2) * 16 * S * Math.sin(Math.PI * u);
        if (s) x.lineTo(p.x, p.y + w);
        else x.moveTo(p.x, p.y + w);
      }
      x.stroke();
    }
    if (k < 1) {
      const p = at(k, 0.08);
      x.globalAlpha = 1;
      x.fillStyle = '#f0abfc';
      x.beginPath();
      x.arc(p.x - 6 * S, p.y, 3 * S, 0, 7);
      x.arc(p.x + 6 * S, p.y, 3 * S, 0, 7);
      x.fill();
    }
    return;
  }
  // flying bits: lava drops, thorns, ice shards, toxic spit, stone shards
  for (const b of bits) {
    const u = cl((k - b.d) / (1 - b.d)) * b.v;
    if (u <= 0 || u >= 1 || k >= 1) continue;
    // spread across the way, gathering on the target
    const spread = (w: number) => Math.sin(Math.PI * Math.min(1, w * 1.4)) * b.off * 60 * S;
    const p0 = at(u, b.lift),
      q0 = at(Math.max(0, u - 0.06), b.lift);
    const p = { x: p0.x, y: p0.y + spread(u) },
      q = { x: q0.x, y: q0.y + spread(Math.max(0, u - 0.06)) };
    const ang = Math.atan2(p.y - q.y, p.x - q.x);
    x.globalAlpha = 1;
    switch (kind) {
      case 'saignement': {
        // a thorn, its point forward, a drop of blood trailing
        x.save();
        x.translate(p.x, p.y);
        x.rotate(ang);
        x.fillStyle = '#4a2c17';
        x.beginPath();
        x.moveTo(b.s * 1.8, 0);
        x.lineTo(-b.s, -b.s * 0.45);
        x.lineTo(-b.s, b.s * 0.45);
        x.fill();
        x.fillStyle = '#dc2626';
        x.beginPath();
        x.moveTo(b.s * 1.8, 0);
        x.lineTo(b.s * 0.7, -b.s * 0.2);
        x.lineTo(b.s * 0.7, b.s * 0.2);
        x.fill();
        x.restore();
        break;
      }
      case 'gel':
      case 'fracture': {
        // a shard, turning
        x.save();
        x.translate(p.x, p.y);
        x.rotate(ang + t * b.spin);
        x.fillStyle = kind === 'gel' ? '#e0f2fe' : '#a8a29e';
        x.strokeStyle = kind === 'gel' ? '#38bdf8' : '#44403c';
        x.lineWidth = 1.5 * S;
        x.beginPath();
        x.moveTo(b.s * 1.4, 0);
        x.lineTo(0, -b.s * 0.7);
        x.lineTo(-b.s, 0.2 * b.s);
        x.lineTo(0, b.s * 0.6);
        x.closePath();
        x.fill();
        x.stroke();
        x.restore();
        break;
      }
      default: {
        // a drop (lava or venom) with its trail
        const hot = kind === 'brulure';
        x.strokeStyle = hot ? '#f97316' : '#65a30d';
        x.lineWidth = b.s * 0.9;
        x.lineCap = 'round';
        x.globalAlpha = 0.6;
        x.beginPath();
        x.moveTo(q.x, q.y);
        x.lineTo(p.x, p.y);
        x.stroke();
        x.globalAlpha = 1;
        x.fillStyle = hot ? '#fde047' : '#a3e635';
        x.beginPath();
        x.arc(p.x, p.y, b.s * 0.7, 0, 7);
        x.fill();
        if (hot) {
          x.globalCompositeOperation = 'lighter';
          x.globalAlpha = 0.6;
          x.drawImage(nspr('#fb923c'), p.x - b.s * 2.5, p.y - b.s * 2.5, b.s * 5, b.s * 5);
          x.globalCompositeOperation = 'source-over';
        }
      }
    }
  }
}

// What the skin leaves on the attacker it hit (h: seconds since).
function drawLanding(
  x: CanvasRenderingContext2D,
  kind: SkinKind,
  tx: number,
  ty: number,
  A: Box,
  S: number,
  h: number,
  flare: string,
  light: string,
): void {
  const q = cl(h / 0.9);
  if (q >= 1) return;
  x.globalAlpha = 1 - q;
  switch (kind) {
    case 'gel': {
      // frost ring
      x.strokeStyle = light;
      x.lineWidth = 4 * S * (1 - q);
      x.beginPath();
      x.arc(tx, ty, A.w * (0.15 + 0.45 * ez(q)), 0, 7);
      x.stroke();
      break;
    }
    case 'fracture': {
      // cracks running from the impact
      x.strokeStyle = '#fafaf9';
      x.lineWidth = 2.5 * S;
      for (let i = 0; i < 6; i++) {
        let a = (i / 6) * 6.28 + 0.4,
          px = tx,
          py = ty;
        x.beginPath();
        x.moveTo(px, py);
        for (let s = 0; s < 4; s++) {
          a += Math.sin(i * 7 + s * 3) * 0.5;
          px += Math.cos(a) * A.w * 0.07 * ez(cl(h / 0.25));
          py += Math.sin(a) * A.w * 0.07 * ez(cl(h / 0.25));
          x.lineTo(px, py);
        }
        x.stroke();
      }
      break;
    }
    case 'malediction': {
      // a skull mark that rises and fades
      x.fillStyle = '#e9d5ff';
      x.font = `${Math.round(40 * S)}px system-ui, sans-serif`;
      x.textAlign = 'center';
      x.fillText('💀', tx, ty - q * 40 * S);
      break;
    }
    case 'poison': {
      // green drips running down the attacker
      x.fillStyle = '#84cc16';
      for (let i = 0; i < 5; i++) {
        const dx = (i - 2) * A.w * 0.08;
        x.beginPath();
        x.ellipse(tx + dx, ty + q * A.h * 0.2 * (0.6 + (i % 3) * 0.3), 4 * S, 7 * S, 0, 0, 7);
        x.fill();
      }
      break;
    }
    case 'saignement': {
      x.fillStyle = '#b91c1c';
      for (let i = 0; i < 6; i++) {
        x.beginPath();
        x.arc(tx + Math.cos(i * 1.1) * 20 * S, ty + Math.sin(i * 1.1) * 14 * S + q * 30 * S, 4 * S, 0, 7);
        x.fill();
      }
      break;
    }
    case 'foudre': {
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = (1 - q) * (0.5 + 0.5 * Math.sin(h * 60));
      const r = A.w * 0.45;
      x.drawImage(nspr('#60a5fa'), tx - r, ty - r, r * 2, r * 2);
      x.globalCompositeOperation = 'source-over';
      break;
    }
    default: {
      // embers rising
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 8; i++) {
        const ex = tx + Math.sin(i * 2.4 + h * 3) * A.w * 0.2,
          ey = ty - h * 90 * S * (0.6 + (i % 4) * 0.2);
        x.drawImage(nspr(flare), ex - 6 * S, ey - 6 * S, 12 * S, 12 * S);
      }
      x.globalCompositeOperation = 'source-over';
    }
  }
}
