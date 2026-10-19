// What the history computes from the data. From the combat summaries: the form (last results and
// current streak), results by card played and by opponent. From a combat's journal: what its story
// highlights. Pure functions, tested without React.
//
// Journal fields read when present (packages/journal writes them): `n` an amount, `pv` / `max` the
// HP of both sides after the line, `gagnant` the winning side on the end line. Turns are counted as
// the `tour` lines seen so far (the server's count, the "Tour N" of the story), never from the lines'
// `tour` field, which is the round (docs/glossaire.md).

import type { CombatSummary, ReplayLine, Result } from '@/data/history';

// ── From the summaries ──

export type Record3 = { victoire: number; defaite: number; nul: number; total: number };
const empty = (): Record3 => ({ victoire: 0, defaite: 0, nul: 0, total: 0 });

// Most recent first, as the server sends them.
export function form(combats: CombatSummary[]): {
  results: Result[];
  streak: { result: Result; length: number } | null;
} {
  const results = combats.map((c) => c.resultat);
  const first = results[0];
  if (!first) return { results, streak: null };
  let length = 0;
  while (results[length] === first) length++;
  return { results, streak: { result: first, length } };
}

export const winRate = (r: Record3): number =>
  r.total ? Math.round((100 * r.victoire) / r.total) : 0;

// Results grouped by a key (a card played, an opponent), most played first.
export function recordsBy(
  combats: CombatSummary[],
  key: (c: CombatSummary) => string | null,
): { name: string; record: Record3 }[] {
  const groups = new Map<string, Record3>();
  for (const c of combats) {
    const name = key(c);
    if (!name || name.startsWith('Aucun')) continue;
    const r = groups.get(name) ?? empty();
    groups.set(name, r);
    r[c.resultat]++;
    r.total++;
  }
  return [...groups.entries()]
    .map(([name, record]) => ({ name, record }))
    .sort(
      (a, b) =>
        b.record.total - a.record.total ||
        winRate(b.record) - winRate(a.record) ||
        a.name.localeCompare(b.name, 'fr'),
    );
}

// ── From a journal ──

// What the story highlights: the biggest hit (its line index), and the turn where the winner took
// the HP lead for good, when the lead changed sides before.
export function highlights(lines: ReplayLine[]): {
  biggestHit: number | null;
  comebackTurn: number | null;
} {
  let biggestHit: number | null = null;
  let best = 0;
  let lead: 0 | 1 | null = null;
  let comeback: { by: 0 | 1; turn: number } | null = null;
  let turn = 0;
  lines.forEach((line, i) => {
    if (line.t === 'tour') turn++;
    const n = line['n'];
    if (line.t === 'degats' && typeof n === 'number' && n > best) {
      best = n;
      biggestHit = i;
    }
    if (line.pv && line.max && line.pv.length > 1 && line.max.length > 1) {
      const share = (k: 0 | 1) => (line.pv?.[k] ?? 0) / (line.max?.[k] || 1);
      const ahead = share(0) > share(1) ? 0 : share(1) > share(0) ? 1 : null;
      if (ahead !== null) {
        if (lead !== null && ahead !== lead) comeback = { by: ahead, turn };
        lead = ahead;
      }
    }
  });
  const end = lines.findLast((l) => l.t === 'fin');
  const winner = end?.['gagnant'];
  const kept = comeback as { by: 0 | 1; turn: number } | null;
  return { biggestHit, comebackTurn: kept && kept.by === winner ? kept.turn : null };
}
