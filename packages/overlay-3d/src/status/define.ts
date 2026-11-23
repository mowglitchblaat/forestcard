// A status on a card, as a combat shows it (the engine's statuses: StatusKind, packages/engine): a filter
// that transforms the card's picture itself (status/shaders.ts), on a built card's drawing (its frame,
// text and stats stay sharp) or on a flat card's whole face.
//   idle  while the status is on: uAmt eases to 1 when it lands, back to 0 when it ends;
//   tick  when it acts (a damage, an ATQ loss, a blocked attack…): uTick, up in 0.1 s, down over ~1 s.
// `acts`: the journal line that makes it act in a combat (packages/journal/src/project.ts), or null for a
// status that never acts after it lands.

// `layer`: where it goes in the chain of several statuses, whatever order they landed in. 'cover':
// it covers the picture (blood, ice, stone, a veil): first. 'detail': it adds marks over it (bubbles,
// flames, stars, cracks): after, so they stay seen.
export type StatusFxDef = {
  shader: string;
  acts: string | null;
  layer: 'cover' | 'detail';
};

export const defineStatusFx = (def: StatusFxDef): StatusFxDef => def;
