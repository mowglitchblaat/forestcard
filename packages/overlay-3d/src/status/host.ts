// The statuses shown on one card. Each is a filter on the card's picture: a built card's drawing (its
// frame, text and stats stay sharp), or a flat card's whole face. Several statuses chain: those that
// cover the picture first, those that add marks after (StatusFxDef.layer); they share its colour grade. A status lands by easing in, acts with a pulse, ends by easing out, then its filter goes.
// One loop per card drives them all; it belongs to the card, so destroying the card stops it.

import {
  Filter,
  GlProgram,
  Rectangle,
  UniformGroup,
  defaultFilterVert,
  type Container,
} from 'pixi.js';
import type { Card } from '../card/card.ts';
import { setOwnFilters } from '../card/filters.ts';
import { every, wait, type Stoppable } from '../engine/time.ts';
import { STATUS_FX, type StatusFxKind } from './registry.ts';
import { shaderDefines } from '../config/quality.ts';

type Uniforms = {
  uTime: number;
  uAmt: number;
  uTick: number;
  uLevel: number;
  uShare: number;
  uPad: Float32Array;
  uCard: Float32Array;
  uRadius: number;
};
type Live = { kind: StatusFxKind; filter: Filter; u: Uniforms; on: boolean; tickT: number };

// the status lands and ends: eased at this rate (1/s); it acts: up in RISE s, then down at DECAY (1/s)
const EASE = 3,
  RISE = 0.1,
  DECAY = 3;

function statusFilter(kind: StatusFxKind): { filter: Filter; u: Uniforms } {
  const group = new UniformGroup({
    uTime: { value: 0, type: 'f32' },
    uAmt: { value: 0, type: 'f32' },
    uTick: { value: 0, type: 'f32' },
    uLevel: { value: 1, type: 'f32' },
    uShare: { value: 1, type: 'f32' },
    uPad: { value: new Float32Array(2), type: 'vec2<f32>' },
    uCard: { value: new Float32Array(2), type: 'vec2<f32>' },
    uRadius: { value: 0, type: 'f32' },
  });
  const filter = new Filter({
    glProgram: GlProgram.from({
      vertex: defaultFilterVert,
      // the quality's defines first (config/quality.ts): fbm's octaves
      fragment: shaderDefines() + STATUS_FX[kind].shader,
      name: `status-${kind}`,
    }),
    resources: { fxUniforms: group },
    resolution: 'inherit',
    antialias: 'inherit',
    padding: 0,
  });
  return { filter, u: group.uniforms as Uniforms };
}

export class CardStatuses {
  private readonly card: Card;
  private readonly live = new Map<StatusFxKind, Live>();
  private loop: Stoppable | null = null;
  private time = Math.random() * 10;

  constructor(card: Card) {
    this.card = card;
    // a filter is not destroyed with the picture it is on (engine/dispose.ts): the live ones go with the card
    card.root.once('destroyed', () => {
      for (const l of this.live.values()) l.filter.destroy();
      this.live.clear();
    });
  }

  // What the filters work on: the drawing of a built card, the whole face of a flat one.
  private get target(): Container | undefined {
    return this.card.groups.drawing ?? this.card.groups.base;
  }

  has(kind: StatusFxKind): boolean {
    return !!this.live.get(kind)?.on;
  }

  /** On: it eases in (or takes the new level). Off: it eases out, then its filter goes. */
  set(kind: StatusFxKind, on: boolean, { level = 1 }: { level?: number } = {}): void {
    const current = this.live.get(kind);
    if (!on) {
      if (current) current.on = false;
      return;
    }
    if (current) {
      current.on = true;
      current.u.uLevel = level;
      return;
    }
    const { filter, u } = statusFilter(kind);
    u.uLevel = level;
    this.live.set(kind, { kind, filter, u, on: true, tickT: 99 });
    this.chain();
    this.loop ??= every(this.card.root, (dt) => this.update(dt));
  }

  /** The status acts: its pulse, once. Resolves when the pulse has died down. */
  async tick(kind: StatusFxKind): Promise<void> {
    const l = this.live.get(kind);
    if (!l?.on || !STATUS_FX[kind].acts) return;
    l.tickT = 0;
    await wait(1200);
  }

  clear(): void {
    for (const l of this.live.values()) l.on = false;
  }

  private chain(): void {
    const target = this.target;
    if (!target) return;
    // what covers the picture first, the marks over it after; landing order within each (Map order)
    const rank = (l: Live) => (STATUS_FX[l.kind].layer === 'cover' ? 0 : 1);
    const list = [...this.live.values()].sort((x, y) => rank(x) - rank(y)).map((l) => l.filter);
    // the input is the card's rectangle, whatever the drawing overflows (layout units)
    setOwnFilters(
      target,
      'statuses',
      list,
      new Rectangle(0, 0, this.card.layout.width, this.card.layout.height),
    );
  }

  private update(dt: number): void {
    this.time += dt;
    const target = this.target;
    // the filters work in screen pixels: the card's size there
    const s = target ? target.worldTransform.a : 1;
    const w = this.card.layout.width * s,
      h = this.card.layout.height * s;
    let gone = false;
    // several statuses share the picture's colour grade (their marks stay whole)
    const share = 1 / Math.max(1, this.live.size);
    for (const [kind, l] of this.live) {
      l.u.uShare = share;
      l.u.uAmt += ((l.on ? 1 : 0) - l.u.uAmt) * Math.min(1, dt * EASE);
      l.tickT += dt;
      l.u.uTick = l.tickT < RISE ? l.tickT / RISE : Math.exp(-(l.tickT - RISE) * DECAY);
      l.u.uTime = this.time;
      l.u.uCard[0] = w;
      l.u.uCard[1] = h;
      if (!l.on && l.u.uAmt < 0.002) {
        this.live.delete(kind);
        l.filter.destroy();
        gone = true;
      }
    }
    if (gone) this.chain();
    if (!this.live.size && this.loop) {
      this.loop.stop();
      this.loop = null;
    }
  }
}
