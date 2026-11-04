// The card being edited in Admin · Cartes lives in the address (`#/admin/cartes?carte=12`), so the
// votes and proposals can link to it.

import { z } from 'zod';

export const AdminSearch = z.object({
  carte: z.coerce.number().int().positive().optional().catch(undefined),
});
