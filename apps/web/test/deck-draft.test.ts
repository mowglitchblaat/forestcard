// Deck drafts: changes not saved survive a reload, and never apply to a version they did not see.

import { beforeEach, expect, test, vi } from 'vite-plus/test';
import { clearDraft, draftKey, hasDraft, loadDraft, saveDraft } from '../src/views/deck/draft.ts';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

test('a draft comes back on the deck as it was saved', () => {
  saveDraft('3', [1, 2], [1, 2, 5]);
  expect(hasDraft('3')).toBe(true);
  expect(loadDraft('3', [2, 1])).toEqual([1, 2, 5]);
});

test('a draft of another saved version is set aside, and removed', () => {
  saveDraft('3', [1, 2], [1, 2, 5]);
  expect(loadDraft('3', [1, 9])).toBe('stale');
  expect(hasDraft('3')).toBe(false);
});

test('no draft, or cleared: nothing', () => {
  expect(loadDraft('3', [])).toBeNull();
  saveDraft('3', [], [4]);
  clearDraft('3');
  expect(loadDraft('3', [])).toBeNull();
});

test('a new deck has its draft per name', () => {
  expect(draftKey('nouveau', 'Feu')).toBe('nouveau:Feu');
  expect(draftKey('3')).toBe('3');
});
