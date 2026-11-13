// Sponsorship (84-parrainage.sql): a player's link is the site with ?parrain=<their nickname>. A
// newcomer who arrives by it is linked to that player at their first sign-in (parrainage_lier) and
// gets a welcome gold; the sponsor is paid once the newcomer has played a few combats.
//
// The sign-in goes through Twitch and comes back without the query string, so the sponsor read from
// the address is kept in the browser until the player is signed in.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const KEY = 'fc-parrain';

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function forget(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: nothing was kept.
  }
}

// At start: ?parrain=… in the address is kept, and taken out of the address.
export function captureReferral(): void {
  const url = new URL(location.href);
  const sponsor = url.searchParams.get('parrain')?.trim();
  if (!sponsor) return;
  try {
    localStorage.setItem(KEY, sponsor.slice(0, 64));
  } catch {
    return;
  }
  url.searchParams.delete('parrain');
  history.replaceState(null, '', url.toString());
}

// The sponsor kept from a link, if any.
export function pendingReferral(): string | null {
  return read();
}

export const Claim = z.union([
  z.object({ ok: z.literal(true), parrain: z.string(), gain: z.number() }),
  z.object({ ok: z.literal(false), raison: z.string() }),
]);
export type Claim = z.infer<typeof Claim>;

// Once signed in: links the player to the kept sponsor (only a brand-new account can be), then
// forgets it, whatever the answer.
export async function claimReferral(): Promise<Claim> {
  const sponsor = read();
  if (!sponsor) return { ok: false, raison: 'aucun' };
  const { data, error } = await supabase.rpc('parrainage_lier', { p_parrain: sponsor });
  if (error) throw new Error(`parrainage_lier: ${error.message}`);
  forget();
  return Claim.parse(data);
}

export const MyReferral = z.object({
  gain_parrain: z.number(),
  gain_filleul: z.number(),
  combats: z.number(),
  parrain: z.string().nullable(),
  filleuls: z.array(z.object({ pseudo: z.string(), combats: z.number(), paye: z.boolean() })),
});
export type MyReferral = z.infer<typeof MyReferral>;

export async function fetchMyReferral(): Promise<MyReferral> {
  const { data, error } = await supabase.rpc('parrainage_moi');
  if (error) throw new Error(`parrainage_moi: ${error.message}`);
  return MyReferral.parse(data);
}

export const referralKeys = {
  mine: (playerId: string) => ['referral', playerId] as const,
  claim: (playerId: string) => ['referral', 'claim', playerId] as const,
};

// A player's link: the site's address with their nickname.
export function referralLink(nickname: string): string {
  return `${location.origin}${location.pathname}?parrain=${encodeURIComponent(nickname)}`;
}
