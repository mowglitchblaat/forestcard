// A fighter's life bar, under its card (where the legacy overlay has it: its name, the bar, its HP).
// No frame: a ribbon of living liquid, its edges wavering and its thickness breathing; what is empty is
// only a soft shadow, so the bar's whole length reads on any stream. It is what shows the HP of a card
// drawn from its flattened image (its numbers are in the image), and the same for every card.
//   the liquid: a thin thread of green light, deep at its edges, lit from its core; waves run along it
//               and spill over its edges, above and below;
//   a hit:      the HP lost turn red at once, stay a moment, then drain (Monster Hunter's recoverable
//               health);
//   a heal:     the liquid rises, with a flash;
//   low:        under a quarter of its max HP, it turns orange and beats;
//   its motion: calm at rest; stirred by a hit or a heal, then calming down;
//   the Knell:  its shadow creeps over the bar from the left, a skull at its edge, the skulls left
//               (purifications to go) written in it (combat.html, glasBarre): once the HP fall under
//               it, the card dies.

import { Container, Text } from 'pixi.js';
import { COMBAT } from '../config/combat.ts';
import { cornerQuad, makeMesh } from '../engine/shader.ts';
import { detach, every, tween } from '../engine/time.ts';

// The mesh is the bar plus `uPad` px around it: the edges waver out of the bar's box, the shadow too.
const RIBBON = `
// distance to a horizontal capsule from x0 to x1, radius r (px, < 0 inside)
float capsule(vec2 p, float x0, float x1, float r){ return length(vec2(p.x - clamp(p.x, x0, x1), p.y)) - r; }

void main(void){
  vec2 p = vUV * (uSize + 2.0 * uPad) - uPad;   // bar space: 0..uSize inside the bar's box
  float h = uSize.y * 0.5;
  // the thread wavers gently
  float wob = (fbm(vec2(p.x * 0.05 - uTime * 0.45, 1.7)) - 0.5) * h * 0.7;
  float r = h * (0.85 + 0.2 * noise(vec2(p.x * 0.012 + uTime * 0.25, 4.2)));
  vec2 q = vec2(p.x, p.y - h - wob);
  float len = uSize.x;
  // the liquid's end wavers too
  float end = sin(q.y * 0.7 + uTime * 5.0) * 1.3 + (noise(vec2(q.y * 0.4, uTime * 2.0)) - 0.5) * 2.0;
  float dAll = capsule(q, h, len - h, r);
  float dHp = uHp > 0.002 ? capsule(q, h, max(h, uHp * len - h + end), r) : 1e4;
  float dLag = uLag > 0.002 ? capsule(q, h, max(h, uLag * len - h + end), r) : 1e4;
  float aa = 0.6;
  float all = 1.0 - smoothstep(-aa, aa, dAll);
  float hp = 1.0 - smoothstep(-aa, aa, dHp);
  float lag = (1.0 - smoothstep(-aa, aa, dLag)) * (1.0 - hp);
  // under it: a soft shadow, darker where the bar is empty
  float shadow = 0.35 * exp(-max(dAll, 0.0) / (h * 0.35)) * (1.0 - all) + 0.32 * all * (1.0 - hp - lag);
  // an essence of light, not a glossy tube: deep at its edges, lit from its core
  float y = clamp((q.y + r) / (2.0 * r), 0.0, 1.0);
  float core = pow(1.0 - abs(y - 0.5) * 2.0, 1.6);
  float flow = noise(vec2(p.x * 0.05 - uTime * 0.6, q.y * 0.2 + uTime * 0.15));
  vec3 deep = vec3(0.04, 0.36, 0.2), lit = vec3(0.45, 0.9, 0.6);
  float beat = 0.5 + 0.5 * sin(uTime * 7.0);
  deep = mix(deep, vec3(0.28, 0.08, 0.02), uLow);
  lit = mix(lit, mix(vec3(1.0, 0.62, 0.25), vec3(1.0, 0.4, 0.18), beat), uLow);
  vec3 col = mix(deep, lit, core * (0.75 + 0.35 * flow));
  // a fine lighter rim just inside its edge: what draws its shape
  float rim = exp(-abs(dHp + 1.2) / 0.8) * 0.35;
  col += lit * rim;
  col += lit * uHeal * 0.6 * core;
  vec3 red = mix(vec3(0.42, 0.04, 0.05), vec3(0.9, 0.25, 0.22), core * (0.75 + 0.35 * flow));
  red += vec3(0.9, 0.3, 0.25) * exp(-abs(dLag + 1.2) / 0.8) * 0.3;
  // waves running along it spill over its edges, above and below, thinner than its core
  float side = q.y < 0.0 ? 1.0 : -1.0;
  float bump = max(0.0, fbm(vec2(p.x * 0.04 - uTime * 0.9 * side, side * 3.1 + uTime * 0.25)) - 0.36) * 1.7;
  float dSpill = uHp > 0.002 ? capsule(q, h, max(h, uHp * len - h + end), r + uSpill * pow(bump, 1.3)) : 1e4;
  float spill = (1.0 - smoothstep(-aa, aa, dSpill)) * (1.0 - hp) * (1.0 - lag);
  float beyond = clamp((abs(q.y) - r) / max(uSpill, 1.0), 0.0, 1.0);
  float sAlpha = spill * (0.55 - 0.35 * beyond);
  vec3 sCol = mix(lit, deep, beyond * 0.6) * (0.85 + 0.3 * flow);
  float a = (hp + lag) * uAlpha;
  vec3 c = (col * hp + red * lag) * uAlpha + sCol * sAlpha * uAlpha;
  a += sAlpha * uAlpha;
  float sa = shadow * uAlpha * (1.0 - a);
  // the Knell's shadow, over the liquid and the empty part alike, from the left to its edge
  float kx = uKnell * len;
  float kIn = (1.0 - smoothstep(-aa, aa, dAll + 1.5)) * (1.0 - smoothstep(kx - 1.5, kx + 1.5, p.x)) * step(0.002, uKnell);
  vec3 kCol = mix(vec3(0.03, 0.01, 0.05), vec3(0.18, 0.06, 0.4), clamp(p.x / max(kx, 1.0), 0.0, 1.0));
  kCol += vec3(0.43, 0.16, 0.85) * 0.5 * core * (0.6 + 0.4 * noise(vec2(p.x * 0.08 + uTime, q.y * 0.3)));
  float kEdge = exp(-abs(p.x - kx) / 3.0) * step(0.002, uKnell) * (1.0 - smoothstep(-aa, h * 1.2, dAll));
  vec3 outC = mix(c, kCol * uAlpha, kIn);
  float outA = mix(a + sa, 0.96 * uAlpha, kIn);
  outC += vec3(0.6, 0.45, 1.0) * kEdge * 0.9 * uAlpha;
  outA = max(outA, kEdge * 0.9 * uAlpha);
  finalColor = vec4(outC, outA);
}`;

