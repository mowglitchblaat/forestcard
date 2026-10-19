// The player's history: their last combats (with the stored journal of each, to replay it) and their
// last opened boosters. Same database functions as the legacy page (vHistorique, hBoosters).

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

export const RESULTS = { victoire: 'Victoire', defaite: 'Défaite', nul: 'Match nul' } as const;
export type Result = keyof typeof RESULTS;

export const CombatSummary = z.object({
  id: z.number(),
  resultat: z.enum(Object.keys(RESULTS) as [Result, ...Result[]]),
  adversaire: z.string(),
  cree_le: z.string(),
  mode: z.string().nullable(),
  tours: z.number().nullable(),
  gain: z.number().nullable(),
  ma_carte: z.string().nullable(),
  ma_magie: z.string().nullable(),
  mon_piege: z.string().nullable(),
  sa_carte: z.string().nullable(),
  sa_magie: z.string().nullable(),
  son_piege: z.string().nullable(),
});
export type CombatSummary = z.infer<typeof CombatSummary>;

// The legacy page shows the last 10 combats.
export async function fetchHistory(limit = 10): Promise<CombatSummary[]> {
  const { data, error } = await supabase.rpc('mon_historique', { p_limite: limit });
  if (error) throw new Error(`mon_historique: ${error.message}`);
  const combats = z.array(CombatSummary).parse(data);
  // Combats still being animated on stream are hidden, so the history does not spoil them. If the
  // list cannot be read, nothing is hidden (as on the legacy page).
  const hidden = await supabase.rpc('combats_caches');
  if (hidden.error || !Array.isArray(hidden.data)) return combats;
  const ids = new Set(
    (hidden.data as unknown[]).map((x) =>
      String(x !== null && typeof x === 'object' ? Object.values(x)[0] : x),
    ),
  );
  return combats.filter((c) => !ids.has(String(c.id)));
}

// A journal line as stored. Observed in the database (2026-10-18, combat_deroule): only `c` (the side
// the line is about, absent on some lines), `t`, `txt` and `tour` (the round). The other fields the
// engine writes on every line (HP, ATQ, amounts, the players on the start line, the winner on the
// end line) are not kept by the server: they are optional here, and what needs them only shows when
// they are present.
export const ReplayLine = z.looseObject({
  t: z.string(),
  txt: z.string(),
  tour: z.number().optional(),
  pv: z.array(z.number()).optional(),
  max: z.array(z.number()).optional(),
  joueurs: z.array(z.looseObject({ pseudo: z.string() })).optional(),
});
export type ReplayLine = z.infer<typeof ReplayLine>;

export async function fetchReplay(id: number): Promise<ReplayLine[]> {
  const { data, error } = await supabase.rpc('combat_deroule', { p_id: id });
  if (error) throw new Error(`combat_deroule: ${error.message}`);
  return z.array(ReplayLine).parse(data);
}

export const OpenedBooster = z.object({
  booster: z.string().nullable(),
  cree_le: z.string(),
  cartes: z
    .array(
      z.looseObject({
        carte: z.string().nullish(),
        nom: z.string().nullish(),
        image: z.string().nullish(),
        couleur: z.string().nullish(),
      }),
    )
    .nullable()
    .catch(null),
});
export type OpenedBooster = z.infer<typeof OpenedBooster>;

export async function fetchOpenedBoosters(): Promise<OpenedBooster[]> {
  const { data, error } = await supabase.rpc('mes_boosters_ouverts');
  if (error) throw new Error(`mes_boosters_ouverts: ${error.message}`);
  return z.array(OpenedBooster).parse(data);
}

export const historyKeys = {
  combats: (limit = 10) => ['history', 'combats', limit] as const,
  replay: (id: number) => ['history', 'replay', id] as const,
  boosters: ['history', 'boosters'] as const,
};
