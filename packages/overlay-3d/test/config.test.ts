// The configuration: the typed one (config/*.ts) must pass the run-time check, and the run-time check
// must name what is wrong in a JSON configuration.

import { expect, test } from 'vite-plus/test';
import { TIERS } from '@forestcard/layout';
import { BOOSTER, pacingFor } from '../src/config/booster.ts';
import { RARITIES } from '../src/config/rarities.ts';
import { checkRarity } from '../src/config/validate.ts';
import { FX } from '../src/fx/registry.ts';
import { REVEAL_SHADERS } from '../src/reveal/registry.ts';
import { drawReveal } from '../src/reveal/reveal.ts';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const errorsOf = (v: unknown) => {
  const r = checkRarity(v);
  return r.ok ? [] : r.errors;
};

test('every tier has a configuration, and every configuration passes the run-time check', () => {
  expect(Object.keys(RARITIES).sort()).toEqual([...TIERS].sort());
  for (const tier of TIERS) expect(errorsOf(clone(RARITIES[tier])), tier).toEqual([]);
});

test('the configuration is plain data: it survives a JSON round trip', () => {
  expect(clone(RARITIES)).toEqual(RARITIES);
  expect(clone(BOOSTER)).toEqual(BOOSTER);
});

test('an unknown effect, an unknown parameter, a wrong type: each named by its path', () => {
  const c = clone(RARITIES.legendaire) as unknown as {
    burst: Record<string, unknown>[];
    ambient: Record<string, unknown>[];
  };
  c.burst[0] = { fx: 'braise' };
  c.burst[1] = { fx: 'aura', intensite: 1 };
  c.burst[2] = { fx: 'sparks', count: 'beaucoup' };
  c.ambient[1] = { fx: 'foil', drift: [30] };
  const errors = errorsOf(c);
  expect(errors).toContainEqual(expect.stringContaining('burst[0].fx : effet inconnu "braise"'));
  expect(errors).toContainEqual(expect.stringContaining('burst[1].intensite : paramètre inconnu'));
  expect(errors).toContainEqual(
    expect.stringContaining('burst[2].count : attendu number, reçu string'),
  );
  expect(errors).toContainEqual(
    expect.stringContaining('ambient[1].drift : attendu list of 2, reçu list of 1'),
  );
});

test('a reveal: unknown shader, unknown shader parameter, unknown easing', () => {
  const c = clone(RARITIES.epique) as unknown as { reveal: Record<string, unknown> };
  expect(errorsOf({ ...c, reveal: { ...c.reveal, shader: 'smoke' } })).toContainEqual(
    expect.stringContaining('reveal.shader : révélation inconnue "smoke"'),
  );
  expect(errorsOf({ ...c, reveal: { ...c.reveal, params: { celles: 4 } } })).toContainEqual(
    expect.stringContaining('reveal.params.celles : paramètre inconnu'),
  );
  expect(errorsOf({ ...c, reveal: { ...c.reveal, ease: 'bounce' } })).toContainEqual(
    expect.stringContaining('reveal.ease : courbe inconnue'),
  );
});

test('reveal variants: each checked under its index, an empty list refused, "edge" accepted', () => {
  const c = clone(RARITIES.legendaire) as unknown as { reveal: Record<string, unknown>[] };
  expect(Array.isArray(c.reveal)).toBe(true);
  const [first, second] = c.reveal as [Record<string, unknown>, Record<string, unknown>];
  expect(errorsOf({ ...c, reveal: [first, { ...second, duration: 'long' }] })).toContainEqual(
    expect.stringContaining('reveal[1].duration : attendu un nombre de ms'),
  );
  expect(errorsOf({ ...c, reveal: [] })).toContainEqual(
    expect.stringContaining('reveal : une liste de variantes ne peut pas être vide'),
  );
  expect(errorsOf({ ...c, reveal: [{ ...first, origin: 'edge' }] })).toEqual([]);
  expect(errorsOf({ ...c, reveal: [{ ...first, origin: 'corner' }] })).toContainEqual(
    expect.stringContaining('reveal[0].origin'),
  );
});

test("a card draws one of its rarity's reveal variants, or plays its single reveal", () => {
  const variants = RARITIES.ggez.reveal;
  expect(Array.isArray(variants)).toBe(true);
  const seen = new Set<unknown>();
  for (let i = 0; i < 200; i++) seen.add(drawReveal(variants));
  expect([...seen].every((r) => (variants as readonly unknown[]).includes(r))).toBe(true);
  expect(seen.size).toBe((variants as readonly unknown[]).length);
  expect(drawReveal(RARITIES.commun.reveal)).toBe(RARITIES.commun.reveal);
});

test('every reveal shader uses the uniforms its parameters map to', () => {
  for (const [name, def] of Object.entries(REVEAL_SHADERS)) {
    for (const uniform of Object.values(def.uniforms))
      expect(def.body, `${name} ${uniform}`).toContain(uniform);
  }
});

test('every effect draws on a known layer', () => {
  const layers = ['under', 'frame', 'drawing', 'over', 'behind', 'scene'];
  for (const [name, def] of Object.entries(FX)) expect(layers, name).toContain(def.layer);
});

test('the pacing follows the booster size: one by one at 5, commons in a cascade at 10, commons and rares at 15', () => {
  expect(pacingFor(5).quick).toEqual([]);
  expect(pacingFor(10).quick).toEqual(['commun']);
  expect(pacingFor(12).from).toBe(10);
  expect(pacingFor(15).quick).toEqual(['commun', 'rare']);
  expect(pacingFor(40).from).toBe(15);
  expect(pacingFor(0).from).toBe(1); // below every profile: the first one
});
