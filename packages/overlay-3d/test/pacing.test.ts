// At rest, the drawing slows down to IDLE_FPS; it goes back to the cap as soon as something moves, and
// slows down again only once the last animation has had its final frame drawn.

import { Container, Ticker, type Application } from 'pixi.js';
import { beforeAll, expect, test } from 'vite-plus/test';
import { IDLE_FPS, capFrameRate, every, tween } from '../src/engine/time.ts';

beforeAll(() => {
  globalThis.requestAnimationFrame ??= () => 0;
  globalThis.cancelAnimationFrame ??= () => {};
  Ticker.shared.autoStart = false;
  Ticker.shared.stop();
});
let now = 0;
const frames = (n: number) => {
  for (let i = 0; i < n; i++) Ticker.shared.update((now += 16));
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// what capFrameRate touches of an application: its ticker's cap
const app = { ticker: { maxFPS: 0 } } as unknown as Application;

test('nothing moves: the drawing slows down, not at once', async () => {
  capFrameRate(app, 60);
  expect(app.ticker.maxFPS).toBe(60);
  await sleep(300);
  expect(app.ticker.maxFPS).toBe(IDLE_FPS);
});

test('an animation brings the cap back; its end slows down after a while', async () => {
  capFrameRate(app, 60);
  await sleep(300);
  const done = tween(100, () => {});
  expect(app.ticker.maxFPS).toBe(60);
  frames(10);
  await done;
  expect(app.ticker.maxFPS).toBe(60); // its last frame still to draw
  await sleep(300);
  expect(app.ticker.maxFPS).toBe(IDLE_FPS);
});

test('a loop keeps the cap until it stops or its owner goes', async () => {
  capFrameRate(app, 30);
  const owner = new Container();
  const loop = every(owner, () => {});
  await sleep(300);
  expect(app.ticker.maxFPS).toBe(30);
  owner.destroy();
  frames(3); // the loop sees its owner gone and leaves (at 30 FPS, a frame every other 16 ms)
  await sleep(300);
  expect(app.ticker.maxFPS).toBe(IDLE_FPS);
  loop.stop();
});

test('a cap under IDLE_FPS stays the cap at rest', async () => {
  capFrameRate(app, 2);
  await sleep(300);
  expect(app.ticker.maxFPS).toBe(2);
});
