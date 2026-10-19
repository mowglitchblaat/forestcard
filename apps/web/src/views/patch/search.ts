// The source shown lives in the address (`#/patch?filtre=equilibrage`); none means both.

import { z } from 'zod';

export const PATCH_FILTERS = { notes: 'Notes', equilibrage: 'Équilibrage' } as const;
export type PatchFilter = keyof typeof PATCH_FILTERS;

export const PatchSearch = z.object({
  filtre: z.enum(['notes', 'equilibrage']).optional().catch(undefined),
});
