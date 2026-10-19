// Patch notes: one feed by day from both sources, what is new since the last visit, how a changed
// field reads; the real notes file is accepted.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { type BalanceRow, PatchNote } from '../src/data/patchnotes.ts';
import {
  cardsTouched,
  changeView,
  dayLabel,
  feed,
  isNew,
  latestDay,
  localDay,
} from '../src/views/patch/model.ts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const NOTES = JSON.parse(
  readFileSync(join(ROOT, 'apps', 'site', 'public', 'patchnotes.json'), 'utf8'),
) as unknown[];

const note = (date: string): PatchNote => ({ date, groupes: [] });
// Noon local time: the same local day in any time zone the tests run in.
const row = (id: number, day: string, carte_id: number | null = id): BalanceRow => ({
  id,
  carte_id,
  carte_nom: `Carte ${carte_id ?? id}`,
  carte_type: 'combattant',
  changements: [],
  cree_le: new Date(`${day}T12:00:00`).toISOString(),
});

test('the real notes file is accepted', () => {
  expect(NOTES.map((n) => PatchNote.parse(n)).length).toBe(NOTES.length);
});

test('one feed by day, newest first, both sources mixed; a filter keeps one', () => {
  const notes = [note('2026-10-15'), note('2026-10-17')];
  const balance = [row(2, '2026-10-17'), row(1, '2026-10-16')];
  const days = feed(notes, balance);
  expect(days.map((d) => [d.date, d.notes.length, d.balance.length])).toEqual([
    ['2026-10-17', 1, 1],
    ['2026-10-16', 0, 1],
    ['2026-10-15', 1, 0],
  ]);
  expect(feed(notes, balance, 'notes').map((d) => d.date)).toEqual(['2026-10-17', '2026-10-15']);
  expect(feed(notes, balance, 'equilibrage').map((d) => d.date)).toEqual([
    '2026-10-17',
    '2026-10-16',
  ]);
  expect(latestDay(notes, balance)).toBe('2026-10-17');
  expect(latestDay([], [])).toBeNull();
});

test('a balance row belongs to its local day', () => {
  expect(localDay(new Date('2026-10-17T23:30:00').toISOString())).toBe('2026-10-17');
});

test('new: after the day seen; a first visit flags nothing', () => {
  expect(isNew('2026-10-17', '2026-10-16')).toBe(true);
  expect(isNew('2026-10-16', '2026-10-16')).toBe(false);
  expect(isNew('2026-10-17', null)).toBe(false);
});

test('a card edited twice in a day counts once', () => {
  expect(
    cardsTouched([row(1, '2026-10-17', 7), row(2, '2026-10-17', 7), row(3, '2026-10-17')]),
  ).toBe(2);
});

test('a changed field: added, from a value to another, up or down, none', () => {
  expect(
    changeView({ champ: 'Nouvelle carte', avant: null, apres: 'Rare · ATQ 10 · PV 80' }),
  ).toEqual({ kind: 'added', field: 'Nouvelle carte', value: 'Rare · ATQ 10 · PV 80' });
  expect(changeView({ champ: 'ATQ', avant: '14', apres: '12', sens: -1 })).toMatchObject({
    before: '14',
    after: '12',
    trend: 'down',
  });
  expect(changeView({ champ: 'PV', avant: '60', apres: '65', sens: 1 })).toMatchObject({
    trend: 'up',
  });
  expect(changeView({ champ: 'Passif', avant: '', apres: 'Esquive 20 %', sens: 0 })).toMatchObject({
    before: null,
    after: 'Esquive 20 %',
    trend: null,
  });
});

test('day label as the legacy page writes it', () => {
  expect(dayLabel('2026-10-17')).toBe('Samedi 17 octobre 2026');
});
