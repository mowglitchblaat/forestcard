// The execution's tears: real holes through the card, where the legacy planted its blades. A filter on
// the card's whole face (card.front: drawing, frame, numbers, effects), chained by card/filters.ts:
// inside a hole the card is transparent, the stream shows through.
//   the rip:   from where the blow lands, the card tears along the blade's line, both ways, in 0.2 s;
//   the edge:  ragged, in big lumps and fine fibres (different on each side), with paper fibres
//              sticking out into the hole; the card's thickness shows as a fibrous cream band, lighter
//              on the lip facing the light; around it the paper is bent away, the picture pulled and
//              shaded;
//   the doom:  (the third mark) the card drains and its edges darken;
//   closing:   a hole eases shut (a mark lost); the filter goes when nothing is left.

import {
  Filter,
  GlProgram,
  Rectangle,
  UniformGroup,
  defaultFilterVert,
  type Container,
} from 'pixi.js';
import { H, W } from '@forestcard/layout';
import type { Card } from '../card/card.ts';
import { setOwnFilters } from '../card/filters.ts';
import { every, type Stoppable } from '../engine/time.ts';
import { COMMON, HEAD } from '../status/shaders.ts';

const TEARS =
  COMMON +
  `
uniform vec4 uT0;
uniform vec4 uT1;
uniform vec4 uT2;   // each tear: its middle (card uv), its line's angle (rad, y down), its half length (card widths)
uniform vec3 uTw;   // each tear's half width at its widest (card widths)
uniform vec3 uTa;   // how open each is (0..1)
uniform vec3 uTt;   // seconds since each was torn
uniform float uDoom;

const float RIP = 0.2;   // seconds for a tear to run its length

vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

// A tear seen from P: x = along it (-1..1), y = across it (px, signed), z = distance to its ragged edge
// (px, < 0 in the hole), w = its depth there (0..1: how open, how far the rip has run).
vec4 tearAt(vec2 P, vec4 T, float w, float a, float age, float seed){
  vec2 q = rot(P - T.xy * uCard, -T.z);
  float L = T.w * uCard.x, u = q.x / L;
  float run = clamp(age / RIP, 0.0, 1.0);
  float reach = 1.0 - smoothstep(run * 1.05 - 0.1, run * 1.05, abs(u));
  // its width: thinning to crooked points, opening by fits and starts along the way
  float body = pow(max(0.0, 1.0 - u * u), 0.7) * (0.45 + 1.1 * fbm(vec2(u * 2.6 + seed * 2.0, 0.7))) * reach * a;
  if (body < 0.002) return vec4(u, q.y, 1e4, 0.0);
  // the rip does not run straight: its middle wanders
  float y = q.y - (fbm(vec2(u * 2.2 + seed, 3.1)) - 0.5) * w * uCard.x * 2.2 * (1.0 - u * u);
  float side = y < 0.0 ? -1.0 : 1.0;
  // ragged: lumps, sharp teeth and fibres, not the same on both sides
  float rag = (fbm(vec2(u * 4.0 + seed, side * 2.3)) - 0.5) * 1.3
            + (abs(noise(vec2(u * 17.0 + seed, side * 5.0)) * 2.0 - 1.0) - 0.5) * 0.7
            + (noise(vec2(u * 70.0 + seed, side * 7.0)) - 0.5) * 0.3;
  float hw = w * uCard.x * body * max(0.15, 1.0 + rag * 0.8);
  return vec4(u, y, abs(y) - hw, min(1.0, body * 1.5));
}

// The paper bent away near the edge: how far the picture is pulled (px), towards the hole.
vec2 curl(vec2 P, vec4 T, float w, float a, float age, float seed){
  vec4 k = tearAt(P, T, w, a, age, seed);
  if (k.w <= 0.0 || k.z < 0.0) return vec2(0.0);
  float R = uCard.x * 0.03;
  float pull = uCard.x * 0.006 * k.w * exp(-k.z / R);
  return rot(vec2(0.0, -sign(k.y) * pull), T.z);
}

// What the card looks like at P around one tear: col (straight colour) and how much of it is left.
void tear(inout vec3 col, inout float keep, vec2 P, vec4 T, float w, float a, float age, float seed){
  vec4 k = tearAt(P, T, w, a, age, seed);
  if (k.w <= 0.0) return;
  float L = T.w * uCard.x, along = k.x * L, d = k.z;
  float side = k.y < 0.0 ? -1.0 : 1.0;
  // the lip facing up catches the light
  float lit = (side < 0.0) == (cos(T.z) > 0.0) ? 1.0 : 0.0;
  // fibres sticking out into the hole, across its edge
  float fib = step(0.62, noise(vec2(along * 0.7 + seed * 13.0, side * 5.0)));
  float fibLen = (1.5 + 4.0 * noise(vec2(along * 0.21, side * 3.0 + seed))) * k.w;
  float paper = fib * (1.0 - smoothstep(fibLen - 0.7, fibLen + 0.7, -d)) * step(d, 0.0);
  // the hole
  float hole = 1.0 - smoothstep(-0.7, 0.7, d);
  keep *= 1.0 - hole * (1.0 - paper);
  // the card's thickness: a fibrous cream band along the edge, wider here and there
  float band = (1.2 + 3.2 * noise(vec2(along * 0.045, side * 4.0 + seed))) * k.w;
  float core = (1.0 - smoothstep(band - 0.7, band + 0.7, d)) * (1.0 - hole) + paper;
  vec3 cream = vec3(0.86, 0.82, 0.73) * (0.78 + 0.22 * noise(vec2(along * 0.9, k.y * 0.35)));
  cream *= mix(0.72, 1.08, lit);
  col = mix(col, cream, clamp(core, 0.0, 1.0));
  // the paper bent away around it: shaded on the far lip, a sheen on the lit one
  float bent = exp(-max(d - band, 0.0) / (uCard.x * 0.03)) * (1.0 - core) * k.w * step(0.0, d);
  col *= 1.0 - 0.38 * bent * (1.0 - lit);
  col += vec3(0.1) * bent * lit;
}

void main(){` +
  HEAD +
  `
  vec2 P = cuv * uCard;
  vec2 off = curl(P, uT0, uTw.x, uTa.x, uTt.x, 1.7) + curl(P, uT1, uTw.y, uTa.y, uTt.y, 5.3)
           + curl(P, uT2, uTw.z, uTa.z, uTt.z, 9.1);
  vec4 src = texture(uTexture, toTc((P + off) / uCard));
  float A = src.a;
  vec3 col = src.rgb / max(A, 1e-4);
  // doomed: the card drains, its edges darken
  col = mix(col, vec3(lumi(col)) * vec3(0.95, 0.88, 0.86), 0.4 * uDoom);
  col *= 1.0 - 0.6 * uDoom * (1.0 - smoothstep(0.0, 0.5, edge));
  float keep = 1.0;
  tear(col, keep, P, uT0, uTw.x, uTa.x, uTt.x, 1.7);
  tear(col, keep, P, uT1, uTw.y, uTa.y, uTt.y, 5.3);
  tear(col, keep, P, uT2, uTw.z, uTa.z, uTt.z, 9.1);
  A *= keep;
  finalColor = vec4(col * A, A);
}`;