const label = (size: number, resolution: number) =>
  new Text({
    text: '',
    anchor: 0.5,
    resolution,
    style: {
      fontFamily: ['Lilita One', 'Arial Black', 'sans-serif'],
      fontSize: size,
      fill: 0xffffff,
      stroke: { color: 0x000000, width: Math.max(2, size * 0.2), join: 'round' },
    },
  });

export class LifeBar {
  readonly root = new Container({ label: 'life-bar' });
  private readonly ribbon;
  private readonly nameText: Text;
  private readonly hpText: Text;
  private readonly skull: Text;
  private readonly skulls: Text;
  private readonly width: number;
  private readonly barY: number;
  // the Knell's threshold (% of the max HP), null: no Knell
  private knelled: number | null = null;
  private knellRun = 0;
  private max = 1;
  private hp = 0;
  private hits = 0;
  // how fast the liquid moves: calm at rest, stirred when the bar changes (COMBAT.lifeBar.pace)
  private stir = 0;

  /** Centred on `x`; `y`: the top of its block (the name, then the bar, then the HP). */
  constructor(o: { x: number; y: number; width: number; resolution: number }) {
    const L = COMBAT.lifeBar;
    this.root.position.set(o.x, o.y);
    const pad = L.height + L.spill * 1.5;
    this.ribbon = makeMesh(
      'combat-life-bar',
      RIBBON,
      {
        uSize: [o.width, L.height],
        uPad: pad,
        uSpill: L.spill,
        uHp: 0,
        uLag: 0,
        uHeal: 0,
        uLow: 0,
        uKnell: 0,
        uTime: Math.random() * 10,
        uAlpha: 0,
      },
      { geometry: cornerQuad(), blend: 'normal' },
    );
    const barY = L.nameSize * 1.3;
    this.ribbon.mesh.scale.set(o.width + 2 * pad, L.height + 2 * pad);
    this.ribbon.mesh.position.set(-o.width / 2 - pad, barY - pad);
    this.nameText = label(L.nameSize, o.resolution);
    this.nameText.position.set(0, L.nameSize * 0.55);
    this.hpText = label(L.hpSize, o.resolution);
    this.hpText.position.set(0, barY + L.height + L.hpSize * 0.75);
    this.nameText.alpha = this.hpText.alpha = 0;
    this.width = o.width;
    this.barY = barY;
    this.skull = label(L.height * 2.2, o.resolution);
    this.skull.text = '💀';
    this.skulls = label(L.height * 0.95, o.resolution);
    this.skulls.anchor.set(0, 0.5);
    this.skull.alpha = this.skulls.alpha = 0;
    this.placeKnell(0);
    this.root.addChild(this.ribbon.mesh, this.nameText, this.hpText, this.skulls, this.skull);
    every(this.root, (dt) => {
      const u = this.ribbon.u,
        S = COMBAT.lifeBar.pace;
      // its own time runs at its pace: the motion slows down without a jump
      this.stir = Math.max(0, this.stir - dt / S.settle);
      u.uTime += dt * (S.rest + (S.stirred - S.rest) * this.stir);
      u.uHeal = Math.max(0, u.uHeal - dt * 2.5);
      const low = this.hp > 0 && this.hp / this.max <= 0.25 ? 1 : 0;
      u.uLow += (low - u.uLow) * Math.min(1, dt * 4);
    });
  }

