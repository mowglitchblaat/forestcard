// The daily games' state for the player, through the database functions the legacy page calls
// (champignons_etat, duel_atq_etat, plusmoins_etat, ticket_etat; db/migrations/24-jeux-du-jour.sql).
// The day ends at midnight in Paris: the database dates a game with (now() at time zone
// 'Europe/Paris')::date.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

// A card drawn by a game: its image (storage path), its rarity colour, and the value played.
const GameCard = z.object({
  id: z.number().optional(),
  nom: z.string(),
  image: z.string().nullish(),
  couleur: z.string().nullish(),
  atq: z.union([z.number(), z.string()]).nullish(),
  pv: z.union([z.number(), z.string()]).nullish(),
});
export type GameCard = z.infer<typeof GameCard>;

const WonBooster = z.object({ nom: z.string().nullish() }).nullish();

// Mushrooms: one picked out of three; then, optionally, double or nothing.
const Mushrooms = z.object({
  joue: z.boolean(),
  choix: z.number().optional(),
  gain: z.number().optional(),
  autres: z.array(z.number()).optional(),
  double_fait: z.boolean().optional(),
  double_gagne: z.boolean().nullish(),
});

// ATQ duel: best of three rounds against the bot (a draw is replayed); the winner gets a booster.
const Round = z.object({ moi: GameCard, bot: GameCard, gagnant: z.enum(['moi', 'bot', 'egal']) });
const Duel = z.object({
  joue: z.boolean(),
  manches: z.array(Round).optional(),
  gagne: z.boolean().optional(),
  booster: WonBooster,
});

// Higher or lower: the next card has more or less HP; a streak of 5 at most, cashed in at will.
const Move = z.object({ avant: GameCard, apres: GameCard, choix: z.string(), ok: z.boolean() });
const HigherLower = z.object({
  joue: z.boolean(),
  carte: GameCard.optional(),
  serie: z.number().optional(),
  fini: z.boolean().optional(),
  gain: z.number().optional(),
  coups: z.array(Move).optional(),
  gain_actuel: z.number().optional(),
  gain_suivant: z.number().optional(),
});

// Scratch ticket (bonus): 6 cells, three of a rarity win its gold, three boosters win a booster.
const Ticket = z.object({
  joue: z.boolean(),
  grille: z.array(z.string()).optional(),
  gagnant: z.string().nullish(),
  gain: z.number().optional(),
  encaisse: z.boolean().optional(),
  booster: WonBooster,
});

export type DailyGames = {
  champignons: z.infer<typeof Mushrooms>;
  duel: z.infer<typeof Duel>;
  plusmoins: z.infer<typeof HigherLower>;
  ticket: z.infer<typeof Ticket>;
};

async function state<T>(fn: string, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await supabase.rpc(fn);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return schema.parse(data);
}

export async function fetchDailyGames(): Promise<DailyGames> {
  const [champignons, duel, plusmoins, ticket] = await Promise.all([
    state('champignons_etat', Mushrooms),
    state('duel_atq_etat', Duel),
    state('plusmoins_etat', HigherLower),
    state('ticket_etat', Ticket),
  ]);
  return { champignons, duel, plusmoins, ticket };
}

// A game's move. The database refuses with a code (raise exception 'DEJA_JOUE'): the error carries
// it, the page words it (gameError). What the move changed is read back from the state.
async function play(fn: string, args?: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
}

export async function pickMushroom(choice: number): Promise<void> {
  await play('champignons_jouer', { p_choix: choice });
}
export async function doubleMushroom(): Promise<void> {
  await play('champignons_doubler');
}
export async function playDuel(): Promise<void> {
  await play('duel_atq_jouer');
}
export async function startHigherLower(): Promise<void> {
  await play('plusmoins_commencer');
}
export async function guessHigherLower(choice: 'plus' | 'moins'): Promise<void> {
  await play('plusmoins_jouer', { p_choix: choice });
}
export async function cashHigherLower(): Promise<void> {
  await play('plusmoins_encaisser');
}
export async function takeTicket(): Promise<void> {
  await play('ticket_prendre');
}
export async function cashTicket(): Promise<void> {
  await play('ticket_encaisser');
}

