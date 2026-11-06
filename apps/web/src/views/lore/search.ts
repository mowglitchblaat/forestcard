// The lore's tab lives in the address (`#/lore?onglet=carte`), and the chapter to show (a place of
// the map links to its chapter: `#/lore?onglet=histoire&chapitre=2`).

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
  chapitre: z.number().optional().catch(undefined),
});