  private placeKnell(f: number): void {
    const L = COMBAT.lifeBar,
      y = this.barY + L.height / 2;
    this.ribbon.u.uKnell = f;
    this.skull.position.set(-this.width / 2 + f * this.width, y);
    this.skulls.position.set(-this.width / 2 + L.height * 0.4, y);
  }

  /**
   * The Knell on this fighter: `threshold` its shadow (% of the max HP; null: as it was, 0 when it is
   * laid), `skulls` the purifications left. `off`: it is silenced, its shadow withdraws.
   */
  knell(o: { threshold?: number | null; skulls?: number } | 'off'): void {
    const u = this.ribbon.u,
      from = u.uKnell;
    let to: number;
    if (o === 'off') {
      this.knelled = null;
      to = 0;
    } else {
      this.knelled = o.threshold ?? this.knelled ?? 0;
      to = Math.min(100, Math.max(0, this.knelled)) / 100;
      if (o.skulls !== undefined) this.skulls.text = '💀'.repeat(Math.max(0, o.skulls));
      else if (this.skulls.text === '') this.skulls.text = '💀💀💀';
    }
    const on = this.knelled !== null,
      a0 = this.skull.alpha,
      s0 = this.skulls.alpha,
      run = ++this.knellRun;
    detach(
      tween(
        900,
        (k) => {
          if (this.knellRun !== run) return;
          this.placeKnell(from + (to - from) * k);
          this.skull.alpha = a0 + ((on ? 1 : 0) - a0) * k;
          // the skulls left show once the shadow is wide enough to hold them
          const room = u.uKnell * this.width - this.skulls.width - COMBAT.lifeBar.height;
          this.skulls.alpha = on ? Math.min(1, Math.max(0, room / 20)) : s0 * (1 - k);
          this.skull.scale.set(1 + 0.25 * Math.sin(Math.PI * k));
        },
        'in-out-quad',
        this.root,
      ),
    );
  }

  private show(hp: number): void {
    this.hpText.text = `${Math.max(0, Math.round(hp))} / ${Math.round(this.max)}`;
  }

  /** A new fighter: its name shows, the bar fills to its HP. */
  async enter(name: string, hp: number, max: number): Promise<void> {
    this.nameText.text = name;
    if (this.knelled !== null || this.ribbon.u.uKnell > 0) {
      this.knelled = null;
      this.knellRun++;
      this.placeKnell(0);
      this.skull.alpha = this.skulls.alpha = 0;
      this.skulls.text = '';
    }
    this.max = Math.max(1, max);
    this.hp = hp;
    this.show(hp);
    const u = this.ribbon.u,
      to = Math.max(0, hp) / this.max;
    u.uHp = u.uLag = 0;
    await tween(
      700,
      (k) => {
        u.uAlpha = Math.min(1, k * 3);
        this.nameText.alpha = this.hpText.alpha = Math.min(1, k * 3);
        u.uHp = u.uLag = to * k;
      },
      'out-cubic',
      this.root,
    );
  }

  /** The line's HP and max HP: a hit leaves its red part to drain, a heal rises with a flash. */
  set(hp: number, max: number): void {
    if (hp === this.hp && max === this.max) return;
    const u = this.ribbon.u,
      before = u.uHp;
    this.hp = hp;
    this.max = Math.max(1, max);
    this.show(hp);
    this.stir = 1;
    const to = Math.max(0, hp) / this.max;
    if (to < before) {
      // the hit: at once; the red part stays a moment, then drains. A newer hit restarts the wait.
      u.uHp = to;
      u.uLag = Math.max(u.uLag, before);
      const hit = ++this.hits;
      detach(
        (async () => {
          await tween(COMBAT.lifeBar.lagHold, () => {}, 'linear', this.root);
          if (this.hits !== hit) return;
          const from = u.uLag;
          await tween(
            COMBAT.lifeBar.lagDrain,
            (k) => void (u.uLag = from + (u.uHp - from) * k),
            'in-out-quad',
            this.root,
          );
        })(),
      );
    } else {
      // a heal, or a higher max
      u.uHeal = to > before ? 1 : 0;
      detach(
        tween(
          500,
          (k) => {
            u.uHp = before + (to - before) * k;
            u.uLag = Math.max(u.uLag, u.uHp);
          },
          'out-cubic',
          this.root,
        ),
      );
    }
  }

  async leave(): Promise<void> {
    const u = this.ribbon.u;
    await tween(
      300,
      (k) => {
        u.uAlpha = 1 - k;
        this.nameText.alpha = this.hpText.alpha = 1 - k;
        this.skull.alpha = Math.min(this.skull.alpha, 1 - k);
        this.skulls.alpha = Math.min(this.skulls.alpha, 1 - k);
      },
      'linear',
      this.root,
    );
  }
}
