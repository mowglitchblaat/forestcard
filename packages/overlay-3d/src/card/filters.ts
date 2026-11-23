// Several owners filter the same object (a card's drawing, its face): the statuses, the marks' tears. Each sets
// only its own filters; the others' stay. The chain runs in the owners' order (OWNERS): the marks after
// the statuses. Filters added by someone else (an effect that appends
// its own) keep their place before them.
// The input of the chain is the card's rectangle (`area`, layout units), whatever the picture overflows.

import type { Container, Filter, Rectangle } from 'pixi.js';

const OWNERS = ['statuses', 'marks'] as const;
export type FilterOwner = (typeof OWNERS)[number];

const owned = new WeakMap<Container, Partial<Record<FilterOwner, Filter[]>>>();

export function setOwnFilters(
  target: Container,
  owner: FilterOwner,
  list: readonly Filter[],
  area: Rectangle,
): void {
  const mine = owned.get(target) ?? {};
  owned.set(target, mine);
  const all = new Set(OWNERS.flatMap((o) => mine[o] ?? []));
  const foreign = (target.filters ?? []).filter((f) => !all.has(f));
  mine[owner] = [...list];
  const chain = [...foreign, ...OWNERS.flatMap((o) => mine[o] ?? [])];
  target.filters = chain.length ? chain : null;
  target.filterArea = OWNERS.some((o) => mine[o]?.length) ? area : undefined;
}
