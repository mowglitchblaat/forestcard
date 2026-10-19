// Card backs: the ones the player may use (the base backs, open to everyone, and those the streamer
// gave them) and the one in use, through the database functions the legacy page calls (mes_dos,
// choisir_dos). Their SQL is not in the repository (07-dos-et-reglages.sql is missing upstream):
// the shape below is the one the legacy page reads.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

export const CardBack = z.object({
  // Passed back as is to choisir_dos.
  id: z.union([z.number(), z.string()]),
  nom: z.string(),
  image: z.string().nullable(),
  actif: z.boolean(),
  par_defaut: z.boolean(),
});
export type CardBack = z.infer<typeof CardBack>;

export async function fetchBacks(): Promise<CardBack[]> {
  const { data, error } = await supabase.rpc('mes_dos');
  if (error) throw new Error(`mes_dos: ${error.message}`);
  return z.array(CardBack).parse(data ?? []);
}

// id: null for the game's own back.
export async function chooseBack(id: CardBack['id'] | null): Promise<void> {
  const { error } = await supabase.rpc('choisir_dos', { p_dos: id });
  if (error) throw new Error(`choisir_dos: ${error.message}`);
}

export const backKeys = { mine: ['cardBacks'] as const };
// A new back is rare (the streamer gives one now and then): the sidebar checks hourly.
export const BACKS_REFRESH = 60 * 60 * 1000;
export const backIds = (list: CardBack[]): string[] => list.map((b) => String(b.id));
