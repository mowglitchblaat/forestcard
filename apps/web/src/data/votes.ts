// Balance votes, as proposals (db/migrations/39-votes-propositions.sql): a player proposes one of
// their cards, up to 5 a week (from Monday, Paris time), with a direction (nerf, up or rework), on
// the whole card or a part of it (ATQ, PV, a passive, the ultimate, the effect) and a short comment.
// Every player votes yes or no on the others' proposals; the author counts as yes. A card is
// proposed once a week: then it is locked until Monday. The tables are never read directly (who
// voted what stays hidden): propositions_vote, proposer_vote, voter_proposition, retirer_proposition.

import { type DescribedCard, fxCond, fxEffet, fxPassif, nz } from '@forestcard/describe';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

export const MAX_PROPOSED = 5;

export const DIRECTIONS = { nerf: 'Nerf', up: 'Up', rework: 'Rework' } as const;
export type Direction = keyof typeof DIRECTIONS;

const Dir = z.enum(['nerf', 'up', 'rework']);
const Count = z.union([z.number(), z.string()]).transform(Number);

const Proposal = z.object({
  id: Count,
  carte_id: Count,
  carte_nom: z.string(),
  sens: Dir,
  aspect: z.string().nullable(),
  commentaire: z.string().nullable(),
  oui: Count,
  non: Count,
  mon_avis: z.boolean().nullable(),
  a_moi: z
    .boolean()
    .nullable()
    .transform((v) => v === true),
  cree_le: z.string(),
});
export type Proposal = z.infer<typeof Proposal>;

// weeksBack: 0 this week, 1 last week…
export async function fetchProposals(weeksBack: number): Promise<Proposal[]> {
  const { data, error } = await supabase.rpc('propositions_vote', { p_decalage: weeksBack });
  if (error) throw new Error(error.message);
  return z.array(Proposal).parse(data ?? []);
}

// The database's refusals are worded for the player already (« Tu as déjà fait 5 propositions
// cette semaine », « Cette carte est déjà proposée cette semaine »).
export async function propose(
  cardId: number,
  direction: Direction,
  aspect: string | null,
  comment: string,
): Promise<void> {
  const { error } = await supabase.rpc('proposer_vote', {
    p_carte: cardId,
    p_sens: direction,
    p_aspect: aspect,
    p_commentaire: comment.trim() || null,
  });
  if (error) throw new Error(error.message);
}

// yes: true, no: false, null withdraws the vote.
export async function voteOn(proposal: number, yes: boolean | null): Promise<void> {
  const { error } = await supabase.rpc('voter_proposition', {
    p_proposition: proposal,
    p_oui: yes,
  });
  if (error) throw new Error(error.message);
}

// By its author while nobody else voted; by the admin, always. The card can be proposed again.
export async function withdraw(proposal: number): Promise<void> {
  const { error } = await supabase.rpc('retirer_proposition', { p_proposition: proposal });
  if (error) throw new Error(error.message);
}

export const votesOf = (p: Proposal): number => p.oui + p.non;
export const yesShare = (p: Proposal): number =>
  votesOf(p) ? Math.round((100 * p.oui) / votesOf(p)) : 0;

// The players' list: the most votes first, then the newest.
export const byVotes = (list: Proposal[]): Proposal[] =>
  [...list].sort((a, b) => votesOf(b) - votesOf(a) || b.cree_le.localeCompare(a.cree_le));

// The admin's ten most backed: the most yes, then the fewest no.
export const mostBacked = (list: Proposal[], n = 10): Proposal[] =>
  [...list].sort((a, b) => b.oui - a.oui || a.non - b.non).slice(0, n);

export type Aspect = { key: string; label: string };

type Effect = Parameters<typeof fxEffet>[0];
type Passive = Parameters<typeof fxPassif>[0];

// What can be voted on a card, worded as the legacy page (vAspects, txtEq): a fighter's ATQ, PV,
// each passive and its ultimate; a magic's or a trap's effect.
export function aspectsOf(
  c: DescribedCard & { atq?: number | string | null; pv?: number | string | null },
): Aspect[] {
  if (c.type !== 'combattant') {
    const e = c.effet;
    let text = '';
    if (e && c.type === 'magie') text = fxEffet(e).join(' · ');
    else if (e)
      text =
        `${fxCond(e.condition) || 'Piège caché'} : ${fxEffet(e.effet as Effect).join(' · ')}` +
        (nz(e.declenchements) > 1 ? ` (jusqu'à ${nz(e.declenchements)} fois)` : '');
    return [{ key: 'effet', label: `${c.type === 'piege' ? 'Piège' : 'Effet'} : ${text || '—'}` }];
  }
  const aspects: Aspect[] = [
    { key: 'atq', label: `ATQ (${c.atq ?? '?'})` },
    { key: 'pv', label: `PV / défense (${c.pv ?? '?'})` },
  ];
  const p = c.passif;
  const passives = (
    p ? (Array.isArray(p.briques) ? p.briques.filter((b) => b && b.type) : p.type ? [p] : []) : []
  ) as Passive[];
  passives.forEach((x, i) =>
    aspects.push({ key: `passif:${i}`, label: `Passif : ${fxPassif(x)}` }),
  );
  const u = c.ultime;
  if (u && (u.type || u.briques))
    aspects.push({ key: 'ultime', label: `Ultime : ${fxEffet(u).join(' · ')}` });
  return aspects;
}

// An aspect's name in the results when its card is not at hand (the legacy page's fallback).
export const aspectName = (key: string): string =>
  ({ atq: 'ATQ', pv: 'PV', ultime: 'Ultime', effet: 'Effet' })[key] ?? 'Passif';

// An aspect's words: the whole card when none, its label on the card, or its name when the card is
// not at hand.
export function aspectLabel(
  card: Parameters<typeof aspectsOf>[0] | undefined,
  key: string | null,
): string {
  if (!key) return 'Toute la carte';
  return (card && aspectsOf(card).find((a) => a.key === key)?.label) ?? aspectName(key);
}

export const voteKeys = {
  all: ['votes'] as const,
  proposals: (weeksBack: number) => ['votes', 'proposals', weeksBack] as const,
};
