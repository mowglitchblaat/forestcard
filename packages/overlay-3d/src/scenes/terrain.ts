// The terrain of a combat (terrain: drawn at the start, or invoked by a card): an ambiance behind the
// cards for the rest of the combat. Each terrain has its own look (one per collection, never a flower on
// the Cathedral): a wash of colour over the stage, a few lights of its own, and a handful of particles
// drifting in its manner (embers, petals, pages, motes…). The Cathedral of programming has its own
// scenery besides (cathedralDecor: gears, circuits with running pulses, code, bits), still sprites only.
// When it acts on a card (statut whose kind is the terrain: the swarm stings, the forest's sap heals…)
// it plays a small burst there; the move that goes with it, if any, is the combat scene's.
//
// Cost, kept low on purpose: the stage is drawn every frame during a combat, so the terrain is sprites
// only (no shader, no filter): one wash stretched over the stage, two to four lights, and at most 36
// particles on one ParticleContainer (18 at the eco quality), moved by one loop that runs at 30 frames a
// second at the eco quality. It fades in over 1.2 s, and out when another terrain replaces it.

import { Container, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js';
import { particleCount, quality } from '../config/quality.ts';
import type { Particles } from '../engine/particles.ts';
import { glowTexture, sparkTexture } from '../engine/textures.ts';
import { every, tween, detach, type Stoppable } from '../engine/time.ts';
import { burst, puffTexture, ringTexture, streakTexture } from '../kit/draw.ts';

export type TerrainName =
  | 'orage'
  | 'essaim'
  | 'foret'
  | 'cathedrale'
  | 'lune'
  | 'sakura'
  | 'grimoire'
  | 'theatre';

const NAMES: readonly TerrainName[] = [
  'orage',
  'essaim',
  'foret',
  'cathedrale',
  'lune',
  'sakura',
  'grimoire',
  'theatre',
];
export const isTerrain = (v: unknown): v is TerrainName =>
  typeof v === 'string' && (NAMES as readonly string[]).includes(v);

// ---- small textures, drawn once --------------------------------------------------------------------

const made = new Map<string, Texture>();
function drawn(
  key: string,
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
): Texture {
  const hit = made.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('no 2D context');
  draw(g);
  const t = Texture.from(c);
  made.set(key, t);
  return t;
}
// a vertical wash: the colour at the top, clear in the middle, the colour again at the bottom
const washTexture = () =>
  drawn('terrain-wash', 4, 128, (g) => {
    const l = g.createLinearGradient(0, 0, 0, 128);
    l.addColorStop(0, 'rgba(255,255,255,.75)');
    l.addColorStop(0.45, 'rgba(255,255,255,.12)');
    l.addColorStop(0.7, 'rgba(255,255,255,.1)');
    l.addColorStop(1, 'rgba(255,255,255,.65)');
    g.fillStyle = l;
    g.fillRect(0, 0, 4, 128);
  });
const petalTexture = () =>
  drawn('terrain-petal', 32, 32, (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(16, 16, 13, 7, 0.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,200,220,.9)';
    g.beginPath();
    g.ellipse(13, 14, 5, 2.5, 0.5, 0, Math.PI * 2);
    g.fill();
  });
const pageTexture = () =>
  drawn('terrain-page', 32, 40, (g) => {
    g.fillStyle = '#fff8e6';
    g.fillRect(2, 2, 28, 36);
    g.fillStyle = 'rgba(80,50,20,.55)';
    for (let y = 8; y < 34; y += 5) g.fillRect(6, y, 20 - (y % 3) * 3, 1.5);
  });
const insectTexture = () =>
  drawn('terrain-insect', 16, 16, (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(8, 8, 3, 2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.beginPath();
    g.ellipse(6, 5, 3, 1.6, -0.6, 0, Math.PI * 2);
    g.ellipse(10, 5, 3, 1.6, 0.6, 0, Math.PI * 2);
    g.fill();
  });
const threadTexture = () =>
  drawn('terrain-thread', 4, 128, (g) => {
    const l = g.createLinearGradient(0, 0, 0, 128);
    l.addColorStop(0, 'rgba(255,255,255,0)');
    l.addColorStop(0.3, 'rgba(255,255,255,.9)');
    l.addColorStop(1, 'rgba(255,255,255,.9)');
    g.fillStyle = l;
    g.fillRect(1, 0, 2, 128);
  });

// A gear (256 x 256), the programming's own (original/effects.ts, engrenage): ten teeth, glowing, hollow.
const gearTexture = () =>
  drawn('terrain-gear', 256, 256, (g) => {
    const n = 10,
      r = 104,
      ri = r * 0.78;
    g.translate(128, 128);
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a0 = (i * Math.PI) / n,
        a1 = ((i + 1) * Math.PI) / n,
        R = i % 2 ? ri : r;
      g.lineTo(Math.cos(a0 + 0.08) * R, Math.sin(a0 + 0.08) * R);
      g.lineTo(Math.cos(a1 - 0.08) * R, Math.sin(a1 - 0.08) * R);
    }
    g.closePath();
    g.fillStyle = '#ffffff';
    g.shadowColor = '#ffffff';
    g.shadowBlur = 18;
    g.fill();
    g.shadowBlur = 0;
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(0, 0, r * 0.36, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      g.moveTo(Math.cos(a) * r * 0.6 + r * 0.1, Math.sin(a) * r * 0.6);
      g.arc(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, r * 0.1, 0, Math.PI * 2);
    }
    g.fill();
  });
// a shaft of light: bright at the top, gone by its foot
const shaftTexture = () =>
  drawn('terrain-shaft', 16, 256, (g) => {
    const l = g.createLinearGradient(0, 0, 0, 256);
    l.addColorStop(0, 'rgba(255,255,255,.9)');
    l.addColorStop(0.7, 'rgba(255,255,255,0)');
    g.fillStyle = l;
    g.fillRect(0, 0, 16, 256);
  });
// a bit of code, 0 or 1, glowing
const bitTexture = (bit: '0' | '1') =>
  drawn(`terrain-bit-${bit}`, 32, 40, (g) => {
    g.font = 'bold 30px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ffffff';
    g.shadowBlur = 6;
    g.fillStyle = '#ffffff';
    g.fillText(bit, 16, 21);
  });
// a line of code, faint and glowing (the Cathedral's walls are written)
const codeTexture = (line: string) =>
  drawn(`terrain-code-${line}`, 512, 40, (g) => {
    g.font = '600 24px monospace';
    g.textBaseline = 'middle';
    g.shadowColor = '#ffffff';
    g.shadowBlur = 6;
    g.fillStyle = '#ffffff';
    g.fillText(line, 4, 21);
  });
// the circuits of the stage: traces from the edges inward, right angles only (the activation's
// circuits on a card, original/effects.ts), ending in a pad
type Trace = { pts: [number, number][]; len: number };
function circuits(w: number, h: number): Trace[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out: Trace[] = [];
  for (let i = 0; i < 12; i++) {
    const left = i % 2 === 0,
      pts: [number, number][] = [];
    let x = left ? 0 : w,
      y = 60 + rnd() * (h - 120);
    pts.push([x, y]);
    for (let k = 0; k < 4; k++) {
      if (k % 2 === 0) x += (left ? 1 : -1) * (60 + rnd() * 170);
      else y += (rnd() < 0.5 ? -1 : 1) * (30 + rnd() * 120);
      y = Math.max(30, Math.min(h - 30, y));
      pts.push([x, y]);
    }
    let len = 0;
    for (let k = 1; k < pts.length; k++)
      len += Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]);
    out.push({ pts, len });
  }
  return out;
}
const circuitTexture = (w: number, h: number, traces: Trace[]) =>
  drawn(`terrain-circuit-${w}x${h}`, w, h, (g) => {
    g.strokeStyle = 'rgba(255,255,255,.8)';
    g.lineWidth = 2.5;
    g.lineJoin = 'round';
    for (const tr of traces) {
      g.beginPath();
      tr.pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      const [ex, ey] = tr.pts[tr.pts.length - 1]!;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(ex, ey, 6, 0, Math.PI * 2);
      g.fill();
    }
  });