type Uniforms = {
  uTime: number;
  uCard: Float32Array;
  uT0: Float32Array;
  uT1: Float32Array;
  uT2: Float32Array;
  uTw: Float32Array;
  uTa: Float32Array;
  uTt: Float32Array;
  uDoom: number;
};

export type TearSpec = {
  x: number; // where the blow lands, fractions of the face
  y: number;
  angle: number; // the tear's line, degrees, y down: 90 runs top to bottom
  half: number; // half its length, face widths
  width: number; // half its width at the widest, face widths
};

const OPEN = 9,
  CLOSE = 2.5; // easing rates (1/s)

export class Tears {
  private readonly card: Card;
  private filter: Filter | null = null;
  private u: Uniforms | null = null;
  private loop: Stoppable | null = null;
  private readonly want = [0, 0, 0];
  private wantDoom = 0;

  constructor(card: Card) {
    this.card = card;
    // its filter is not destroyed with the face it is on (engine/dispose.ts)
    card.root.once('destroyed', () => this.destroy());
  }

  /** Tear `i` rips open from where the blow lands. */
  open(i: number, t: TearSpec): void {
    const u = this.ensure();
    this.want[i] = 1;
    const box = this.card.box;
    const slot = [u.uT0, u.uT1, u.uT2][i]!;
    // from the face's fractions to the card's (the face sits in card.box)
    slot[0] = (box.x + t.x * box.w) / W;
    slot[1] = t.y;
    slot[2] = (t.angle * Math.PI) / 180;
    slot[3] = (t.half * box.w) / W;
    u.uTw[i] = (t.width * box.w) / W;
    u.uTt[i] = 0;
  }

