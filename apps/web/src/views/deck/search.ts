// The deck page's address: `deck=<id>`, the deck shown (none: the combat deck); `mode=edition`, its
// cards being changed, the player's cards beside; `deck=nouveau&nom=…`, a new deck not saved yet
// (always in edition). The card grid's filters ride along (`#/deck?deck=3&mode=edition&type=magie`).

import { z } from 'zod';
import { CollectionSearch } from '@/views/collection/search';

export const NEW_DECK = 'nouveau';

export const DeckSearch = CollectionSearch.omit({ dup: true }).extend({
  deck: z.string().optional().catch(undefined),
  nom: z.string().optional().catch(undefined),
  mode: z.enum(['edition']).optional().catch(undefined),
});
export type DeckSearch = z.infer<typeof DeckSearch>;
