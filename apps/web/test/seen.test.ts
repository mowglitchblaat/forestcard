// The "seen" marks: what makes a sidebar entry new.

import { expect, test } from 'vite-plus/test';
import { listMark, patchNotesNew, rulesSeen, unseen } from '../src/lib/seen.ts';

test('"Comment jouer": seen only with the value 1', () => {
  expect(rulesSeen(null)).toBe(false);
  expect(rulesSeen('1')).toBe(true);
  expect(rulesSeen('0')).toBe(false);
});

test('patch notes: new when the fingerprint differs from the one seen, nothing if unknown', () => {
  expect(patchNotesNew(null, 'abc')).toBe(true);
  expect(patchNotesNew('abc', 'abc')).toBe(false);
  expect(patchNotesNew('abc', 'def')).toBe(true);
  expect(patchNotesNew(null, undefined)).toBe(false);
});

test('card backs: the ids not seen yet; all of them before a first visit; none if not loaded', () => {
  expect(unseen(null, ['1', '2'])).toEqual(['1', '2']);
  expect(unseen(listMark(['2', '1']), ['1', '2'])).toEqual([]);
  expect(unseen(listMark(['1']), ['1', '3'])).toEqual(['3']);
  expect(unseen('1', undefined)).toEqual([]);
});
