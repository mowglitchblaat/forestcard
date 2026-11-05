// The lore's tab lives in the address (`#/lore?onglet=carte`).

import { z } from 'zod';

export const LORE_TABS = {
  evenements: 'Événements',
  carte: 'Carte',
  histoire: 'Histoire',
} as const;
export type LoreTab = keyof typeof LORE_TABS;

export const LoreSearch = z.object({
  onglet: z
    .enum(Object.keys(LORE_TABS) as [LoreTab, ...LoreTab[]])
    .optional()
    .catch(undefined),
});
