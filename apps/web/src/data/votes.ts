// Balance votes (db/migrations/11-votes.sql): each week (from Monday, Paris time) a player picks
// up to 5 of their cards and, for each part of a card (ATQ, PV, each passive, the ultimate, or the
// effect of a magic or a trap), asks for a nerf, an up or a rework. The table is never read
// directly (who voted what stays hidden): voter_carte, mes_votes and resultats_votes (counts, no
// names).

import { type DescribedCard, fxCond, fxEffet, fxPassif, nz } from '@forestcard/describe';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

export const MAX_VOTED = 5;

export const DIRECTIONS = { nerf: 'Nerf', up: 'Up', rework: 'Rework' } as const;
export type Direction = keyof typeof DIRECTIONS;

// The choices for one card: aspect key ('atq', 'pv', 'passif:0', 'ultime', 'effet') → direction.
export type Ballot = Record<string, Direction>;

const Dir = z.enum(['nerf', 'up', 'rework']);
const Count = z.union([z.number(), z.string()]).transform(Number);

const MyVote = z.object({ carte_id: Count, aspect: z.string(), sens: Dir });

// This week's votes of the player, by card.
export async function fetchMyVotes(): Promise<Map<number, Ballot>> {
  const { data, error } = await supabase.rpc('mes_votes');
  if (error) throw new Error(`mes_votes: ${error.message}`);
  const mine = new Map<number, Ballot>();
  for (const v of z.array(MyVote).parse(data ?? [])) {
    mine.set(v.carte_id, { ...mine.get(v.carte_id), [v.aspect]: v.sens });
  }
  return mine;
}

const ResultRow = z.object({
  carte_id: Count,
  carte_nom: z.string(),
  aspect: z.string(),
  sens: Dir,
  nb: Count,
  votants: Count,
});
export type ResultRow = z.infer<typeof ResultRow>;

// weeksBack: 0 this week, 1 last week.
export async function fetchResults(weeksBack: number): Promise<ResultRow[]> {
  const { data, error } = await supabase.rpc('resultats_votes', { p_decalage: weeksBack });
  if (error) throw new Error(`resultats_votes: ${error.message}`);
  return z.array(ResultRow).parse(data ?? []);
}

// Records the player's ballot for a card, replacing the previous one; an empty ballot withdraws the
// vote. The database's refusals are worded for the player already ("Tu as déjà voté pour 5 cartes
// cette semaine").
export async function vote(cardId: number, ballot: Ballot): Promise<void> {
  const choices = Object.entries(ballot).map(([aspect, sens]) => ({ aspect, sens }));
  const { error } = await supabase.rpc('voter_carte', { p_carte: cardId, p_choix: choices });
  if (error) throw new Error(error.message);
}

export type CardResult = {
  id: number;
  name: string;
  voters: number;
  aspects: { aspect: string; counts: Record<Direction, number> }[];
};

// The results by card, the most voters first (then by name); in each card, the aspects in their
// order on the card.
export function aggregate(rows: ResultRow[]): CardResult[] {
  const byCard = new Map<number, CardResult>();
  for (const r of rows) {
    const card = byCard.get(r.carte_id) ?? {
      id: r.carte_id,
      name: r.carte_nom,
      voters: r.votants,
      aspects: [],
    };
    byCard.set(r.carte_id, card);
    let line = card.aspects.find((a) => a.aspect === r.aspect);
    if (!line) {
      line = { aspect: r.aspect, counts: { nerf: 0, up: 0, rework: 0 } };
      card.aspects.push(line);
    }
    line.counts[r.sens] += r.nb;
  }
  const rank = (aspect: string) => {
    const [kind, i] = aspect.split(':');
    return ['atq', 'pv', 'passif', 'ultime', 'effet'].indexOf(kind ?? '') * 100 + nz(i);
  };
  const list = [...byCard.values()];
  for (const c of list) c.aspects.sort((a, b) => rank(a.aspect) - rank(b.aspect));
  return list.sort((a, b) => b.voters - a.voters || a.name.localeCompare(b.name, 'fr'));
}

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

export const voteKeys = {
  mine: ['votes', 'mine'] as const,
  results: (weeksBack: number) => ['votes', 'results', weeksBack] as const,
};
