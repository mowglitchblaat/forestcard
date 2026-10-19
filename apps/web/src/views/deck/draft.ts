// A deck's changes not saved yet, kept in localStorage so a reload or a closed tab loses nothing.
// One draft per deck (a new deck: per name). A draft records the saved cards it started from: if
// the deck was saved since (another tab, another device), the draft is set aside rather than
// applied to a version it never saw.

import { sameCards } from './model';

type Draft = { base: number[]; cards: number[] };

const key = (deck: string): string => `forestcard-deck-brouillon:${deck}`;
export const draftKey = (deckKey: string, name?: string): string =>
  name ? `${deckKey}:${name}` : deckKey;

// The draft's cards if it started from the deck as saved now; 'stale' if it started from another
// version (it is then removed); null if there is none.
export function loadDraft(deck: string, base: number[]): number[] | 'stale' | null {
  const raw = localStorage.getItem(key(deck));
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as Draft;
    if (Array.isArray(draft.cards) && Array.isArray(draft.base) && sameCards(draft.base, base))
      return draft.cards;
  } catch {
    // Unreadable: treated as stale.
  }
  localStorage.removeItem(key(deck));
  return 'stale';
}

export const hasDraft = (deck: string): boolean => localStorage.getItem(key(deck)) !== null;

export function saveDraft(deck: string, base: number[], cards: number[]): void {
  localStorage.setItem(key(deck), JSON.stringify({ base, cards } satisfies Draft));
}

export const clearDraft = (deck: string): void => localStorage.removeItem(key(deck));
