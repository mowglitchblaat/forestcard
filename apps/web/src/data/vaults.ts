// The vaults (db/migrations/97-coffres-forts.sql): three vaults shared by the whole community (blue,
// violet, legendary), drilled with drills bought in gold. Each drill placed makes a lasting hole in
// the door, at a place the database draws. The drills a vault needs stay secret. At its last drill a
// vault opens and announces its treasure: new cards of its rarity, which the admin creates afterwards.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const Num = z.union([z.number(), z.string()]).transform(Number);

// poids: how many drills the hole counts for (1, or the Perce-Abîme's power).
const Hole = z.object({
  id: Num,
  x: Num,
  y: Num,
  angle: Num,
  moi: z.boolean().nullable(),
  poids: Num.nullish(),
});
export type Hole = z.infer<typeof Hole>;

const Tint = z.enum(['bleu', 'violet', 'or']);
export type Tint = z.infer<typeof Tint>;

const LootCard = z.object({
  id: Num,
  nom: z.string(),
  type: z.string().nullish(),
  rarete: z.string().nullish(),
  couleur: z.string().nullish(),
  image: z.string().nullish(),
});
export type LootCard = z.infer<typeof LootCard>;

// The drills a vault needs stay secret: players only see the holes.
const Vault = z.object({
  id: Num,
  rang: Num,
  nom: z.string(),
  teinte: Tint,
  ouvert_le: z.string().nullable(),
  trous: z.array(Hole),
  cartes: z.array(LootCard),
  // once open: the new cards it announces (the admin creates them afterwards)
  tresor: z.object({ nb: Num, rarete: z.string() }).nullish(),
});
export type Vault = z.infer<typeof Vault>;

const Heist = z.object({
  id: Num,
  titre: z.string(),
  debut: z.string(),
  fin: z.string(),
  prix: Num,
  prix_giga: Num.nullish(),
  puissance_giga: Num.nullish(),
  termine: z.boolean(),
  monnaie: Num.nullable(),
  stock: Num,
  stock_giga: Num.nullish(),
  coffres: z.array(Vault),
  perceurs: z.array(z.object({ pseudo: z.string(), foreuses: Num })),
  mes_foreuses: Num.nullable(),
});
export type Heist = z.infer<typeof Heist>;

export const vaultKeys = { state: ['vaults'] as const, admin: ['vaults', 'admin'] as const };
export const VAULTS_REFRESH = 20 * 1000;

const REFUSALS: Record<string, string> = {
  NON_CONNECTE: 'Connecte-toi pour percer les coffres.',
  AUCUN_EVENEMENT: 'Aucun coffre à percer pour le moment.',
  EVENEMENT_TERMINE: 'Les coffres sont refermés : l’événement est terminé.',
  QUANTITE: 'Entre 1 et 100 foreuses à la fois.',
  GOLD_INSUFFISANT: 'Pas assez de gold pour ces foreuses.',
  COFFRE_OUVERT: 'Ce coffre est déjà ouvert !',
  PAS_DE_FOREUSE: 'Achète d’abord une foreuse à la boutique.',
  PAS_DE_GIGA: 'Achète d’abord une Perce-Abîme à la boutique.',
  COFFRE_INCONNU: 'Coffre introuvable.',
};
const refusal = (message: string): Error => {
  const code = Object.keys(REFUSALS).find((k) => message.includes(k));
  return new Error(code ? (REFUSALS[code] as string) : message);
};

async function rpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw refusal(error.message);
  return data;
}

export async function fetchHeist(): Promise<Heist | null> {
  return Heist.nullable().parse(await rpc('coffres_etat'));
}

// giga: the Perce-Abîme, the legendary drill.
export async function buyDrills(n: number, giga = false): Promise<void> {
  await rpc('coffres_acheter', { p_n: n, p_giga: giga });
}

export async function drill(
  vault: number,
  n: number,
  giga = false,
): Promise<{ trous: Hole[]; ouvert: boolean }> {
  return z
    .object({ trous: z.array(Hole), ouvert: z.boolean() })
    .parse(await rpc('coffres_percer', { p_coffre: vault, p_n: n, p_giga: giga }));
}

// The vaults whose opening this browser has already played (the reveal plays once).
const SEEN = 'forestcard:coffres-vus';
export function openingSeen(id: number): boolean {
  try {
    return (JSON.parse(localStorage.getItem(SEEN) ?? '[]') as number[]).includes(id);
  } catch {
    return false;
  }
}
export function markOpeningSeen(id: number): void {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN) ?? '[]') as number[];
    if (!list.includes(id)) localStorage.setItem(SEEN, JSON.stringify([...list, id]));
  } catch {
    // no storage: the reveal plays again next time
  }
}

// ── Admin ──

const AdminVault = z.object({
  id: Num,
  nom: z.string(),
  teinte: Tint,
  requis: Num,
  ouvert_le: z.string().nullable(),
  poses: Num,
  nb_cartes: Num.nullish(),
  rarete: z.string().nullish(),
});
const AdminHeist = z.object({
  id: Num,
  titre: z.string(),
  debut: z.string(),
  fin: z.string(),
  prix: Num,
  coffres: z.array(AdminVault).nullable(),
});
export type AdminHeist = z.infer<typeof AdminHeist>;

export async function fetchAdminHeists(): Promise<AdminHeist[]> {
  return z.array(AdminHeist).parse(await rpc('admin_coffres_liste'));
}

export async function createHeist(d: {
  titre: string;
  fin: string;
  prix: number;
  bleu: number;
  violet: number;
  or: number;
}): Promise<void> {
  const end = new Date(d.fin);
  if (Number.isNaN(end.getTime())) throw new Error('Date de fin invalide.');
  await rpc('admin_coffres_creer', {
    p_titre: d.titre,
    p_fin: end.toISOString(),
    p_prix: d.prix,
    p_bleu: d.bleu,
    p_violet: d.violet,
    p_or: d.or,
  });
}

export async function setHeistEnd(id: number, end: string): Promise<void> {
  const date = new Date(end);
  if (Number.isNaN(date.getTime())) throw new Error('Date de fin invalide.');
  await rpc('admin_coffres_fin', { p_id: id, p_fin: date.toISOString() });
}

export async function deleteHeist(id: number): Promise<void> {
  await rpc('admin_coffres_supprimer', { p_id: id });
}
