// Event queue: one event at a time, the next waits for the previous animation to end.
// The overlays receive facts (a booster opened, a combat journal) and play them; they never compute them.
//
// One queue per scene, the queues run side by side: boosters wait for each other, not for a combat.
// An event whose handler fails (throws, or its animation rejects, see engine/time.ts) is reported to
// onError and dropped; the queue goes on with the next one. Cleaning up after a failed event is the
// handler's job (a scene destroys what it built, in a finally).

export type OverlayEvent = { t: string };
export type Handlers<E extends OverlayEvent> = {
  [T in E['t']]?: (ev: Extract<E, { t: T }>) => Promise<void>;
};

export type Player<E extends OverlayEvent> = {
  push(ev: E): void;
  readonly busy: boolean;
  readonly pending: number;
};
export type PlayerOptions<E extends OverlayEvent> = { onError?: (err: unknown, ev: E) => void };

const report = (err: unknown, ev: OverlayEvent): void =>
  console.error(`[overlay] event "${ev.t}" failed`, err);

export function createPlayer<E extends OverlayEvent>(
  handlers: Handlers<E>,
  { onError = report }: PlayerOptions<E> = {},
): Player<E> {
  const queue: E[] = [];
  let busy = false;
  async function run() {
    if (busy) return;
    busy = true;
    for (let ev = queue.shift(); ev; ev = queue.shift()) {
      const h = handlers[ev.t as E['t']] as ((e: E) => Promise<void>) | undefined;
      if (!h) continue;
      try {
        await h(ev);
      } catch (err) {
        try {
          onError(err, ev);
        } catch {
          // a failing reporter must not stop the queue either
        }
      }
    }
    busy = false;
  }
  return {
    push(ev) {
      queue.push(ev);
      void run();
    },
    get busy() {
      return busy;
    },
    get pending() {
      return queue.length;
    },
  };
}