  /** Tear `i` eases shut. */
  close(i: number): void {
    this.want[i] = 0;
  }

  /** The doom (the third mark) comes, or goes. */
  doom(on: boolean): void {
    if (on) this.ensure();
    this.wantDoom = on ? 1 : 0;
  }

  private ensure(): Uniforms {
    if (this.u) return this.u;
    const group = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uAmt: { value: 1, type: 'f32' },
      uTick: { value: 0, type: 'f32' },
      uLevel: { value: 1, type: 'f32' },
      uShare: { value: 1, type: 'f32' },
      uPad: { value: new Float32Array(2), type: 'vec2<f32>' },
      uCard: { value: new Float32Array(2), type: 'vec2<f32>' },
      uRadius: { value: 0, type: 'f32' },
      uT0: { value: new Float32Array(4), type: 'vec4<f32>' },
      uT1: { value: new Float32Array(4), type: 'vec4<f32>' },
      uT2: { value: new Float32Array(4), type: 'vec4<f32>' },
      uTw: { value: new Float32Array(3), type: 'vec3<f32>' },
      uTa: { value: new Float32Array(3), type: 'vec3<f32>' },
      uTt: { value: new Float32Array([99, 99, 99]), type: 'vec3<f32>' },
      uDoom: { value: 0, type: 'f32' },
    });
    this.filter = new Filter({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: TEARS, name: 'mark-tears' }),
      resources: { fxUniforms: group },
      resolution: 'inherit',
      antialias: 'inherit',
      padding: 0,
    });
    this.u = group.uniforms as Uniforms;
    this.chain(this.card.front, [this.filter]);
    this.loop = every(this.card.root, (dt) => this.update(dt));
    this.measure();
    return this.u;
  }

  // the whole face, in card units
  private chain(target: Container, list: Filter[]): void {
    setOwnFilters(target, 'marks', list, new Rectangle(0, 0, W, H));
  }

  // the filter works in screen pixels: the card's size there
  private measure(): void {
    const u = this.u!,
      s = this.card.front.worldTransform.a;
    u.uCard[0] = W * s;
    u.uCard[1] = H * s;
  }

  private update(dt: number): void {
    const u = this.u!;
    this.measure();
    u.uTime += dt;
    const ease = (a: number, to: number) =>
      a + (to - a) * Math.min(1, dt * (to > a ? OPEN : CLOSE));
    for (let i = 0; i < 3; i++) {
      u.uTt[i] = Math.min(99, u.uTt[i]! + dt);
      u.uTa[i] = ease(u.uTa[i]!, this.want[i]!);
      if (!this.want[i] && u.uTa[i]! < 0.002) u.uTa[i] = 0;
    }
    u.uDoom = ease(u.uDoom, this.wantDoom);
    if (!this.wantDoom && u.uDoom < 0.002) u.uDoom = 0;
    const idle = this.want.every((w) => !w) && !this.wantDoom;
    if (idle && u.uTa.every((a) => !a) && !u.uDoom) this.destroy();
  }

  destroy(): void {
    this.loop?.stop();
    this.loop = null;
    const front = this.card.front;
    if (this.filter && !front.destroyed) this.chain(front, []);
    this.filter?.destroy();
    this.filter = null;
    this.u = null;
  }
}
