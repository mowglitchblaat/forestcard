// The period and the sort live in the address (`#/classement?periode=mois&tri=pct`); none means
// global, by victories. (The legacy page kept them in localStorage.)

import { z } from 'zod';
import { PERIODS, type Period } from '@/data/leaderboard';

export const SORTS = {
  victoires: 'Victoires',
  pct: '% de victoires',
  combats: 'Combats',
  defaites: 'Défaites',
  nuls: 'Nuls',
  meilleure_serie: 'Meilleure série',
  plus_gros_coup: 'Plus gros coup',
} as const;
export type Sort = keyof typeof SORTS;

export const LeaderboardSearch = z.object({
  periode: z
    .enum(Object.keys(PERIODS) as [Period, ...Period[]])
    .optional()
    .catch(undefined),
  tri: z
    .enum(Object.keys(SORTS) as [Sort, ...Sort[]])
    .optional()
    .catch(undefined),
});
