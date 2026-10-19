// The back being tried lives in the address (`#/dos?dos=3`); none means the one in use.

import { z } from 'zod';

// The game's own back, which has no id in the database.
export const STANDARD = 'standard';

export const BacksSearch = z.object({ dos: z.string().optional().catch(undefined) });
