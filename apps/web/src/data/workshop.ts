// L'atelier, part 1: TAC-002 turns the fragments of recycling into rarity fragments (Épique,
// Légendaire, GGEZ), through the three reels on its belly (atelier_etat, atelier_tac;
// db/migrations/90-atelier-tac.sql, 92-atelier-mise-libre.sql, 93-atelier-trois-rouleaux.sql). The
// player stakes what they want (at least `mise_min`); each reel draws a case of the wheel, and the
// pull's multiplier is their product (×0,5 × ×0,5 × ×1,2 = ×0,3); a tier's rate says how many
// fragments make one of its own (Épique 1, Légendaire 3, GGEZ 10); the gain is the stake times the
// multiplier, divided by the rate, rounded down. All of
// it is settings (reglages_jeu, atelier_*): the page shows what the database sends.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const Tier = z.object({
  cle: z.enum(['epique', 'legendaire', 'ggez']),
  nom: z.string(),
  taux: z.number(),
  solde: z.number(),
  couleur: z.string().nullish(),
});
export type Tier = z.infer<typeof Tier>;

const Case = z.object({ mult: z.number(), poids: z.number() });
export type WheelCase = z.infer<typeof Case>;

const Workshop = z.object({
  fragments: z.number(),
  mise_min: z.number(),
  roue: z.array(Case),
  paliers: z.array(Tier),
  tac: z.object({ nom: z.string(), image: z.string().nullish() }).nullish(),
  derniers: z.array(
    z.object({
      palier: z.string(),
      mise: z.number(),
      mult: z.number(),
      gain: z.number(),
      le: z.string(),
    }),
  ),
});
export type Workshop = z.infer<typeof Workshop>;

const Spin = z.object({
  cases: z.array(z.number()),
  mult: z.number(),
  gain: z.number(),
  palier: z.string(),
  mise: z.number(),
});
export type Spin = z.infer<typeof Spin>;

export async function fetchWorkshop(): Promise<Workshop> {
  const { data, error } = await supabase.rpc('atelier_etat');
  if (error) throw new Error(`atelier_etat: ${error.message}`);
  return Workshop.parse(data);
}

export async function spinTac({
  tier,
  stake,
}: {
  tier: Tier['cle'];
  stake: number;
}): Promise<Spin> {
  const { data, error } = await supabase.rpc('atelier_tac', { p_palier: tier, p_mise: stake });
  if (error) throw new Error(error.message);
  return Spin.parse(data);
}

const REFUSALS: Record<string, string> = {
  FRAGMENTS_INSUFFISANTS:
    'Pas assez de fragments pour cette mise : recycle des cartes pour en gagner.',
  MISE_TROP_PETITE: 'Mise trop petite pour TAC-002.',
  PALIER_INCONNU: 'Ce palier n’existe pas.',
  ROUE_VIDE: 'La roue de TAC-002 est en panne pour le moment.',
  NON_CONNECTE: 'Connecte-toi pour utiliser l’atelier.',
};
export const workshopError = (e: unknown): string => {
  const message = e instanceof Error ? e.message : String(e);
  const code = Object.keys(REFUSALS).find((k) => message.includes(k));
  return code ? (REFUSALS[code] as string) : message;
};

// "×1,2": a case of the wheel or a pull's multiplier, as the page writes it (at most 3 decimals).
export const multLabel = (mult: number) =>
  `×${String(Math.round(mult * 1000) / 1000).replace('.', ',')}`;

// A pull's multiplier: the product of its reels' cases.
export const pullMultiplier = (mults: number[]) => mults.reduce((p, m) => p * m, 1);

// What a stake brings back at a multiplier: the stake times it, in the tier's fragments (`rate`
// fragments make one), rounded down, as atelier_tac counts it.
export const conversion = (stake: number, mult: number, rate: number) =>
  Math.floor((stake * mult) / Math.max(1, rate) + 1e-9);

// A reel of TAC-002's belly: a strip of the wheel's cases, `cases` long, repeated. The reel stands on
// cell `from`; to stop on case `index` after at least `turns` full rounds of the strip's cases, it
// goes to the next cell showing that case past them.
export function reelTarget(from: number, index: number, cases: number, turns: number): number {
  const base = from + turns * cases;
  return base + ((index - (base % cases) + cases) % cases);
}

export const workshopKeys = { state: ['workshop'] as const };
