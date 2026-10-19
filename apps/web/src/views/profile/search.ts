// The player whose profile is shown lives in the address (`#/profil?joueur=<id>`); none means the
// player signed in. The leaderboard links here.

import { z } from 'zod';

export const ProfileSearch = z.object({ joueur: z.string().optional().catch(undefined) });