const along = (tr: Trace, u: number): [number, number] => {
  let rest = u * tr.len;
  for (let k = 1; k < tr.pts.length; k++) {
    const [x0, y0] = tr.pts[k - 1]!,
      [x1, y1] = tr.pts[k]!,
      l = Math.hypot(x1 - x0, y1 - y0);
    if (rest <= l) return [x0 + ((x1 - x0) * rest) / l, y0 + ((y1 - y0) * rest) / l];
    rest -= l;
  }
  return tr.pts[tr.pts.length - 1]!;
};
const CODE = [
  'prog.run();',
  'if (tour % 2 === 0) {',
  '  atq += 3;',
  '}',
  'while (vivant) {',
  'passif.active();',
  'for (let i = 0; i < 3; i++)',
  '0x3F => ATQ',
  'return esquive;',
  'await moteur.tour();',
];

// ---- the looks -------------------------------------------------------------------------------------

// A terrain's own scenery, beyond the wash, the lights and the particles: built once, then moved by the
// terrain's loop (dt and t in seconds).
type Decor = (root: Container, w: number, h: number) => (dt: number, t: number) => void;

// The Cathedral of programming, the way the programming looks on a card: great gears turning in the
// corners, circuits from the edges with pulses of light running along them, shafts of coloured light,
// lines of code rising faintly on both sides, bits (0 and 1) raining down.
const cathedralDecor: Decor = (root, w, h) => {
  const CYAN = 0x38bdf8;
  const shafts = [0x38bdf8, 0xa78bfa, 0x2dd4bf, 0x6366f1].map((tint, i) => {
    const s = new Sprite({ texture: shaftTexture(), tint, alpha: 0.12 });
    s.anchor.set(0.5, 0);
    s.position.set(w * (0.18 + i * 0.22), -60);
    s.width = 170;
    s.height = h * 1.3;
    s.rotation = 0.2;
    s.blendMode = 'add';
    return s;
  });
  const traces = circuits(w, h);
  const board = new Sprite({ texture: circuitTexture(w, h, traces), tint: 0x22d3ee, alpha: 0.16 });
  board.blendMode = 'add';
  const pulses = traces.map((tr, i) => {
    const p = new Sprite({ texture: glowTexture(), anchor: 0.5, tint: 0x9ff3ff, alpha: 0.9 });
    p.width = p.height = 34;
    p.blendMode = 'add';
    return { p, tr, u: i / traces.length, speed: 0.25 + ((i * 37) % 10) / 30 };
  });
  // the gears: the great ones in the corners, a small one meshed with each
  const GEARS: [number, number, number, number][] = [
    [-0.02, -0.04, 380, 1],
    [0.165, 0.2, 170, -2.2],
    [1.0, 0.96, 330, -1],
    [0.84, 0.75, 150, 2.2],
    [0.02, 0.98, 240, 1.3],
    [0.97, 0.02, 220, -1.4],
  ];
  const gears = GEARS.map(([x, y, size, spin]) => {
    const g = new Sprite({ texture: gearTexture(), anchor: 0.5, tint: CYAN, alpha: 0.22 });
    g.position.set(x * w, y * h);
    g.width = g.height = size;
    g.blendMode = 'add';
    return { g, spin };
  });
  const lines = Array.from({ length: particleCount(8) }, (_, i) => {
    const s = new Sprite({ texture: codeTexture(CODE[i % CODE.length]!), tint: 0x67e8f9, alpha: 0 });
    s.blendMode = 'add';
    s.scale.set(0.8);
    const left = i % 2 === 0;
    return { s, x: left ? 40 + (i % 3) * 30 : w - 420 - (i % 3) * 30, y: h * Math.random(), speed: 16 + (i % 4) * 5 };
  });
  const bits = Array.from({ length: particleCount(22) }, (_, i) => {
    const b = new Sprite({ texture: bitTexture(i % 2 ? '1' : '0'), anchor: 0.5, tint: 0x67e8f9, alpha: 0.55 });
    b.blendMode = 'add';
    b.scale.set(0.5 + Math.random() * 0.35);
    return { b, x: Math.random() * w, y: Math.random() * h, speed: 60 + Math.random() * 70 };
  });
  root.addChild(
    ...shafts,
    board,
    ...gears.map((q) => q.g),
    ...lines.map((q) => q.s),
    ...pulses.map((q) => q.p),
    ...bits.map((q) => q.b),
  );
  return (dt, t) => {
    shafts.forEach((s, i) => (s.alpha = 0.08 + 0.06 * Math.sin(t * 0.7 + i * 1.9)));
    for (const q of gears) q.g.rotation += dt * 0.18 * q.spin;
    for (const q of pulses) {
      q.u = (q.u + dt * q.speed) % 1.25;
      const [x, y] = along(q.tr, Math.min(1, q.u));
      q.p.position.set(x, y);
      q.p.alpha = q.u > 1 ? 0 : 0.9;
    }
    for (const q of lines) {
      q.y -= q.speed * dt;
      if (q.y < -40) q.y = h + 40;
      const k = q.y / h;
      q.s.alpha = 0.32 * Math.sin(Math.PI * Math.min(1, Math.max(0, k)));
      q.s.position.set(q.x, q.y);
    }
    for (const q of bits) {
      q.y += q.speed * dt;
      if (q.y > h + 30) {
        q.y = -30;
        q.x = Math.random() * w;
      }
      q.b.position.set(q.x, q.y);
    }
  };
};
  });
  root.addChild(pool, ...rays, halo, rose, ...bits.map((q) => q.b));
  return (dt, t) => {
    rose.rotation += dt * 0.03;
    halo.alpha = 0.38 + 0.1 * Math.sin(t * 0.9);
    rays.forEach((r, i) => {
      r.rotation = (i - 2) * 0.16 + Math.sin(t * 0.25 + i * 1.7) * 0.025;
      r.alpha = 0.12 + 0.06 * Math.sin(t * 0.6 + i * 2.1);
    });
    for (const q of bits) {
      q.y -= q.speed * dt;
      if (q.y < cy + 120) {
        q.y = h - 40;
        q.x = cx + (Math.random() - 0.5) * 700;
      }
      // they show while inside the light, fading at both ends of their climb
      const k = (q.y - cy - 120) / (h - cy - 160);
      q.b.alpha = Math.sin(Math.PI * Math.min(1, Math.max(0, k))) * (0.45 + 0.25 * Math.sin(t * 2 + q.phase));
      q.b.position.set(q.x + Math.sin(t * 0.5 + q.phase) * 10, q.y);
    }
  };
};

