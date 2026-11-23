// Running effects named by a configuration.

import type { Stoppable } from '../engine/time.ts';
import { fxDef, type FxEntry } from './registry.ts';
import type { FxContext } from './types.ts';

const NOTHING: Stoppable = { stop() {} };

export function runFx(entry: FxEntry, ctx: FxContext): Stoppable {
  const def = fxDef(entry.fx);
  const { fx: _name, delay, ...overrides } = entry;
  const params = { ...def.defaults, ...overrides };
  const layer = ctx.layers[def.layer];
  if (!layer) return NOTHING; // this context has no such layer (e.g. no 'scene' around a lone card)
  let handle: Stoppable | void,
    stopped = false;
  const start = () => {
    if (!stopped) handle = def.run({ ...ctx, layer }, params);
  };
  const timer = delay ? setTimeout(start, delay) : (start(), undefined);
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      handle?.stop();
    },
  };
}

export const runAll = (entries: readonly FxEntry[] | undefined, ctx: FxContext): Stoppable[] =>
  (entries ?? []).map((e) => runFx(e, ctx));
