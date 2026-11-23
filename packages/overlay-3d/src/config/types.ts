// The shape of the configuration. Plain data (JSON-safe): it could come from the database.

import type { Anchor } from '../engine/stage.ts';
import type { Tier } from '@forestcard/layout';
import type { Easing } from '../engine/time.ts';
import type { FxEntry } from '../fx/registry.ts';
import type { RevealShaderName, RevealShaderParams } from '../reveal/registry.ts';

// Perspective flip (card/flip.ts).
export type FlipReveal = {
  kind: 'flip';
  duration: number;
  halfTurns?: number; // 1: a plain flip; 3: one and a half turns
  lift?: number;
  ease?: Easing;
  after?: readonly FxEntry[]; // effects once the card has landed
};

// The card trembles and swells before a shader reveal.
export type Anticipation = { duration: number; shake: number; swell: number };

// Shader reveal (reveal/*.ts): the back goes away pixel by pixel.
export type ShaderReveal = {
  [N in RevealShaderName]: {
    kind: 'shader';
    shader: N;
    duration: number;
    ease?: Easing;
    // where it starts: a random point inside the card, a random point on one of its edges, or [x, y]
    // (0..1 across the card)
    origin?: 'random' | 'edge' | readonly [number, number];
    burstAt?: number; // 0..1 of the reveal: when the burst effects fire
    anticipation?: Anticipation;
    params?: Partial<RevealShaderParams<N>>;
  };
}[RevealShaderName];

export type Reveal = FlipReveal | ShaderReveal;

export type RarityConfig = {
  name: string;
  colour: string; // raretes.couleur in the database; every effect is tinted with it
  rainbow?: boolean; // a rainbow palette instead of the colour
  ambient: readonly FxEntry[]; // effects living on the card while it is shown
  // one reveal, or a list of variants: each card draws one, so two reveals of a rarity differ in kind,
  // not only in their random seed and origin
  reveal: Reveal | readonly Reveal[];
  burst: readonly FxEntry[]; // one-shot effects when the face appears
};

// Every tier has its configuration: a tier added to the layout's TIERS does not compile until it has one.
export type Rarities = Record<Tier, RarityConfig>;

export type Pacing = {
  from: number; // smallest card count this pacing applies to
  order: 'rarity' | 'given'; // 'rarity': rarest last, on the grid and in time
  quick: readonly Tier[]; // revealed in an overlapping cascade
  cascade: number; // ms between two quick reveals
  betweenReveals: number; // pause after each of the other reveals, shown one at a time
};

// Where the booster plays, in stage pixels (1920 x 1080): a box anchored to a corner, a side or the
// centre. One per booster size, chosen like the pacing (the last whose `from` is at most the card count).
export type BoosterZone = {
  from: number;
  anchor: Anchor;
  width: number;
  height: number;
  margin: number; // from the stage edges the box touches
};

export type BoosterConfig = {
  zones: readonly BoosterZone[];
  backdrop: { alpha: number; feather: number }; // darkening behind the zone (0: none), soft-edged (feather in px)
  // {pseudo} and {booster} replaced; size px; band = room kept above the cards.
  // Over the stream, whatever its colour: a short shadow under the letters (distance px, straight down)
  // and a thin dark outline (outline px; 0 = none) keep white text readable on a white background.
  title: {
    text: string;
    size: number;
    band: number;
    shadow: { blur: number; distance: number; alpha: number };
    outline: number;
  };
  pack: {
    height: number; // px at most; less if the cards' grid is shorter
    enter: number; // ms, rising from below the screen's bottom edge
    settle: number;
    shake: number;
    tear: number;
    exit: number; // ms, the torn pack slides down and fades while the cards come out
    // the pack as a foil object (scenes/foil-pack.ts). puff: dome height, in pack heights, at rest ->
    // at the end of the shake; crinkle: strength of the foil's creases, same; enterTurn, shakeTurn: 3D
    // turns (rad) while it rises and while it shakes; fold: the flap's fold before it flies (rad);
    // tear: the tear line's jag, in pack heights; perspective: camera distance, in pack heights
    foil: {
      puff: readonly [number, number];
      crinkle: readonly [number, number];
      enterTurn: number;
      shakeTurn: number;
      fold: number;
      tear: number;
      perspective: number;
    };
  };
  cards: {
    padding: number; // px between the zone's edges and the cards
    maxWidth: number; // one card at most, fraction of the cards' area width
    maxRows: number;
    gap: number; // fraction of a card's width
    rise: number; // ms, the face-down stack comes out of the pack
    deal: number; // ms, one card from the stack to its place
    dealStagger: number; // ms between two cards leaving the stack
  };
  // One pacing per booster size. The one used is the last whose `from` is at most the card count
  // (with 5, 10 and 15: a 5-card booster uses `from: 1`, a 12-card one `from: 10`).
  pacing: readonly Pacing[];
  hold: number; // ms the revealed cards stay on screen
  // The revealed cards leave to the left, as if a hand took the rightmost card and pushed the row: each
  // card starts moving when the pile reaches it, the pile slides out of the screen.
  sweep: { duration: number; spacing: number }; // ms; spacing: between piled cards, fraction of a card's width
};
