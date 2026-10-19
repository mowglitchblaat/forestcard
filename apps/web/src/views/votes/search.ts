// The card being voted and the week of the results live in the address
// (`#/votes?carte=12&semaine=1`).

import { z } from 'zod';

export const VotesSearch = z.object({
  carte: z.coerce.number().int().positive().optional().catch(undefined),
  // 0: this week (the default), 1: last week.
  semaine: z
    .union([z.literal(0), z.literal(1)])
    .optional()
    .catch(undefined),
});
