// What the patch notes page computes: one feed by day mixing the technical notes and the balance
// log, what is new since the last visit, how a changed field reads. Pure functions, tested without
// React.

import type { BalanceRow, Change, PatchNote } from '@/data/patchnotes';
import type { PatchFilter } from './search';

export type FeedDay = { date: string; notes: PatchNote[]; balance: BalanceRow[] };

const pad = (n: number) => String(n).padStart(2, '0');
// The day of a balance row in the reader's time zone (YYYY-MM-DD, like the notes' dates).
export const localDay = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// The days, newest first; each with its notes and its balance rows (in the log's order, newest
// first). A filter keeps one source only.
export function feed(notes: PatchNote[], balance: BalanceRow[], filter?: PatchFilter): FeedDay[] {
  const days = new Map<string, FeedDay>();
  const day = (date: string): FeedDay => {
    const found = days.get(date);
    if (found) return found;
    const created: FeedDay = { date, notes: [], balance: [] };
    days.set(date, created);
    return created;
  };
  if (filter !== 'equilibrage') for (const n of notes) day(n.date).notes.push(n);
  if (filter !== 'notes') for (const b of balance) day(localDay(b.cree_le)).balance.push(b);
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

// The newest day of both sources: what a visit has seen up to.
export const latestDay = (notes: PatchNote[], balance: BalanceRow[]): string | null =>
  feed(notes, balance)[0]?.date ?? null;

// New: after the day seen at the previous visit. A first visit (nothing seen) flags nothing:
// everything would be new.
export const isNew = (date: string, seenUpTo: string | null): boolean =>
  seenUpTo !== null && date > seenUpTo;

// The cards a day's balance touches (a card edited twice counts once).
export const cardsTouched = (rows: BalanceRow[]): number =>
  new Set(rows.map((r) => r.carte_id ?? r.carte_nom)).size;

// How a changed field reads: added (a field of a new card), or from a value to another; a number
// going up or down.
export type ChangeView =
  | { kind: 'added'; field: string; value: string }
  | {
      kind: 'changed';
      field: string;
      before: string | null;
      after: string | null;
      trend: 'up' | 'down' | null;
    };

const orNone = (v: string | null): string | null => (v === null || v === '' ? null : v);

export function changeView(c: Change): ChangeView {
  if (c.avant === null) return { kind: 'added', field: c.champ, value: c.apres ?? '' };
  const sens = c.sens ?? 0;
  return {
    kind: 'changed',
    field: c.champ,
    before: orNone(c.avant),
    after: orNone(c.apres),
    trend: sens > 0 ? 'up' : sens < 0 ? 'down' : null,
  };
}

// "Vendredi 17 octobre 2026" (legacy jour()). Noon: the same day whatever the time zone.
export function dayLabel(date: string): string {
  const s = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
