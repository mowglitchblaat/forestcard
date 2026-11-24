// An effect made stronger or weaker (ultimate modes, magic modes): its amounts multiplied by a
// factor, rounded, never below 1 when they were above 0. Only amounts scale (damage, %, stats);
// chances, durations, levels and counts stay as they are. A copy: the card data is shared between
// combats and never changed.

import type { EffectData } from '../model/card.ts';

const AMOUNTS = [
  'val',
  'degtour',
  'eclat',
  'degfrac',
  'ragev',
  'sval',
  'pctriposte',
  'bonus',
  'patq',
  'ppv',
  'pctatq',
  'pctcrit',
  'tntdeg',
  'pctmax',
  'matq',
  'mpv',
] as const;

export function scaleEffect(
  e: EffectData | null | undefined,
  factor: number,
): EffectData | null | undefined {
  if (!e || factor === 1) return e;
  const out: EffectData = { ...e };
  if (e.briques) out.briques = e.briques.map((b) => scaleEffect(b, factor) ?? null);
  for (const key of AMOUNTS) {
    const v = Number(e[key]);
    if (e[key] === '' || e[key] == null || !Number.isFinite(v) || v === 0) continue;
    const scaled = Math.round(v * factor);
    out[key] = v > 0 ? Math.max(1, scaled) : scaled;
  }
  return out;
}

/** Whether a factor changes the effect at all: it has an amount (in it or one of its bricks). */
export function hasAmounts(e: EffectData | null | undefined): boolean {
  if (!e) return false;
  if (e.briques?.some((b) => hasAmounts(b))) return true;
  return AMOUNTS.some((key) => {
    const v = Number(e[key]);
    return e[key] !== '' && e[key] != null && Number.isFinite(v) && v !== 0;
  });
}
