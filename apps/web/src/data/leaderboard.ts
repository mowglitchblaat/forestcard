// The leaderboard's rows: every player's totals since the start (liste_profils; its SQL is missing
// upstream, the shape is the one the legacy page reads), or since the start of the month or the
// week in Paris (classement_periode, db/migrations/26-classement-periodes.sql). Counts come as
// numbers or, for the SQL bigint, possibly as text: both are read as numbers.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const Count = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => Number(v) || 0);
const OptionalCount = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v === null || v === undefined ? null : Number(v) || 0));

export const LeaderboardRow = z.object({
  joueur_id: z.string(),
  pseudo: z.string(),
  victoires: Count,
  defaites: Count,
  nuls: Count,
  // Only in the global leaderboard, and only if the server gives them.
  meilleure_serie: OptionalCount,
  plus_gros_coup: OptionalCount,
  // Periods: when the period started.
  debut: z.string().nullish(),
});
export type LeaderboardRow = z.infer<typeof LeaderboardRow>;

export const PERIODS = { global: 'Global', mois: 'Mensuel', semaine: 'Hebdo' } as const;
export type Period = keyof typeof PERIODS;

export async function fetchLeaderboard(period: Period): Promise<LeaderboardRow[]> {
  const { data, error } =
    period === 'global'
      ? await supabase.rpc('liste_profils')
      : await supabase.rpc('classement_periode', { p_periode: period });
  if (error) throw new Error(`classement (${period}): ${error.message}`);
  return z.array(LeaderboardRow).parse(data ?? []);
}

export const leaderboardKeys = { of: (period: Period) => ['leaderboard', period] as const };
