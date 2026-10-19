// Cards as the site reads them: the player's collection, and the active cards (for the progress).
// Validated on arrival. Numbers that the database sometimes stores as text (atq, pv) are accepted as
// is, as the engine and the descriptions accept them. Effects are not validated here: the shared
// descriptions (packages/describe) read any shape, as the legacy page did.

import type { DescribedCard } from '@forestcard/describe';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const NumLike = z.union([z.number(), z.string()]).nullable();

export const Rarity = z.object({
  nom: z.string(),
  couleur: z.string().nullable(),
  poids: z.number().nullable(),
});
export type Rarity = z.infer<typeof Rarity>;

export const CARD_TYPES = ['combattant', 'magie', 'piege'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const Card = z.object({
  id: z.number(),
  nom: z.string(),
  type: z.enum(CARD_TYPES),
  atq: NumLike,
  pv: NumLike,
  description: z.string().nullable(),
  passif: z.custom<DescribedCard['passif']>(),
  ultime: z.custom<DescribedCard['ultime']>(),
  effet: z.custom<DescribedCard['effet']>(),
  collections: z.object({ nom: z.string() }).nullable(),
  raretes: Rarity,
});
export type Card = z.infer<typeof Card>;

export const Variant = z.object({
  id: z.number(),
  nom: z.string().nullable(),
  image_path: z.string().nullable(),
  // A card the player can no longer see (deactivated, deleted) comes back empty.
  cartes: Card.nullable(),
});

const CollectionRow = z.object({
  quantite: z.number(),
  variantes_carte: Variant.nullable(),
});

export type CollectionEntry = {
  quantite: number;
  variant: { id: number; nom: string | null; image_path: string | null };
  card: Card;
};

const COLLECTION_SELECT =
  'quantite,variantes_carte(id,nom,image_path,cartes(id,nom,type,atq,pv,description,passif,ultime,effet,collections(nom),raretes(nom,couleur,poids)))';

export async function fetchCollection(userId: string): Promise<CollectionEntry[]> {
  const { data, error } = await supabase
    .from('collection_joueur')
    .select(COLLECTION_SELECT)
    .eq('joueur_id', userId);
  if (error) throw new Error(`collection_joueur: ${error.message}`);
  return toEntries(z.array(CollectionRow).parse(data));
}

// Rows whose card is no longer visible are skipped, as the legacy page does, instead of blocking
// the whole collection.
export function toEntries(rows: z.infer<typeof CollectionRow>[]): CollectionEntry[] {
  const entries: CollectionEntry[] = [];
  for (const { quantite, variantes_carte: v } of rows) {
    if (!v?.cartes) continue;
    entries.push({
      quantite,
      variant: { id: v.id, nom: v.nom, image_path: v.image_path },
      card: v.cartes,
    });
  }
  return entries;
}

// Active cards of the game, for the progress (how many the player owns of each).
const GameCard = z.object({
  id: z.number(),
  collections: z.object({ nom: z.string() }).nullable(),
  raretes: Rarity.nullable(),
});
export type GameCard = z.infer<typeof GameCard>;

export async function fetchGameCards(): Promise<GameCard[]> {
  const { data, error } = await supabase
    .from('cartes')
    .select('id,collections(nom),raretes(nom,couleur,poids)')
    .eq('actif', true);
  if (error) throw new Error(`cartes: ${error.message}`);
  return z.array(GameCard).parse(data);
}

// Every active card of the game, with its effects and its variants: the encyclopedia's catalogue,
// and for each effect or rarity the card that shows it.
const GameCardFull = Card.extend({
  variantes_carte: z.array(
    z.object({ id: z.number(), nom: z.string().nullable(), image_path: z.string().nullable() }),
  ),
});
export type GameCardFull = z.infer<typeof GameCardFull>;

export async function fetchGameCardsFull(): Promise<GameCardFull[]> {
  const { data, error } = await supabase
    .from('cartes')
    .select(
      'id,nom,type,atq,pv,description,passif,ultime,effet,collections(nom),raretes(nom,couleur,poids),variantes_carte(id,nom,image_path)',
    )
    .eq('actif', true);
  if (error) throw new Error(`cartes: ${error.message}`);
  return z.array(GameCardFull).parse(data);
}

export const cardKeys = {
  collection: (userId: string) => ['collection', userId] as const,
  gameCards: ['gameCards'] as const,
  gameCardsFull: ['gameCardsFull'] as const,
};
