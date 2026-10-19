// Decks: the player's named decks (mes_decks, sauver_deck, supprimer_deck; their SQL is missing
// upstream, 09-decks-multiples.sql: the shapes and error codes below are the ones the legacy page
// reads) and the combat deck, the cards their combats use (table `deck`, written by
// enregistrer_deck, db/migrations/22-deck-10-cartes.sql).
//
// sauver_deck saves under a name: the legacy page saves an existing deck by calling it again with
// the same name, and renames by saving under the new name then deleting the old deck. A name is
// therefore a deck's identity on the server: saving under the name of another deck overwrites it.
// The site never does (names are checked unique before saving).

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

export const SavedDeck = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  nom: z.string(),
  cartes: z
    .array(z.number())
    .nullish()
    .transform((c) => c ?? []),
});
export type SavedDeck = z.infer<typeof SavedDeck>;

export const MAX_DECKS = 10;
export const NAME_MAX = 30;

const MESSAGES: Record<string, string> = {
  TROP_DE_DECKS: `Tu as déjà ${MAX_DECKS} decks : supprime-en un d'abord.`,
  NOM_INVALIDE: `Le nom doit faire entre 1 et ${NAME_MAX} caractères.`,
  DECK_TROP_GRAND: 'Un deck contient 10 cartes au maximum.',
  DECK_TAILLE_INVALIDE: 'Un deck de combat contient exactement 10 cartes.',
  DECK_COMPOSITION_INVALIDE: 'Un deck de combat contient au moins 3 cartes de chaque type.',
};
const fail = (fn: string, message: string): never => {
  throw new Error(MESSAGES[message] ?? `${fn}: ${message}`);
};

export async function fetchDecks(): Promise<SavedDeck[]> {
  const { data, error } = await supabase.rpc('mes_decks');
  if (error) fail('mes_decks', error.message);
  return z.array(SavedDeck).parse(data ?? []);
}

export async function fetchCombatDeck(userId: string): Promise<number[]> {
  const { data, error } = await supabase.from('deck').select('carte_id').eq('joueur_id', userId);
  if (error) fail('deck', error.message);
  return z
    .array(z.object({ carte_id: z.number() }))
    .parse(data)
    .map((r) => r.carte_id);
}

// The saved deck's id.
export async function saveDeck(name: string, cards: number[]): Promise<string> {
  const { data, error } = await supabase.rpc('sauver_deck', { p_nom: name, p_cartes: cards });
  if (error) fail('sauver_deck', error.message);
  return String(z.union([z.number(), z.string()]).parse(data));
}

export async function deleteDeck(id: string): Promise<void> {
  const { error } = await supabase.rpc('supprimer_deck', { p_id: Number(id) });
  if (error) fail('supprimer_deck', error.message);
}

// The cards the player's combats use from now on.
export async function setCombatDeck(cards: number[]): Promise<void> {
  const { error } = await supabase.rpc('enregistrer_deck', { p_cartes: cards });
  if (error) fail('enregistrer_deck', error.message);
}

export const deckKeys = {
  saved: ['decks'] as const,
  combat: (userId: string) => ['combatDeck', userId] as const,
};
