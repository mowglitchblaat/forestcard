// The history's tab and selected combat live in the address (`#/historique?combat=123`).

import { z } from 'zod';

export const HistorySearch = z.object({
  tab: z.enum(['boosters', 'stats']).optional().catch(undefined),
  combat: z.number().optional().catch(undefined),
});
export type HistorySearch = z.infer<typeof HistorySearch>;
