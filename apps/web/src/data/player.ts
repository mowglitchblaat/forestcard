// The signed-in player: their row of `joueurs` and whether they are an admin. Validated on arrival:
// a field that does not have the expected shape raises an error naming it.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

// Only the fields the site reads. Unknown fields are dropped.
export const Player = z.object({
  id: z.string(),
  pseudo: z.string(),
  monnaie: z.number(),
  fragments: z.number().nullable(),
});
export type Player = z.infer<typeof Player>;

export async function fetchPlayer(userId: string): Promise<Player> {
  const { data, error } = await supabase.from('joueurs').select('*').eq('id', userId).single();
  if (error) throw new Error(`joueurs: ${error.message}`);
  return Player.parse(data);
}

export async function fetchIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) throw new Error(`is_admin: ${error.message}`);
  return z.boolean().parse(data);
}

// The Twitch profile, from the sign-in metadata Supabase keeps on the user: the picture (`picture`,
// or `avatar_url` depending on the provider version) and the display name (`nickname`, with its
// capitals). Absent or malformed: no picture (initials instead), the pseudo of `joueurs`.
const TwitchMetadata = z.object({
  picture: z.url().optional().catch(undefined),
  avatar_url: z.url().optional().catch(undefined),
  nickname: z.string().min(1).optional().catch(undefined),
});

export function twitchNickname(userMetadata: unknown): string | null {
  const parsed = TwitchMetadata.safeParse(userMetadata);
  return parsed.success ? (parsed.data.nickname ?? null) : null;
}

export function twitchAvatar(userMetadata: unknown): string | null {
  const parsed = TwitchMetadata.safeParse(userMetadata);
  if (!parsed.success) return null;
  return parsed.data.picture ?? parsed.data.avatar_url ?? null;
}

export const playerKeys = {
  player: (userId: string) => ['player', userId] as const,
  isAdmin: (userId: string) => ['isAdmin', userId] as const,
};
