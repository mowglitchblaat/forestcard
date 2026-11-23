// The card images are unloaded once nobody shows them, and never while someone does: a held texture
// stays, a kept one stays for good, and a load and an unload of the same key never cross.

import { Assets, Texture } from 'pixi.js';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { TextureStore } from '../src/card/texture-store.ts';

let loads: string[] = [];
let unloads: string[] = [];
// a load ends when the test says so
let pending = new Map<string, () => void>();
let gate = false;
beforeEach(() => {
  loads = [];
  unloads = [];
  pending = new Map();
  gate = false;
  vi.spyOn(Assets, 'load').mockImplementation((async (a: { alias: string; src: string }) => {
    loads.push(a.alias);
    if (a.src.includes('missing')) throw new Error('404');
    if (gate) await new Promise<void>((done) => pending.set(a.alias, done));
    return Texture.EMPTY;
  }) as unknown as typeof Assets.load);
  vi.spyOn(Assets, 'unload').mockImplementation((async (k: string) => {
    unloads.push(k);
  }) as unknown as typeof Assets.unload);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const store = () => new TextureStore((k) => `/${k}`);
const settle = () => new Promise((r) => setTimeout(r, 0));

test('a texture goes when its last holder lets it go, not before', async () => {
  const s = store();
  const a = await s.hold(['x', 'y']);
  const b = await s.hold(['x']);
  expect(loads).toEqual(['x', 'y']); // loaded once
  a();
  await settle();
  expect(unloads).toEqual(['y']);
  expect(s.textures.x).toBeDefined();
  b();
  await settle();
  expect(unloads).toEqual(['y', 'x']);
  expect(s.textures).toEqual({});
});

test('a release called twice counts once', async () => {
  const s = store();
  const a = await s.hold(['x']);
  const b = await s.hold(['x']);
  a();
  a();
  await settle();
  expect(unloads).toEqual([]);
  b();
  await settle();
  expect(unloads).toEqual(['x']);
});

test('a kept texture stays, even held and let go', async () => {
  const s = store();
  await s.keep({ dos: '/dos.webp' });
  (await s.hold(['dos']))();
  await settle();
  expect(unloads).toEqual([]);
  expect(s.textures.dos).toBeDefined();
});

test('two holds of a key being loaded share one load, and both count', async () => {
  const s = store();
  gate = true;
  const held = s.hold(['x']);
  const other = s.hold(['x']); // the same load, shared
  await settle();
  pending.get('x')!();
  const [a, b] = await Promise.all([held, other]);
  expect(loads).toEqual(['x']);
  a();
  b();
  await settle();
  expect(unloads).toEqual(['x']);
});

test('held again while it unloads: loaded anew after the unload', async () => {
  const s = store();
  (await s.hold(['x']))();
  const again = await s.hold(['x']);
  expect(unloads).toEqual(['x']);
  expect(loads).toEqual(['x', 'x']);
  expect(s.textures.x).toBeDefined();
  again();
});

test('a missing file is left out, and its holder still gets its release', async () => {
  const s = store();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const r = await s.hold(['missing']);
  expect(s.textures.missing).toBeUndefined();
  r();
  await settle();
  expect(unloads).toEqual([]);
  expect(s.size).toEqual({ loaded: 0, held: 0 });
});
