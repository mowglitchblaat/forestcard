// Particles on a ParticleContainer: one draw call for thousands of particles (GPU batching).
// Its loop runs only while particles live: an empty container asks for no frame (engine/time.ts slows
// the drawing down at rest only when nothing is on the ticker), and starts again with the next one.

import { Particle, ParticleContainer, type Container, type Texture } from 'pixi.js';
import { every, type Stoppable } from './time.ts';
import { sparkTexture } from './textures.ts';

export type ParticleSpec = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds
  size: number; // width at rest, in the layer's units
  tint: number;
  drag?: number; // speed kept per second: e^-drag
  gravity?: number; // added to vy per second
  stretch?: number; // lengthens a fast particle along its speed
};

type Live = Required<ParticleSpec> & { q: Particle; age: number };

export class Particles {
  readonly box: ParticleContainer;
  private readonly tex: Texture;
  private list: Live[] = [];
  private loop: Stoppable | null = null;
  private stopped = false;

  constructor(layer: Container, texture: Texture = sparkTexture()) {
    this.tex = texture;
    this.box = new ParticleContainer({
      texture,
      dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
    });
    this.box.blendMode = 'add';
    layer.addChild(this.box);
  }

  add(p: ParticleSpec): void {
    const q = new Particle({
      texture: this.tex,
      x: p.x,
      y: p.y,
      anchorX: 0.5,
      anchorY: 0.5,
      tint: p.tint,
      alpha: 0,
    });
    this.box.addParticle(q);
    this.list.push({ drag: 2.5, gravity: 0, stretch: 0, ...p, q, age: 0 });
    if (!this.loop && !this.stopped && !this.box.destroyed)
      this.loop = every(this.box, (dt) => this.update(dt));
  }

  private update(dt: number): void {
    if (this.box.destroyed) {
      this.stop();
      return;
    }
    const k0 = this.tex.width;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      p.age += dt;
      const u = p.age / p.life;
      if (u >= 1) {
        this.box.removeParticle(p.q);
        this.list.splice(i, 1);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const speed = Math.hypot(p.vx, p.vy);
      p.q.x = p.x;
      p.q.y = p.y;
      p.q.rotation = Math.atan2(p.vy, p.vx);
      p.q.scaleX = (p.size * (1 + (p.stretch * speed) / 1000)) / k0;
      p.q.scaleY = p.size / k0;
      p.q.alpha = (1 - u) * (u < 0.1 ? u / 0.1 : 1);
    }
    if (!this.list.length && this.loop) {
      this.loop.stop();
      this.loop = null;
    }
  }

  stop(): void {
    this.stopped = true;
    this.loop?.stop();
    this.loop = null;
    if (!this.box.destroyed) this.box.destroy();
    this.list = [];
  }
}
