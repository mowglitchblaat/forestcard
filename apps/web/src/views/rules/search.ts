// The section being pointed at lives in the address (`#/regles?section=deck`).

import { z } from 'zod';

export const RulesSearch = z.object({ section: z.string().optional().catch(undefined) });
