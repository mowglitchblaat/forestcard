// Time on Pixi's shared ticker. Everything that moves goes through here, so a scene can be paused,
// stepped or sped up in one place. Nothing else adds to the ticker (a test checks it).
//
// No callback may throw into the ticker. Pixi calls every listener in turn, then asks the browser for
// the next frame: an exception thrown by one listener skips both, and the shared ticker never runs
// again. Every tween and loop of every scene then freezes, their promises never settle, and the
// scenes' queues wait forever. So a callback that throws is removed from the ticker here: a tween
// rejects with the error (its scene fails, see engine/player.ts), a loop is reported to reportError.
//
// Every loop belongs to a display object (`owner`) and stops when it is destroyed: a scene that ends,
// or fails, destroys its containers, and with them every loop it started. Nothing keeps running on a
// destroyed object, whatever ended the scene.

import { Ticker, type Application, type Container, type Ticker as TickerType } from 'pixi.js';

export type Stoppable = { stop(): void };
export type EaseFn = (u: number) => number;

// Easing curves by name, so a configuration names them and stays plain data.
export type Easing =
  | 'linear'
  | 'smooth'
  | 'in-out-quad'
  | 'out-cubic'
  | 'out-back'
  | `in-${number}`;

export function easing(name: Easing | EaseFn = 'smooth'): EaseFn {
  if (typeof name === 'function') return name;
  switch (name) {
    case 'linear':
      return (u) => u;
    case 'smooth':
      return (u) => u * u * (3 - 2 * u);
    case 'in-out-quad':
      return (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
    case 'out-cubic':
      return (u) => 1 - Math.pow(1 - u, 3);
    case 'out-back':
      return (u) => 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2);
  }
  const power = Number(name.slice(3));
  if (!Number.isFinite(power)) throw new Error(`unknown easing "${name}"`);
  return (u) => Math.pow(u, power);
}

// Run fn(u) for u going 0 -> 1 over ms, eased; resolves at the end, rejects if fn throws.
// `owner`: the object animated; once it is destroyed (its scene ended), the tween stops and resolves.
// Detached animations (not awaited by their scene) pass it: they may outlive the scene that started them.
export const tween = (
  ms: number,
  fn: (u: number) => void,
  ease: Easing | EaseFn = 'linear',
  owner?: Container,
): Promise<void> =>
  new Promise((done, fail) => {
    const e = easing(ease);
    let t = 0;
    const tick = (tk: TickerType) => {
      if (owner?.destroyed) {
        unlisten(tick);
        done();
        return;
      }
      t += tk.deltaMS;
      const u = ms > 0 ? Math.min(1, t / ms) : 1;
      try {
        fn(e(u));
      } catch (err) {
        unlisten(tick);
        fail(err);
        return;
      }
      if (u >= 1) {
        unlisten(tick);
        done();
      }
    };
    listen(tick);
  });

export const wait = (ms: number): Promise<void> => tween(ms, () => {});

// The frame rate cap, for the drawing and for every animation: the application's ticker renders, the
// shared one (this module's) moves the animations; capping only the first would keep computing frames
// nobody sees. 0: no cap (the display's rate). A page sets it once, and may change it live.
//
// At rest, the drawing slows down. Every animation goes through this module, so it knows when nothing
// moves: no tween and no loop on the shared ticker (which then stops asking for frames by itself). The
// application's ticker would still redraw the same picture at the full rate, an overlay on stream doing
// so for hours between two boosters; it drops to IDLE_FPS instead. Not to zero: a change made without
// an animation (a card built, a group hidden from the panel) still shows, within 1 / IDLE_FPS s, with
// nothing to call. It goes back to the cap as soon as an animation starts; it slows down only REST_MS
// after the last one ended, so that the last one's final frame is drawn at once.
export const DEFAULT_MAX_FPS = 60;
export const IDLE_FPS = 4;
const REST_MS = 200;
let paced: { app: Application; fps: number } | null = null;
const moving = new Set<(tk: TickerType) => void>();
let resting: ReturnType<typeof setTimeout> | undefined;

export function capFrameRate(app: Application, fps: number = DEFAULT_MAX_FPS): void {
  paced = { app, fps };
  Ticker.shared.maxFPS = fps;
  app.ticker.maxFPS = fps;
  pace();
}

function pace(): void {
  if (!paced) return;
  if (moving.size) {
    clearTimeout(resting);
    resting = undefined;
    paced.app.ticker.maxFPS = paced.fps;
    return;
  }
  resting ??= setTimeout(() => {
    resting = undefined;
    if (moving.size || !paced) return;
    const { app, fps } = paced;
    app.ticker.maxFPS = fps > 0 ? Math.min(fps, IDLE_FPS) : IDLE_FPS;
  }, REST_MS);
}

// The only way onto the shared ticker: every listener counts as something moving.
function listen(tick: (tk: TickerType) => void): void {
  Ticker.shared.add(tick);
  moving.add(tick);
  pace();
}
function unlisten(tick: (tk: TickerType) => void): void {
  Ticker.shared.remove(tick);
  if (moving.delete(tick)) pace();
}

/** Where an error nobody awaits is reported: a loop that threw, a detached animation that failed. */
let reportError: (err: unknown) => void = (err) => console.error('[overlay]', err);
export const setErrorReporter = (handler: (err: unknown) => void): void => {
  reportError = handler;
};
export const report = (err: unknown): void => {
  try {
    reportError(err);
  } catch {
    // a failing reporter must not throw into the ticker either
  }
};

/**
 * An animation started and not awaited (a flash that fades, then is destroyed). `cleanup` runs whether
 * it ended or failed; a failure is reported instead of becoming an unhandled rejection.
 */
export function detach(p: Promise<unknown>, cleanup?: () => void): void {
  p.catch(report).finally(() => {
    try {
      cleanup?.();
    } catch (err) {
      report(err);
    }
  });
}

// Call fn(dt, t) (seconds) every frame until stop(), until `owner` is destroyed, or until fn throws.
export function every(owner: Container, fn: (dt: number, t: number) => void): Stoppable {
  let t = 0;
  const tick = (tk: TickerType) => {
    if (owner.destroyed) {
      unlisten(tick);
      return;
    }
    const dt = tk.deltaMS / 1000;
    t += dt;
    try {
      fn(dt, t);
    } catch (err) {
      unlisten(tick);
      report(err);
    }
  };
  listen(tick);
  return { stop: () => unlisten(tick) };
}
