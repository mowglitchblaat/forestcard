// The player views' address (`#/boutique?booster=3`): the shop brings that booster into view (a
// place of the lore's map links to the boosters of its collection).

import { z } from 'zod';

export const ViewSearch = z.object({
  booster: z.number().optional().catch(undefined),
});
