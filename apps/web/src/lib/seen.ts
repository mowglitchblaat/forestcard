// "Seen" marks kept in localStorage (like the theme): what the player has already looked at, so the
// sidebar can flag what is new. A mark is a stored string: '1' for "Comment jouer", the fingerprint
// of the patch notes for "Patch notes", and the newest patch notes day seen (the page marks the
// days after it "Nouveau"), the card backs seen (their ids), the shop's offers seen (id and
// price), '1' once the daily games' rules were read (they open by themselves until then). Other
// open tabs follow through the `storage` event.

import { useSyncExternalStore } from 'react';

export const SEEN_KEYS = {
  rules: 'forestcard-regles-vues',
  patchNotes: 'forestcard-patchnotes-vues',
  patchNotesUpTo: 'forestcard-patchnotes-jusqua',
  backs: 'forestcard-dos-vus',
  gamesRules: 'forestcard-jeux-regles-vues',
  shop: 'forestcard-boutique-vue',
} as const;
type SeenKey = (typeof SEEN_KEYS)[keyof typeof SEEN_KEYS];

// Components of this tab reading a mark (the `storage` event only reaches the other tabs).
const listeners = new Set<() => void>();

export function markSeen(key: SeenKey, value: string): void {
  if (localStorage.getItem(key) === value) return;
  localStorage.setItem(key, value);
  listeners.forEach((notify) => notify());
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || Object.values(SEEN_KEYS).includes(e.key as SeenKey)) notify();
  };
  addEventListener('storage', onStorage);
  return () => {
    listeners.delete(notify);
    removeEventListener('storage', onStorage);
  };
};

export const useSeen = (key: SeenKey): string | null =>
  useSyncExternalStore(subscribe, () => localStorage.getItem(key));

// "Comment jouer" is new until opened once.
export const rulesSeen = (stored: string | null): boolean => stored === '1';
// The patch notes are new when their fingerprint differs from the one seen (or none was seen).
// Unknown fingerprint (file not loaded): nothing to flag.
export const patchNotesNew = (stored: string | null, current: string | undefined): boolean =>
  current !== undefined && stored !== current;

// A list seen (card backs by id, shop offers by id and price), as a mark: its items, sorted.
export const listMark = (items: string[]): string => [...items].sort().join(',');
// The items not seen yet (all of them if the page was never opened). Unknown list (not loaded):
// none.
export function unseen(stored: string | null, ids: string[] | undefined): string[] {
  const seen = new Set(stored ? stored.split(',') : []);
  return (ids ?? []).filter((id) => !seen.has(id));
}
