// The deck's rules and what the deck page computes. Pure functions, tested without React.
//
// A deck: 10 different cards, at least 3 fighters, 3 magics and 3 traps; the tenth is free (any
// type). The combat deck must follow the rule; a saved deck may be incomplete (the server only
// refuses more than 10 cards).

import { CARD_TYPES, type CardType, type CollectionEntry } from '@/data/cards';
import type { SavedDeck } from '@/data/decks';
import { compareEntries } from '@/lib/rarity';
import { TYPE_LABELS } from '@/views/collection/model';

export const DECK_SIZE = 10;
export const PER_TYPE = 3;

export type Composition = {
  size: number;
  byType: Record<CardType, number>;
  // Cards beyond 3 of their type: the free slot holds one.
  free: number;
  complete: boolean;
};

export function compose(ids: number[], typeOf: (id: number) => CardType | undefined): Composition {
  const byType: Record<CardType, number> = { combattant: 0, magie: 0, piege: 0 };
  for (const id of ids) {
    const t = typeOf(id);
    if (t) byType[t]++;
  }
  const free = CARD_TYPES.reduce((n, t) => n + Math.max(0, byType[t] - PER_TYPE), 0);
  return {
    size: ids.length,
    byType,
    free,
    complete: ids.length === DECK_SIZE && CARD_TYPES.every((t) => byType[t] >= PER_TYPE),
  };
}

const ONE: Record<CardType, string> = {
  combattant: 'un combattant',
  magie: 'une magie',
  piege: 'un piège',
};

// Why a card cannot join the deck, or null if it can (a card already in it can always leave).
export function refusal(
  ids: number[],
  id: number,
  typeOf: (id: number) => CardType | undefined,
): string | null {
  if (ids.includes(id)) return null;
  if (ids.length >= DECK_SIZE) return 'Deck complet : 10 cartes. Retire une carte d’abord.';
  const type = typeOf(id);
  if (!type) return null;
  const c = compose(ids, typeOf);
  if (c.byType[type] < PER_TYPE || c.free < 1) return null;
  return `Plus de place pour ${ONE[type]} : 3 ${TYPE_LABELS[type].many.toLowerCase()} et la carte libre sont déjà pris.`;
}

// The slots as the deck panel draws them: 3 per type, then the free slot; any card beyond (an old
// deck from before the rule) is listed apart, to be removed.
export function layout(entries: CollectionEntry[]) {
  const byType: Record<CardType, CollectionEntry[]> = { combattant: [], magie: [], piege: [] };
  const extra: CollectionEntry[] = [];
  for (const e of [...entries].sort(compareEntries)) {
    if (byType[e.card.type].length < PER_TYPE) byType[e.card.type].push(e);
    else extra.push(e);
  }
  return { byType, free: extra[0] ?? null, beyond: extra.slice(1) };
}

// One entry per card, whatever its variants: the copies added up, the first variant shown.
export function byCard(entries: CollectionEntry[]): CollectionEntry[] {
  const cards = new Map<number, CollectionEntry>();
  for (const e of [...entries].sort(compareEntries)) {
    const found = cards.get(e.card.id);
    if (found) found.quantite += e.quantite;
    else cards.set(e.card.id, { ...e });
  }
  return [...cards.values()];
}

export const sameCards = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

// The saved deck that carries the "Deck de combat" mark: the one whose cards are the combat deck's (by
// name if several are). None: the combat deck is saved under no name.
export function combatDeckId(decks: SavedDeck[], combat: number[]): string | null {
  if (!combat.length) return null;
  return (
    [...decks]
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
      .find((d) => sameCards(d.cartes, combat))?.id ?? null
  );
}

// A name for a new or renamed deck: trimmed, 1 to 30 characters, not another deck's (saving under
// another deck's name would overwrite it).
export function nameProblem(name: string, decks: SavedDeck[], self?: string): string | null {
  const n = name.trim();
  if (!n) return 'Donne-lui un nom.';
  if (n.length > 30) return '30 caractères au maximum.';
  if (decks.some((d) => d.id !== self && d.nom.trim().toLowerCase() === n.toLowerCase()))
    return 'Un autre deck porte déjà ce nom.';
  return null;
}
