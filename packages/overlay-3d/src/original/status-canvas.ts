// Two statuses as the legacy overlay drew them (combat.html, fxStart: sang, fatL), on the card's face:
//   saignement  a red glow inside the edges that swells and ebbs (box-shadow, @keyframes sg), drops of
//               blood running down the card, each with its trail and its highlight;
//   fatigue     a blue-grey veil, a heavy dark band at the top (the eyelids) that sways, drops of sweat
//               falling, « Z » rising and swaying.
// Their level (n: 1 to 3) as in the legacy: level 1 is fainter (opacity .6), level 3 the strongest.
//
// GPU: one canvas per status and per card, at the card's size on screen (not the whole screen), drawn
// at 30 images/s, its texture sent again only then; nothing runs once the status ends.

import { Sprite, Texture, type Container } from 'pixi.js';
import { H, W } from '@forestcard/layout';
import { every, type Stoppable } from '../engine/time.ts';

export type CanvasStatus = 'saignement' | 'fatigue';
export const CANVAS_STATUSES: ReadonlySet<string> = new Set<CanvasStatus>(['saignement', 'fatigue']);

type Face = { root: Container; front: Container };
type Running = { sprite: Sprite; loop: Stoppable; level: number };

const R = (a: number, b: number) => a + Math.random() * (b - a);
const running = new WeakMap<Container, Map<CanvasStatus, Running>>();

// the legacy's COULEE: a trail of blood, stretched under each drop instead of a gradient per drop
let trail: HTMLCanvasElement | null = null;
function coulee(): HTMLCanvasElement {
  if (trail) return trail;
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 128;
  const g = c.getContext('2d')!,
    l = g.createLinearGradient(0, 0, 0, 128);
  l.addColorStop(0, 'rgba(120,0,6,0)');
  l.addColorStop(0.35, 'rgba(140,4,10,.9)');
  l.addColorStop(1, 'rgba(185,10,20,1)');
  g.fillStyle = l;
  g.fillRect(0, 0, 8, 128);
  return (trail = c);
}

// a glow inside the card's edges (CSS box-shadow: inset 0 0 blur spread colour), drawn once
function insetGlow(cw: number, ch: number, blur: number, spread: number, col: string) {
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d')!;
  g.shadowColor = col;
  g.shadowBlur = blur;
  g.fillStyle = col;
  g.beginPath();
  g.rect(-cw, -ch, cw * 3, ch * 3);
  g.rect(spread, spread, cw - 2 * spread, ch - 2 * spread);
  g.fill('evenodd');
  return c;
}

type Particle = {
  x: number;
  y: number;
  vy: number;
  s: number;
  l: number;
  d: number;
  ph: number;
  len: number;
  z: boolean;
};

