// The game paused for the streamer's let's play (32-mode-site.sql): the players open their boosters,
// take their daily booster and play their combats on the site, with the stream's animations
// (overlay.html?site and combat.html?site). As the legacy page's vJouer.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { callGame } from './game';

const Num = z.union([z.number(), z.string()]).transform(Number);

const Stock = z.object({
  quantite: Num,
  types_boosters: z.object({ nom: z.string() }).nullable(),
});
export type Stock = z.infer<typeof Stock>;

export async function fetchStock(player: string): Promise<Stock[]> {
  const { data, error } = await supabase
    .from('stock_boosters')
    .select('quantite,types_boosters(nom)')
    .eq('joueur_id', player)
    .gt('quantite', 0);
  if (error) throw new Error(error.message);
  return z.array(Stock).parse(data ?? []);
}

// The opening, as !booster does it: its result goes to the boosters' overlay.
export async function openBooster(): Promise<unknown> {
  const { data, error } = await supabase.rpc('ouvrir_booster_site');
  if (error)
    throw new Error(
      /ouvrir_booster_site/.test(error.message)
        ? "Ouverture indisponible : l'admin doit lancer 32-mode-site.sql dans Supabase."
        : error.message,
    );
  return data;
}

export async function dailyBooster(): Promise<string> {
  const answer = await callGame({ mode: 'booster_quotidien' });
  return answer.text.replace(
    / Ouvre-les avec !booster/,
    ' Ouvre-les ici avec « Ouvrir un booster ».',
  );
}

const CombatAnswer = z.looseObject({
  journal: z.array(z.unknown()),
  annonce: z.string().nullable().optional(),
});
export type CombatResult = { replay: unknown; announce: string | null } | { message: string };

// opponent: null for the daily combat, a nickname for a duel paid in gold.
export async function fight(opponent: string | null): Promise<CombatResult> {
  const answer = await callGame(
    opponent === null ? { mode: 'quotidien' } : { mode: 'payant', adversaire: opponent },
  );
  const parsed = CombatAnswer.safeParse(answer.json);
  if (answer.ok && parsed.success)
    return { replay: answer.json, announce: parsed.data.annonce ?? null };
  return { message: answer.text || "Le combat n'a pas pu être lancé." };
}

export const playKeys = { stock: (player: string) => ['play', 'stock', player] as const };