// The refusals' wording, as the legacy page gives it; another error shows as is.
const REFUSALS: Record<string, string> = {
  DEJA_JOUE: "Tu as déjà joué à ce jeu aujourd'hui, reviens demain !",
  DEJA_DOUBLE: "Tu as déjà tenté ta chance aujourd'hui.",
  MONNAIE_INSUFFISANTE: 'Tu as déjà dépensé ce gain : plus de quitte ou double possible.',
  PARTIE_FINIE: 'Cette partie est terminée.',
  PAS_ENCORE_JOUE: "Tu n'as pas encore commencé ce jeu.",
  RIEN_A_ENCAISSER: 'Rien à encaisser pour le moment.',
  AUCUNE_CARTE: 'Aucune carte disponible pour ce jeu.',
  NON_CONNECTE: 'Connecte-toi pour jouer.',
};
export const gameError = (e: unknown): string => {
  const message = e instanceof Error ? e.message : String(e);
  const code = Object.keys(REFUSALS).find((k) => message.includes(k));
  return code ? (REFUSALS[code] as string) : message;
};

// Higher or lower: the chance each choice wins, as the database draws the next card (plusmoins_jouer):
// uniformly among the active fighters with HP not yet seen in this game (the first card, then every
// card drawn), all of them again when none is left; a tie wins both ways. `fighters` holds the HP of
// every active fighter by card id.
export function higherLowerOdds(
  fighters: Map<number, number>,
  g: DailyGames['plusmoins'],
): { plus: number; moins: number } | null {
  const current = Number(g.carte?.pv);
  if (!g.carte || Number.isNaN(current) || !fighters.size) return null;
  const seen = new Set(
    [g.coups?.[0]?.avant.id ?? g.carte.id, ...(g.coups ?? []).map((m) => m.apres.id)].filter(
      (id): id is number => id !== undefined,
    ),
  );
  let left = [...fighters].filter(([id]) => !seen.has(id)).map(([, pv]) => pv);
  if (!left.length) left = [...fighters.values()];
  return {
    plus: left.filter((pv) => pv >= current).length / left.length,
    moins: left.filter((pv) => pv <= current).length / left.length,
  };
}

// Over for the day: nothing left to do in it.
//   - mushrooms: picked (the double or nothing after it is optional, and declining it leaves no
//     trace: waiting for it would never end the game);
//   - ATQ duel: played (one go);
//   - higher or lower: the run ended (a mistake, or cashed in);
//   - scratch ticket: fully scratched, its gain cashed.
export const gamesLeft = (g: DailyGames): number =>
  [g.champignons.joue, g.duel.joue, !!g.plusmoins.fini, !!g.ticket.encaisse].filter((over) => !over)
    .length;
export const gamesOver = (g: DailyGames): boolean => gamesLeft(g) === 0;

// The streak's gains, step by step (plusmoins_gain).
export const STREAK_GAINS = [10, 25, 50, 100, 200];

// What the ticket's cells hold: label, colour, gold for three of them (a booster for three
// boosters).
export const TICKET_CELLS: Record<string, { label: string; colour: string; gold: number }> = {
  commun: { label: 'Commun', colour: '#9ca3af', gold: 15 },
  rare: { label: 'Rare', colour: '#3b82f6', gold: 30 },
  epique: { label: 'Épique', colour: '#a855f7', gold: 60 },
  legendaire: { label: 'Légendaire', colour: '#f59e0b', gold: 120 },
  ggez: { label: 'GGEZ', colour: '#ff3fb4', gold: 300 },
  booster: { label: 'Booster', colour: '#22d3ee', gold: 0 },
};

const PARIS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
});

// Minutes until midnight in Paris (rounded, as the legacy page's chMinuit). A day of a clock
// change counts 24 hours, as there.
export function minutesToMidnight(now: Date): number {
  const part = (type: string) =>
    Number(PARIS.formatToParts(now).find((p) => p.type === type)?.value ?? 0);
  const elapsed = part('hour') * 3600 + part('minute') * 60 + part('second');
  return Math.max(0, Math.round((86400 - elapsed) / 60));
}

// "3 h 07", as the legacy page writes it.
export const countdown = (minutes: number): string =>
  `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;

export const dailyGamesKeys = { state: ['dailyGames'] as const };
