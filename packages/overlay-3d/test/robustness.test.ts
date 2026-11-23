// An error in one animation or one event must not stop the others: the shared ticker keeps running,
// the queue goes on with the next event, and loops end with the objects they animate.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Container, Ticker } from 'pixi.js';
import { afterEach, beforeAll, expect, test } from 'vite-plus/test';
import { createPlayer } from '../src/engine/player.ts';
import { detach, every, setErrorReporter, tween } from '../src/engine/time.ts';

// No browser here: the ticker is driven by hand, one 16 ms frame per call.
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
const reported: unknown[] = [];
setErrorReporter((err) => reported.push(err));
afterEach(() => {
  reported.length = 0;
});

test('a tween that throws rejects, and the other tweens keep running', async () => {
  let other = 0;
  const failing = tween(100, () => {
    throw new Error('boom');
  });
  const fine = tween(100, (u) => {
    other = u;
  });
  expect(() => frames(10)).not.toThrow(); // Pixi would stop the shared ticker on a throwing listener
  await expect(failing).rejects.toThrow('boom');
  await expect(fine).resolves.toBeUndefined();
  expect(other).toBe(1);
});

test('a loop that throws is removed and reported; the other loops keep running', () => {
  const owner = new Container();
  let calls = 0,
    ticks = 0;
  every(owner, () => {
    calls++;
    throw new Error('loop');
  });
  const ok = every(owner, () => ticks++);
  frames(3);
  expect(calls).toBe(1);
  expect(ticks).toBe(3);
  expect(reported).toHaveLength(1);
  ok.stop();
});

test('a loop stops when its owner is destroyed', () => {
  const owner = new Container();
  let ticks = 0;
  every(owner, () => ticks++);
  frames(2);
  owner.destroy();
  frames(3);
  expect(ticks).toBe(2);
});

test('a tween stops and resolves once the object it animates is destroyed', async () => {
  const owner = new Container();
  let calls = 0;
  const t = tween(1000, () => calls++, 'linear', owner);
  frames(2);
  owner.destroy();
  frames(3);
  await expect(t).resolves.toBeUndefined();
  expect(calls).toBe(2);
});

test('a detached animation that fails is reported and still cleaned up', async () => {
  let cleaned = false;
  detach(
    tween(50, () => {
      throw new Error('detached');
    }),
    () => {
      cleaned = true;
    },
  );
  frames(2);
  await new Promise((r) => setTimeout(r, 0));
  expect(cleaned).toBe(true);
  expect(reported).toHaveLength(1);
});

test('the queue reports a failed event and plays the next one', async () => {
  const played: string[] = [],
    failed: string[] = [];
  type Ev = { t: 'booster'; id: string };
  const player = createPlayer<Ev>(
    {
      booster: async (ev) => {
        if (ev.id === 'bad') throw new Error('bad event');
        played.push(ev.id);
      },
    },
    { onError: (_err, ev) => failed.push(ev.id) },
  );
  player.push({ t: 'booster', id: 'a' });
  player.push({ t: 'booster', id: 'bad' });
  player.push({ t: 'booster', id: 'b' });
  await new Promise((r) => setTimeout(r, 0));
  expect(played).toEqual(['a', 'b']);
  expect(failed).toEqual(['bad']);
  expect(player.busy).toBe(false);
});

test('a reporter that throws does not stop the queue', async () => {
  const played: string[] = [];
  type Ev = { t: 'x'; id: string };
  const player = createPlayer<Ev>(
    {
      x: async (ev) => {
        if (ev.id === 'bad') throw new Error('bad');
        played.push(ev.id);
      },
    },
    {
      onError: () => {
        throw new Error('reporter');
      },
    },
  );
  player.push({ t: 'x', id: 'bad' });
  player.push({ t: 'x', id: 'ok' });
  await new Promise((r) => setTimeout(r, 0));
  expect(played).toEqual(['ok']);
});

// Only engine/time.ts adds to the ticker: any other listener would escape its error guard.
test('nothing but engine/time.ts touches the ticker', () => {
  const src = join(import.meta.dirname, '..', 'src');
  const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) =>
    f.endsWith('.ts'),
  );
  const offenders = files.filter(
    (f) =>
      f !== join('engine', 'time.ts') &&
      /\bTicker\b|\.ticker\b/.test(readFileSync(join(src, f), 'utf8')),
  );
  expect(offenders).toEqual([]);
});