type Motion = 'rise' | 'fall' | 'drift' | 'swarm' | 'hang';
type Light = {
  x: number;
  y: number;
  w: number;
  h: number;
  tint: number;
  alpha: number;
  texture?: () => Texture;
  rotation?: number;
};
type Look = {
  wash: number;
  washAlpha: number;
  lights: readonly Light[];
  particles: {
    texture: () => Texture;
    tints: readonly number[];
    size: number;
    motion: Motion;
    count: number;
    speed: number;
    add: boolean;
  };
  flashes?: boolean; // the storm: a white flash now and then
  decor?: Decor; // its own scenery (the Cathedral's gears, circuits and code)
  burst: number; // the colour of its burst on a card
};

// positions on the 1920 x 1080 stage
const LOOKS: Readonly<Record<TerrainName, Look>> = {
  orage: {
    wash: 0x1e2a4a,
    washAlpha: 0.75,
    lights: [{ x: 960, y: -60, w: 1800, h: 420, tint: 0x5a7ab8, alpha: 0.35 }],
    particles: {
      texture: streakTexture,
      tints: [0x9fb8e8, 0xcfe0ff],
      size: 26,
      motion: 'fall',
      count: 36,
      speed: 900,
      add: true,
    },
    flashes: true,
    burst: 0x8fd0ff,
  },
  essaim: {
    wash: 0x3a3208,
    washAlpha: 0.55,
    lights: [{ x: 960, y: 1080, w: 1900, h: 360, tint: 0xb89a20, alpha: 0.25 }],
    particles: {
      texture: insectTexture,
      tints: [0x1a1408, 0x3a2e0a, 0xd8b030],
      size: 14,
      motion: 'swarm',
      count: 36,
      speed: 260,
      add: false,
    },
    burst: 0xffd030,
  },
  foret: {
    wash: 0x0f3a1c,
    washAlpha: 0.55,
    lights: [
      {
        x: 520,
        y: -40,
        w: 260,
        h: 900,
        tint: 0xd8ffb0,
        alpha: 0.16,
        texture: streakTexture,
        rotation: Math.PI / 2 + 0.25,
      },
      {
        x: 1400,
        y: -40,
        w: 220,
        h: 900,
        tint: 0xd8ffb0,
        alpha: 0.13,
        texture: streakTexture,
        rotation: Math.PI / 2 - 0.2,
      },
    ],
    particles: {
      texture: sparkTexture,
      tints: [0x9dff8a, 0xe8ffb0, 0x6fd06a],
      size: 12,
      motion: 'rise',
      count: 30,
      speed: 40,
      add: true,
    },
    burst: 0x9dff8a,
  },
  cathedrale: {
    wash: 0x1e1b4b,
    washAlpha: 0.6,
    lights: [],
    particles: {
      texture: sparkTexture,
      tints: [0xffe8b0, 0xffffff, 0xbfe0ff],
      size: 7,
      motion: 'drift',
      count: 22,
      speed: 14,
      add: true,
    },
    decor: cathedralDecor,
    burst: 0x38bdf8,
  },
  lune: {
    wash: 0x2a0408,
    washAlpha: 0.7,
    lights: [
      { x: 960, y: 70, w: 230, h: 230, tint: 0xff3030, alpha: 0.95 },
      { x: 960, y: 70, w: 700, h: 700, tint: 0xb01010, alpha: 0.45 },
    ],
    particles: {
      texture: puffTexture,
      tints: [0x400608, 0x6a0a10],
      size: 160,
      motion: 'drift',
      count: 12,
      speed: 16,
      add: false,
    },
    burst: 0xff2030,
  },
  sakura: {
    wash: 0x3a1a2a,
    washAlpha: 0.4,
    lights: [{ x: 960, y: -80, w: 1900, h: 500, tint: 0xffc0d8, alpha: 0.25 }],
    particles: {
      texture: petalTexture,
      tints: [0xffd0e0, 0xffa8c8, 0xffffff],
      size: 18,
      motion: 'fall',
      count: 32,
      speed: 70,
      add: false,
    },
    burst: 0xffa8c8,
  },
  grimoire: {
    wash: 0x2a1c3a,
    washAlpha: 0.55,
    lights: [{ x: 960, y: 1100, w: 1300, h: 500, tint: 0xc8a0ff, alpha: 0.3 }],
    particles: {
      texture: pageTexture,
      tints: [0xfff8e6, 0xf0e0c0],
      size: 26,
      motion: 'rise',
      count: 14,
      speed: 45,
      add: false,
    },
    burst: 0xc8a0ff,
  },
  theatre: {
    wash: 0x3a0610,
    washAlpha: 0.6,
    lights: [
      { x: 960, y: 980, w: 1100, h: 260, tint: 0xffd890, alpha: 0.3 },
      { x: -40, y: 540, w: 420, h: 1300, tint: 0x8a0a1a, alpha: 0.75 },
      { x: 1960, y: 540, w: 420, h: 1300, tint: 0x8a0a1a, alpha: 0.75 },
    ],
    particles: {
      texture: threadTexture,
      tints: [0xd8b0ff, 0xffffff],
      size: 4,
      motion: 'hang',
      count: 10,
      speed: 30,
      add: true,
    },
    burst: 0xc08aff,
  },
};

