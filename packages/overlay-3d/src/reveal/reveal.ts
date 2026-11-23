// Reveals a card the way its rarity's configuration says (config/rarities.ts). Shared by every scene:
// the booster, the workbench, tomorrow the combat.

import type { ColorSource } from 'pixi.js';
import { W } from '@forestcard/layout';
import type { Card, SceneLayers } from '../card/card.ts';
import { makeFilter, type UniformValue } from '../engine/shader.ts';
import { rgb } from '../engine/textures.ts';
import { detach, tween, wait } from '../engine/time.ts';
import { runAll } from '../fx/run.ts';
import type { RarityConfig, Reveal, ShaderReveal } from '../config/types.ts';
import { revealShaderDef } from './registry.ts';

const randomOrigin = (): [number, number] => [0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6];
// a point on one of the four edges, a little inside
function edgeOrigin(): [number, number] {
  const t = 0.1 + Math.random() * 0.8;
  const side = Math.floor(Math.random() * 4);
  return side === 0 ? [t, 0.02] : side === 1 ? [0.98, t] : side === 2 ? [t, 0.98] : [0.02, t];
}
const originOf = (o: ShaderReveal['origin']): readonly [number, number] =>
  o === 'edge' ? edgeOrigin() : o === 'random' || !o ? randomOrigin() : o;

// The reveal a card plays: the rarity's one, or one of its variants drawn at random.
export function drawReveal(reveal: Reveal | readonly Reveal[]): Reveal {
  if (!Array.isArray(reveal)) return reveal as Reveal;
  const r = reveal[Math.floor(Math.random() * reveal.length)];
  if (!r) throw new Error('a list of reveal variants is empty');
  return r;
}

// The filter of a reveal shader, its parameters taken from the configuration over the defaults.
function revealFilter(r: ShaderReveal, colour: ColorSource, aspect: number) {
  const def = revealShaderDef(r.shader);
  const params: Readonly<Record<string, UniformValue | undefined>> = { ...r.params };
  const values: Record<string, UniformValue> = {
    uProgress: 0,
    uTime: 0,
    uColor: rgb(colour),
    uAspect: aspect,
    uSeed: Math.random() * 40,
    uOrigin: originOf(r.origin),
  };
  for (const [key, uniform] of Object.entries(def.uniforms))
    values[uniform] = params[key] ?? def.defaults[key]!;
  return makeFilter(
    `reveal-${r.shader}`,
    def.body,
    values as Record<string, UniformValue> & { uProgress: number; uTime: number },
    { textureHelpers: true },
  );
}

export async function revealCard(
  card: Card,
  rarity: RarityConfig,
  scene: SceneLayers,
  { live = false } = {},
): Promise<void> {
  const R = drawReveal(rarity.reveal);
  const burst = () => runAll(rarity.burst, card.fxContext(scene));

  if (R.kind === 'flip') {
    if (!scene.app)
      throw new Error('a flip needs the application (it renders the faces into textures)');
    await card.flip(scene.app, {
      duration: R.duration,
      halfTurns: R.halfTurns,
      lift: R.lift,
      ease: R.ease,
      live,
      onFace: burst,
    });
    runAll(R.after, card.fxContext(scene));
    return;
  }

  const p = card.root.position,
    s = card.root.scale.x,
    x0 = p.x,
    a = R.anticipation;
  if (a) {
    // the card trembles and swells
    await tween(a.duration, (u) => {
      p.x = x0 + Math.sin(u * 60) * W * s * a.shake * u;
      card.root.scale.set(s * (1 + a.swell * u));
    });
    p.x = x0;
  }
  detach(wait(R.duration * (R.burstAt ?? 0.5)).then(burst));
  await card.revealWith(revealFilter(R, rarity.colour, card.aspect), {
    duration: R.duration,
    ease: R.ease,
  });
  if (a) await tween(300, (u) => card.root.scale.set(s * (1 + a.swell * (1 - u))));
}
