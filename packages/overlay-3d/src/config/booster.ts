// Booster scene: sizes, timings (ms) and pacing. Plain data, like rarities.ts.

import type { BoosterConfig, BoosterZone, Pacing } from './types.ts';

export const BOOSTER: BoosterConfig = {
  // Centred on a 1920 x 1080 stream, as big as the legacy overlay's (its cards: 15vw wide), the same box
  // whatever the card count: the grid picks its rows (5 -> 1 x 5, 10 -> 2 x 5, 15 -> 8 + 7). Other sizes can get their own box
  // (a profile with a higher `from`).
  zones: [{ from: 1, anchor: 'centre', width: 1760, height: 900, margin: 40 }],
  // No darkening by default, like the legacy overlay: the stream stays as it is around the cards.
  backdrop: { alpha: 0, feather: 60 },
  title: {
    text: '{pseudo} ouvre un {booster} !',
    size: 52,
    band: 96,
    shadow: { blur: 3, distance: 2, alpha: 0.8 },
    outline: 2,
  },
  pack: {
    height: 540,
    enter: 900,
    settle: 200,
    shake: 1100,
    tear: 800,
    exit: 650,
    foil: {
      puff: [0.04, 0.1],
      crinkle: [0.2, 0.45],
      enterTurn: 0.5,
      shakeTurn: 0.18,
      fold: 2.4,
      tear: 0.025,
      perspective: 3,
    },
  },
  // A booster holds 5, 10 or 15 cards (any count works): a grid, as big as the area allows.
  cards: {
    padding: 24,
    maxWidth: 0.19,
    maxRows: 4,
    gap: 0.1,
    rise: 700,
    deal: 550,
    dealStagger: 70,
  },
  // Small boosters: every card has its moment. Big ones: one by one, 15 reveals would last about a
  // minute, so the common rarities go in a cascade.
  pacing: [
    { from: 1, order: 'rarity', quick: [], cascade: 400, betweenReveals: 350 },
    { from: 10, order: 'rarity', quick: ['commun'], cascade: 350, betweenReveals: 350 },
    { from: 15, order: 'rarity', quick: ['commun', 'rare'], cascade: 220, betweenReveals: 350 },
  ],
  hold: 3500,
  sweep: { duration: 1300, spacing: 0.16 },
};

// Of a list of profiles by booster size, the one for n cards: the last whose `from` is at most n (the
// first one below them all).
export function bySize<T extends { from: number }>(list: readonly T[], n: number, what: string): T {
  const sorted = [...list].sort((a, b) => a.from - b.from);
  const first = sorted[0];
  if (!first) throw new Error(`BOOSTER.${what} is empty`);
  return sorted.filter((p) => p.from <= n).at(-1) ?? first;
}
export const pacingFor = (n: number, pacing: readonly Pacing[] = BOOSTER.pacing): Pacing =>
  bySize(pacing, n, 'pacing');
export const zoneFor = (n: number, zones: readonly BoosterZone[] = BOOSTER.zones): BoosterZone =>
  bySize(zones, n, 'zones');
