// A player's public profile, through the database function the legacy page calls
// (profil_public(p_joueur)). Its SQL is not in the repository (05-profil.sql and
// 06-profils-publics.sql are missing upstream): the shape below is the one the legacy page reads.
// A missing stat reads as none, as there.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const Stat = z.number().nullish();

// The card a record is about: its image, its rarity colour, and the count (combats, victories).
const CardRecord = z
  .object({
    nom: z.string(),
    image_path: z.string().nullish(),
    couleur: z.string().nullish(),
    valeur: z.number(),
  })
  .nullish();

export const Profile = z.object({
  pseudo: z.string(),
  stats: z
    .object({
      victoires: Stat,
      defaites: Stat,
      nuls: Stat,
      meilleure_serie: Stat,
      serie_actuelle: Stat,
      plus_gros_coup: Stat,
      victoire_rapide_tours: Stat,
      combat_long_tours: Stat,
      degats_totaux: Stat,
      boosters_ouverts: Stat,
    })
    .nullish(),
  plus_jouee: CardRecord,
  plus_gagnante: CardRecord,
});
export type Profile = z.infer<typeof Profile>;
export type CardRecord = z.infer<typeof CardRecord>;

// null: no such player.
export async function fetchProfile(playerId: string): Promise<Profile | null> {
  const { data, error } = await supabase.rpc('profil_public', { p_joueur: playerId });
  if (error) throw new Error(`profil_public: ${error.message}`);
  return data ? Profile.parse(data) : null;
}

export const profileKeys = { of: (playerId: string) => ['profile', playerId] as const };

// The combat numbers the page shows: a missing stat is 0; the win rate, none without a combat.
export function combatSummary(stats: Profile['stats']) {
  const n = (v: number | null | undefined) => v ?? 0;
  const wins = n(stats?.victoires);
  const losses = n(stats?.defaites);
  const draws = n(stats?.nuls);
  const total = wins + losses + draws;
  return {
    wins,
    losses,
    draws,
    total,
    winRate: total ? Math.round((100 * wins) / total) : null,
  };
}
