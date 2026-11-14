// L'atelier, part 1: TAC-001 turns the fragments of recycling into rarity fragments (Épique,
// Légendaire, GGEZ), through its wheel (atelier_etat, atelier_tac; db/migrations/90-atelier-tac.sql).
// The stake, the base gain and the wheel's cases are settings (reglages_jeu, atelier_*): the page
// draws what the database sends.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const Tier = z.object({
  cle: z.enum(['epique', 'legendaire', 'ggez']),
  nom: z.string(),
  mise: z.number(),
  solde: z.number(),
  couleur: z.string().nullish(),
});
export type Tier = z.infer<typeof Tier>;

const Case = z.object({ mult: z.number(), poids: z.number() });
export type WheelCase = z.infer<typeof Case>;

const Workshop = z.object({
  fragments: z.number(),
  gain_base: z.number(),
  roue: z.array(Case),
  paliers: z.array(Tier),
  tac: z.object({ nom: z.string(), image: z.string().nullish() }).nullish(),
  derniers: z.array(
    z.object({ palier: z.string(), mult: z.number(), gain: z.number(), le: z.string() }),
  ),
});
export type Workshop = z.infer<typeof Workshop>;

const Spin = z.object({ case: z.number(), mult: z.number(), gain: z.number(), palier: z.string() });
export type Spin = z.infer<typeof Spin>;

export async function fetchWorkshop(): Promise<Workshop> {
  const { data, error } = await supabase.rpc('atelier_etat');
  if (error) throw new Error(`atelier_etat: ${error.message}`);
  return Workshop.parse(data);
}

export async function spinTac(tier: Tier['cle']): Promise<Spin> {
  const { data, error } = await supabase.rpc('atelier_tac', { p_palier: tier });
  if (error) throw new Error(error.message);
  return Spin.parse(data);
}

const REFUSALS: Record<string, string> = {
  FRAGMENTS_INSUFFISANTS:
    'Pas assez de fragments pour ce palier : recycle des cartes pour en gagner.',
  PALIER_INCONNU: 'Ce palier n’existe pas.',
  ROUE_VIDE: 'La roue de TAC-001 est en panne pour le moment.',
  NON_CONNECTE: 'Connecte-toi pour utiliser l’atelier.',
};
export const workshopError = (e: unknown): string => {
  const message = e instanceof Error ? e.message : String(e);
  const code = Object.keys(REFUSALS).find((k) => message.includes(k));
  return code ? (REFUSALS[code] as string) : message;
};

// "×1,2": a case of the wheel, as the page writes it.
export const multLabel = (mult: number) => `×${String(mult).replace('.', ',')}`;

// The wheel's cases as arcs, clockwise from the top, each as wide as its chance: start and end in
// degrees. A case with no weight takes no room.
export function wheelArcs(cases: WheelCase[]): { start: number; end: number }[] {
  const total = cases.reduce((sum, c) => sum + Math.max(0, c.poids), 0) || 1;
  let at = 0;
  return cases.map((c) => {
    const start = at;
    at += (Math.max(0, c.poids) / total) * 360;
    return { start, end: at };
  });
}

// The wheel's next rotation, to stop on case `index` under the pointer (at the top): at least
// `turns` whole turns more than `from`, landing at `share` (0 to 1) of the case's width, away from
// its edges.
export function landingRotation(
  arcs: { start: number; end: number }[],
  index: number,
  from: number,
  share: number,
  turns = 6,
): number {
  const arc = arcs[index] ?? { start: 0, end: 0 };
  const width = arc.end - arc.start;
  const target = arc.start + width * (0.15 + 0.7 * share);
  // The wheel turned by r shows at the top the angle (360 - r) mod 360.
  const wanted = (((360 - target) % 360) + 360) % 360;
  const now = ((from % 360) + 360) % 360;
  return from + turns * 360 + ((wanted - now + 360) % 360);
}

export const workshopKeys = { state: ['workshop'] as const };