function painter(kind: CanvasStatus, x: CanvasRenderingContext2D, cw: number, ch: number) {
  let P: Particle[] = [];
  const k = cw / 422; // the legacy card's width on a 1920 screen: its sizes in pixels scale by it
  if (kind === 'saignement') {
    const lo = insetGlow(cw, ch, 38 * k, 10 * k, 'rgba(170,10,20,.75)'),
      hi = insetGlow(cw, ch, 55 * k, 16 * k, 'rgba(200,15,25,.85)');
    let veil: CanvasGradient | null = null;
    return (t: number, step: number) => {
      if (Math.random() < 0.13 * step)
        P.push({
          x: R(0.05, 0.95) * cw,
          y: R(-0.05, 0.15) * ch,
          vy: (R(0.35, 1) * ch) / 650,
          s: R(0.02, 0.045) * cw,
          l: 0,
          d: R(2.8, 4.2),
          ph: 0,
          len: 0,
          z: false,
        });
      x.clearRect(0, 0, cw, ch);
      veil ??= (() => {
        const g = x.createRadialGradient(cw / 2, ch / 2, ch * 0.22, cw / 2, ch / 2, ch * 0.78);
        g.addColorStop(0, 'rgba(120,0,0,0)');
        g.addColorStop(1, 'rgba(150,0,10,.45)');
        return g;
      })();
      x.fillStyle = veil;
      x.fillRect(0, 0, cw, ch);
      // the edges' glow, swelling and ebbing (sg: 1.4 s, alternate)
      const u = 0.5 - 0.5 * Math.cos((t / 1.4) * Math.PI);
      x.globalAlpha = 1 - u;
      x.drawImage(lo, 0, 0);
      x.globalAlpha = u;
      x.drawImage(hi, 0, 0);
      x.globalAlpha = 1;
      for (const p of P) {
        p.l += (0.016 * step) / p.d;
        if (p.l >= 1) continue;
        p.vy *= Math.pow(1.004, step);
        p.y += p.vy * step;
        p.len += p.vy * step;
        const a = Math.min(1, (1 - p.l) * 2.4),
          tl = Math.min(p.len, ch * 0.6),
          w = p.s;
        if (tl > 0) {
          x.globalAlpha = a;
          x.drawImage(coulee(), p.x - w * 0.34, p.y - tl, w * 0.68, tl);
          x.globalAlpha = 1;
        }
        x.fillStyle = `rgba(190,10,20,${a})`;
        x.beginPath();
        x.moveTo(p.x, p.y - w * 1.1);
        x.quadraticCurveTo(p.x + w * 0.85, p.y + w * 0.3, p.x, p.y + w * 0.85);
        x.quadraticCurveTo(p.x - w * 0.85, p.y + w * 0.3, p.x, p.y - w * 1.1);
        x.fill();
        x.fillStyle = `rgba(255,170,170,${a * 0.55})`;
        x.beginPath();
        x.ellipse(p.x - w * 0.25, p.y, w * 0.14, w * 0.28, 0, 0, 7);
        x.fill();
      }
      P = P.filter((p) => p.l < 1);
    };
  }
  const edge = insetGlow(cw, ch, 40 * k, 10 * k, 'rgba(70,90,130,.7)');
  let veil: CanvasGradient | null = null;
  return (t: number, step: number) => {
    if (Math.random() < 0.06 * step)
      P.push({
        z: true,
        x: R(0.55, 0.9) * cw,
        y: R(0.22, 0.42) * ch,
        s: R(0.09, 0.15) * cw,
        l: 0,
        d: R(1.6, 2.4),
        ph: R(0, 6),
        vy: 0,
        len: 0,
      });
    if (Math.random() < 0.08 * step)
      P.push({
        z: false,
        x: R(0.08, 0.92) * cw,
        y: -4,
        vy: (R(0.5, 1.1) * ch) / 500,
        s: R(0.012, 0.022) * cw,
        l: 0,
        d: R(2.4, 3.6),
        ph: 0,
        len: 0,
      });
    x.clearRect(0, 0, cw, ch);
    veil ??= (() => {
      const g = x.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, 'rgba(40,55,90,.5)');
      g.addColorStop(1, 'rgba(30,40,70,.15)');
      return g;
    })();
    x.fillStyle = veil;
    x.fillRect(0, 0, cw, ch);
    x.drawImage(edge, 0, 0);
    // the heavy eyelids
    x.fillStyle = 'rgba(15,20,40,.55)';
    x.fillRect(0, 0, cw, ch * (0.06 + 0.03 * Math.sin(t * 1.5)));
    for (const p of P) {
      p.l += (0.016 * step) / p.d;
      if (p.l >= 1) continue;
      const a = Math.sin(Math.PI * p.l);
      if (p.z) {
        x.save();
        x.translate(p.x + Math.sin(t * 2 + p.ph) * cw * 0.03, p.y - p.l * ch * 0.35);
        x.rotate(-0.2);
        x.font = `900 ${p.s * (0.7 + 0.6 * p.l)}px system-ui, sans-serif`;
        x.textAlign = 'center';
        x.lineWidth = 3 * k;
        x.strokeStyle = `rgba(20,30,60,${a})`;
        x.fillStyle = `rgba(200,220,255,${a})`;
        x.strokeText('Z', 0, 0);
        x.fillText('Z', 0, 0);
        x.restore();
      } else {
        p.y += p.vy * step;
        x.fillStyle = `rgba(170,220,255,${a * 0.9})`;
        x.beginPath();
        x.moveTo(p.x, p.y - p.s * 1.6);
        x.quadraticCurveTo(p.x + p.s, p.y + p.s * 0.2, p.x, p.y + p.s);
        x.quadraticCurveTo(p.x - p.s, p.y + p.s * 0.2, p.x, p.y - p.s * 1.6);
        x.fill();
      }
    }
    P = P.filter((p) => p.l < 1);
  };
}

/** Lays a status on the card's face, changes its level, or takes it away (on = false). */
export function setCanvasStatus(card: Face, kind: CanvasStatus, on: boolean, level = 1): void {
  const front = card.front;
  let mine = running.get(front);
  const was = mine?.get(kind);
  if (!on) {
    if (was) {
      was.loop.stop();
      was.sprite.destroy({ texture: true, textureSource: true });
      mine!.delete(kind);
    }
    return;
  }
  const lv = Math.max(1, Math.min(3, level));
  if (was) {
    was.level = lv;
    return;
  }
  // the canvas at the card's size on screen (at least a small card's), never more than the card
  const scale = Math.abs(card.root.worldTransform.a) || 0.2;
  const cw = Math.max(160, Math.min(W, Math.round(W * scale))),
    ch = Math.round((cw * H) / W);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const x = canvas.getContext('2d')!;
  const texture = Texture.from(canvas);
  const sprite = new Sprite({ texture, label: `status-${kind}` });
  sprite.width = W;
  sprite.height = H;
  front.addChild(sprite);
  const paint = painter(kind, x, cw, ch);
  const run: Running = { sprite, level: lv, loop: { stop() {} } };
  let acc = 0;
  run.loop = every(sprite, (dt, t) => {
    acc += dt;
    if (acc < 1 / 30) return;
    // the legacy stepped by 1/60 s: a 30 images/s frame is about two of its steps
    const step = Math.min(4, acc * 60);
    acc = 0;
    paint(t, step);
    sprite.alpha = run.level === 1 ? 0.6 : run.level === 2 ? 0.85 : 1;
    texture.source.update();
  });
  if (!mine) running.set(front, (mine = new Map()));
  mine.set(kind, run);
}

/** Every canvas status of the card taken away. */
export function clearCanvasStatuses(card: Face): void {
  for (const kind of [...(running.get(card.front)?.keys() ?? [])])
    setCanvasStatus(card, kind, false);
}
