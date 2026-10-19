// The collection's filters, sort and selected card live in the address (`#/collection?type=magie`):
// a reload keeps them and a link shares them. Every field is optional, a missing or invalid one
// means its default, so the address only carries what differs from the default view.

import { z } from 'zod';
import { CARD_TYPES } from '@/data/cards';

export const SORTS = {
  rarete: 'Rareté',
  nom: 'Nom',
  atq: 'ATQ',
  pv: 'PV',
} as const;
export type Sort = keyof typeof SORTS;

const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

export const CollectionSearch = z.object({
  q: optional(z.string()),
  type: optional(z.enum(CARD_TYPES)),
  group: optional(z.string()),
  rarity: optional(z.string()),
  dup: optional(z.boolean()),
  sort: optional(z.enum(Object.keys(SORTS) as [Sort, ...Sort[]])),
  card: optional(z.number()),
});
export type CollectionSearch = z.infer<typeof CollectionSearch>;