// The combat plays over the stream: the wash only tints it lightly, so the game under it stays visible
// (the legacy combat kept a transparent background for that reason). Its alpha is the look's, times this.
const WASH = 0.35;

type Mote = {
  q: Particle;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  phase: number;
  base: number;
};

class Ambience {
  readonly root = new Container({ label: 'terrain' });
  private readonly loop: Stoppable;
  private flash: Sprite | null = null;
  private nextFlash = 2 + Math.random() * 4;

  readonly name: TerrainName;

  constructor(name: TerrainName, w: number, h: number) {
    this.name = name;
    const look = LOOKS[name];
    const wash = new Sprite({
      texture: washTexture(),
      tint: look.wash,
      alpha: look.washAlpha * WASH,
    });
    wash.width = w;
    wash.height = h;
    this.root.addChild(wash);
    for (const l of look.lights) {
      const s = new Sprite({
        texture: (l.texture ?? glowTexture)(),
        anchor: 0.5,
        tint: l.tint,
        alpha: l.alpha,
      });
      s.position.set(l.x, l.y);
      s.width = l.w;
      s.height = l.h;
      if (l.rotation) s.rotation = l.rotation;
      s.blendMode = 'add';
      this.root.addChild(s);
    }
    const decor = look.decor?.(this.root, w, h);
    const P = look.particles;
    const box = new ParticleContainer({
      texture: P.texture(),
      dynamicProperties: { position: true, rotation: true, color: true },
    });
    box.blendMode = P.add ? 'add' : 'normal';
    this.root.addChild(box);
    const tex = P.texture();
    const motes: Mote[] = [];
    const n = particleCount(P.count);
    for (let i = 0; i < n; i++) {
      const q = new Particle({
        texture: tex,
        anchorX: 0.5,
        anchorY: 0.5,
        tint: P.tints[i % P.tints.length]!,
      });
      const k = P.size / tex.width;
      q.scaleX = q.scaleY = k * (0.6 + 0.8 * Math.random());
      if (P.motion === 'fall' && P.texture === streakTexture) {
        // rain: long streaks, slanted
        q.scaleX = (P.size * 3) / tex.width;
        q.scaleY = 1.2 / tex.height;
        q.rotation = Math.PI / 2 + 0.25;
      }
      if (P.motion === 'hang') q.scaleY = (220 + Math.random() * 380) / tex.height;
      box.addParticle(q);
      const m: Mote = {
        q,
        x: Math.random() * w,
        y: Math.random() * h,
        vx: 0,
        vy: 0,
        spin: (Math.random() - 0.5) * 2,
        phase: Math.random() * 10,
        base: q.alpha,
      };
      if (P.motion === 'hang') m.y = 0;
      motes.push(m);
    }
    if (look.flashes) {
      this.flash = new Sprite({ texture: Texture.WHITE, tint: 0xdfe9ff, alpha: 0 });
      this.flash.width = w;
      this.flash.height = h;
      this.flash.blendMode = 'add';
      this.root.addChild(this.flash);
    }
    this.root.alpha = 0;
    // at the eco quality, the drifting moves 30 times a second
    const step = quality().loopFps > 0 ? 1 / quality().loopFps : 0;
    let acc = 0;
    this.loop = every(this.root, (dtFrame, t) => {
      acc += dtFrame;
      if (acc < step) return;
      const dt = acc;
      acc = 0;
      for (const m of motes) {
        switch (P.motion) {
          case 'fall':
            m.vy = P.speed;
            m.vx =
              P.texture === streakTexture
                ? -P.speed * 0.25
                : Math.sin(t * 0.8 + m.phase) * P.speed * 0.6;
            if (P.texture !== streakTexture) m.q.rotation += m.spin * dt;
            break;
          case 'rise':
            m.vy = -P.speed;
            m.vx = Math.sin(t * 0.6 + m.phase) * P.speed * 0.5;
            m.q.rotation += m.spin * dt * 0.5;
            break;
          case 'drift':
            m.vx = Math.sin(t * 0.25 + m.phase) * P.speed;
            m.vy = Math.cos(t * 0.2 + m.phase * 1.3) * P.speed * 0.6;
            m.q.alpha = 0.4 + 0.4 * Math.sin(t * 1.5 + m.phase);
            break;
          case 'swarm': {
            // around two moving centres, quick and jittery
            const cx = 960 + Math.sin(t * 0.3 + (m.phase > 5 ? 2 : 0)) * 700,
              cy = 300 + Math.cos(t * 0.4 + m.phase) * 160;
            m.vx += ((cx - m.x) * 0.8 + (Math.random() - 0.5) * P.speed * 6) * dt;
            m.vy += ((cy - m.y) * 0.8 + (Math.random() - 0.5) * P.speed * 6) * dt;
            m.vx *= Math.exp(-dt * 1.2);
            m.vy *= Math.exp(-dt * 1.2);
            break;
          }
          case 'hang':
            // threads from the flies: they sway, now and then one drops a little lower
            m.x += Math.sin(t * 0.7 + m.phase) * dt * 6;
            m.q.alpha = 0.25 + 0.2 * Math.sin(t + m.phase);
            break;
        }
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y > h + 40) m.y = -40;
        if (m.y < -40) m.y = h + 40;
        if (m.x > w + 40) m.x = -40;
        if (m.x < -40) m.x = w + 40;
        m.q.x = m.x;
        m.q.y = m.y;
      }
      decor?.(dt, t);
      if (this.flash) {
        this.nextFlash -= dt;
        if (this.nextFlash <= 0) {
          this.nextFlash = 3 + Math.random() * 6;
          const f = this.flash;
          detach(
            tween(
              450,
              (u) => void (f.alpha = 0.22 * (1 - u) * (u < 0.1 ? 1 : 0.6 + 0.4 * Math.sin(u * 40))),
              'linear',
              f,
            ),
          );
        }
      }
    });
  }

  fade(to: number, ms: number): Promise<void> {
    const a0 = this.root.alpha;
    return tween(ms, (u) => void (this.root.alpha = a0 + (to - a0) * u), 'smooth', this.root);
  }

  destroy(): void {
    this.loop.stop();
    this.root.destroy({ children: true });
  }
}

