// L'atelier, part 2: the forge of the first Forgeronne (forge_catalogue, forge_forger;
// db/migrations/94-forge.sql). A card is forged with the rarity fragments of its tier (TAC-001's):
// Épique 600, Légendaire 1 200, GGEZ 1 600, twice that for a rare alternative version (FULLEP,
// FULLEG); all settings (reglages_jeu, forge_*). Forgeable: the active cards of an active collection,
// not the Fondateurs, Épique and up, in their standard or rare alternative version.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const TierKey = z.enum(['epique', 'legendaire', 'ggez']);
export type TierKey = z.infer<typeof TierKey>;

const ForgeCard = z.object({
  variante_id: z.number(),
  carte_id: z.number(),
  nom: z.string(),
  variante: z.string(),
  image: z.string().nullish(),
  type: z.string(),
  palier: TierKey,
  couleur: z.string().nullish(),
  alternative: z.boolean(),
  prix: z.number(),
  possede: z.number(),
});
export type ForgeCard = z.infer<typeof ForgeCard>;

const Forge = z.object({
  soldes: z.object({ epique: z.number(), legendaire: z.number(), ggez: z.number() }),
  forgeronne: z.string().nullish(),
  cartes: z.array(ForgeCard),
});
export type Forge = z.infer<typeof Forge>;

const Forged = z.object({
  variante_id: z.number(),
  nom: z.string(),
  variante: z.string(),
  image: z.string().nullish(),
  couleur: z.string().nullish(),
  palier: TierKey,
  prix: z.number(),
});
export type Forged = z.infer<typeof Forged>;

export async function fetchForge(): Promise<Forge> {
  const { data, error } = await supabase.rpc('forge_catalogue');
  if (error) throw new Error(`forge_catalogue: ${error.message}`);
  return Forge.parse(data);
}

export async function forgeCard(variant: number): Promise<Forged> {
  const { data, error } = await supabase.rpc('forge_forger', { p_variante: variant });
  if (error) throw new Error(error.message);
  return Forged.parse(data);
}

const REFUSALS: Record<string, string> = {
  FRAGMENTS_INSUFFISANTS: 'Pas assez de fragments de cette rareté : passe voir TAC-001.',
  NON_FORGEABLE: 'Cette carte ne peut pas être forgée.',
  NON_CONNECTE: 'Connecte-toi pour utiliser la forge.',
};
export const forgeError = (e: unknown): string => {
  const message = e instanceof Error ? e.message : String(e);
  const code = Object.keys(REFUSALS).find((k) => message.includes(k));
  return code ? (REFUSALS[code] as string) : message;
};

export const TIER_NAMES: Record<TierKey, string> = {
  epique: 'Épique',
  legendaire: 'Légendaire',
  ggez: 'GGEZ',
};

// The cards shown: of a tier (all of them without one), whose name holds the search (accents and
// case aside).
const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
export function forgeFilter(cards: ForgeCard[], tier: TierKey | null, search: string): ForgeCard[] {
  const q = plain(search.trim());
  return cards.filter((c) => (!tier || c.palier === tier) && (!q || plain(c.nom).includes(q)));
}

export const forgeKeys = { state: ['forge'] as const };
