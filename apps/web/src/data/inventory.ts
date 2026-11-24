// The player's inventory (db/migrations/100-inventaire.sql): the boosters they keep, their gold and
// fragments, their objects (drills, Perce-Abîme) and their mini-vaults. A mini-vault is drilled like
// the vaults of the event (data/vaults.ts); its defense (the drills it needs) stays secret. At its last
// drill it opens and gives its loot, drawn by the database by its colour.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const Num = z.union([z.number(), z.string()]).transform(Number);

const Tint = z.enum(['bleu', 'violet', 'or']);
export type Tint = z.infer<typeof Tint>;

const Hole = z.object({
  id: Num,
  x: Num,
  y: Num,
  angle: Num,
  moi: z.boolean().nullable(),
  poids: Num.nullish(),
});

// What a vault gave: an amount of one thing, or a card.
const Loot = z.object({
  objet: z.enum([
    'gold',
    'fragments',
    'fragments_epique',
    'fragments_legendaire',
    'fragments_ggez',
    'booster',
    'foreuse',
    'perce_abime',
    'carte',
  ]),
  n: Num,
  nom: z.string().nullish(),
  version: z.string().nullish(),
  image: z.string().nullish(),
  rarete: z.string().nullish(),
  couleur: z.string().nullish(),
});
export type Loot = z.infer<typeof Loot>;

const MiniVault = z.object({
  id: Num,
  teinte: Tint,
  origine: z.string().nullable(),
  cree_le: z.string(),
  ouvert_le: z.string().nullable(),
  butin: z.array(Loot).nullable(),
  trous: z.array(Hole),
});
export type MiniVault = z.infer<typeof MiniVault>;

const Inventory = z.object({
  monnaie: Num,
  fragments: Num,
  fragments_epique: Num,
  fragments_legendaire: Num,
  fragments_ggez: Num,
  puissance_giga: Num,
  boosters: z.array(
    z.object({
      type_id: Num,
      nom: z.string(),
      image: z.string().nullable(),
      nb_cartes: Num.nullable(),
      quantite: Num,
    }),
  ),
  objets: z.object({ foreuse: Num, perce_abime: Num }),
  coffres: z.array(MiniVault),
});
export type Inventory = z.infer<typeof Inventory>;

export const inventoryKeys = { state: ['inventory'] as const, admin: ['inventory', 'admin'] as const };

// The names of the colours, as the player reads them.
export const TINT_NAMES: Record<Tint, string> = {
  bleu: 'Mini-coffre bleu',
  violet: 'Mini-coffre violet',
  or: 'Mini-coffre légendaire',
};

const REFUSALS: Record<string, string> = {
  NON_CONNECTE: 'Connecte-toi pour ouvrir ton inventaire.',
  COFFRE_INCONNU: 'Coffre introuvable.',
  COFFRE_OUVERT: 'Ce coffre est déjà ouvert !',
  PAS_DE_FOREUSE: 'Plus de foreuse : elles s’achètent pendant les événements des coffres-forts.',
  PAS_DE_GIGA: 'Plus de Perce-Abîme : elles s’achètent pendant les événements des coffres-forts.',
  QUANTITE: 'Quantité invalide.',
  COULEUR: 'Couleur de coffre inconnue.',
  OBJET: 'Objet inconnu.',
};
const refusal = (message: string): Error => {
  if (/inventaire_etat|inventaire_percer|admin_inventaire|admin_coffres_butin/.test(message))
    return new Error("L'inventaire n'est pas encore prêt : l'admin doit lancer 100-inventaire.sql.");
  const code = Object.keys(REFUSALS).find((k) => message.includes(k));
  return new Error(code ? (REFUSALS[code] as string) : message);
};

async function rpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw refusal(error.message);
  return data;
}

export async function fetchInventory(): Promise<Inventory | null> {
  return Inventory.nullable().parse(await rpc('inventaire_etat'));
}

export async function drillMiniVault(
  vault: number,
  n: number,
  giga = false,
): Promise<{ trous: z.infer<typeof Hole>[]; ouvert: boolean; butin: Loot[] | null }> {
  return z
    .object({ trous: z.array(Hole), ouvert: z.boolean(), butin: z.array(Loot).nullable() })
    .parse(await rpc('inventaire_percer', { p_coffre: vault, p_n: n, p_giga: giga }));
}

// ── Admin ──

const Settings = z.object({
  teinte: Tint,
  defense_min: Num,
  defense_max: Num,
  tirages: Num,
  chance_carte: Num,
  chance_ggez: Num,
});
export type LootSettings = z.infer<typeof Settings>;

export const LOOT_OBJECTS = [
  'gold',
  'fragments',
  'fragments_epique',
  'fragments_legendaire',
  'fragments_ggez',
  'booster',
  'foreuse',
  'perce_abime',
] as const;
export type LootObject = (typeof LOOT_OBJECTS)[number];

const Lot = z.object({
  teinte: Tint,
  objet: z.enum(LOOT_OBJECTS),
  poids: Num,
  min: Num,
  max: Num,
});
export type LootLot = z.infer<typeof Lot>;

const AdminLoot = z.object({
  reglages: z.array(Settings),
  lots: z.array(Lot),
  fermes: Num,
  ouverts: Num,
});
export type AdminLoot = z.infer<typeof AdminLoot>;

export async function fetchAdminLoot(): Promise<AdminLoot> {
  return AdminLoot.parse(await rpc('admin_coffres_butin'));
}

export async function saveAdminLoot(settings: LootSettings[], lots: LootLot[]): Promise<void> {
  await rpc('admin_coffres_butin_regler', { p_reglages: settings, p_lots: lots });
}

// player: null for every player. Returns the number of vaults given.
export async function giveMiniVaults(
  player: string | null,
  tint: Tint,
  n: number,
  note: string,
): Promise<number> {
  return Num.parse(
    await rpc('admin_inventaire_coffres_donner', {
      p_joueur: player,
      p_teinte: tint,
      p_n: n,
      p_origine: note || null,
    }),
  );
}

// player: null for every player. Returns the number of players served.
export async function giveDrills(
  player: string | null,
  object: 'foreuse' | 'perce_abime',
  n: number,
): Promise<number> {
  return Num.parse(
    await rpc('admin_inventaire_objets_donner', { p_joueur: player, p_objet: object, p_n: n }),
  );
}