/** The terrain behind a combat's cards: one at a time. */
export class CombatTerrain {
  private current: Ambience | null = null;

  private readonly layer: Container;
  private readonly w: number;
  private readonly h: number;

  constructor(layer: Container, w: number, h: number) {
    this.layer = layer;
    this.w = w;
    this.h = h;
  }

  get name(): TerrainName | null {
    return this.current?.name ?? null;
  }

  /** The terrain becomes `name` (the old one fades out under the new one). */
  async set(name: TerrainName): Promise<void> {
    if (this.current?.name === name) return;
    const old = this.current;
    const next = new Ambience(name, this.w, this.h);
    this.layer.addChildAt(next.root, 0);
    this.current = next;
    await Promise.all([
      next.fade(1, 1200),
      old ? old.fade(0, 1200).then(() => old.destroy()) : Promise.resolve(),
    ]);
  }

  /** It acts on a card at (x, y), `size` its height: a burst in its colour. */
  act(particles: Particles, x: number, y: number, size: number): void {
    const n = this.current?.name;
    if (!n) return;
    const look = LOOKS[n];
    burst(particles, {
      x,
      y,
      count: 24,
      speed: size * 1.4,
      size: size * 0.03,
      tint: [look.burst, 0xffffff],
      life: 0.7,
      stretch: 2,
    });
    const ring = new Sprite({ texture: ringTexture(), anchor: 0.5, tint: look.burst });
    ring.position.set(x, y);
    ring.blendMode = 'add';
    this.layer.parent?.addChild(ring);
    detach(
      tween(
        550,
        (u) => {
          ring.width = ring.height = size * (0.3 + 0.9 * u);
          ring.alpha = 1 - u;
        },
        'out-cubic',
        ring,
      ),
      () => ring.destroy(),
    );
  }

  destroy(): void {
    this.current?.destroy();
    this.current = null;
  }
}
