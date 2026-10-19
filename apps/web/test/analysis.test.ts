// The history's analysis: form and records from the summaries, the story's highlights from a
// journal (hand-written, and one the engine really writes).

import { describe, expect, test } from 'vite-plus/test';
import { simuler } from '../../../packages/journal/src/index.ts';
import { type CombatSummary, ReplayLine, type Result } from '../src/data/history.ts';
import { form, highlights, recordsBy, winRate } from '../src/views/history/analysis.ts';

let id = 0;
const combat = (resultat: Result, adversaire: string, ma_carte: string): CombatSummary => ({
  id: ++id,
  resultat,
  adversaire,
  cree_le: '2026-10-18T10:00:00Z',
  mode: null,
  tours: 5,
  gain: 50,
  ma_carte,
  ma_magie: 'Aucune magie',
  mon_piege: 'Toile',
  sa_carte: 'X',
  sa_magie: null,
  son_piege: null,
});

describe('from the summaries', () => {
  // Most recent first, as the server sends them.
  const list = [
    combat('victoire', 'Bot', 'Ours'),
    combat('victoire', 'Bob', 'Ours'),
    combat('defaite', 'Bot', 'Cerf'),
    combat('nul', 'Bot', 'Ours'),
  ];

  test('form: the results and the current streak', () => {
    expect(form(list)).toEqual({
      results: ['victoire', 'victoire', 'defaite', 'nul'],
      streak: { result: 'victoire', length: 2 },
    });
    expect(form([]).streak).toBeNull();
  });

  test('records by card and by opponent, most played first, "Aucun…" placeholders ignored', () => {
    expect(recordsBy(list, (c) => c.ma_carte)).toEqual([
      { name: 'Ours', record: { victoire: 2, defaite: 0, nul: 1, total: 3 } },
      { name: 'Cerf', record: { victoire: 0, defaite: 1, nul: 0, total: 1 } },
    ]);
    expect(recordsBy(list, (c) => c.ma_magie)).toEqual([]);
    expect(recordsBy(list, (c) => c.adversaire).map((r) => r.name)).toEqual(['Bot', 'Bob']);
    expect(winRate({ victoire: 2, defaite: 0, nul: 1, total: 3 })).toBe(67);
  });
});

const line = (fields: Record<string, unknown>) => ReplayLine.parse({ txt: '', ...fields });

describe('from a journal', () => {
  test('biggest hit and comeback turn, turns counted from the tour lines (the field is the round)', () => {
    const lines = [
      line({ t: 'debut', pv: [50, 50], max: [50, 50], tour: 1 }),
      line({ t: 'tour', txt: 'Tour 1', tour: 1 }),
      line({ t: 'degats', c: 0, n: 20, pv: [30, 50], max: [50, 50], tour: 1 }),
      line({ t: 'tour', txt: 'Tour 2', tour: 1 }),
      line({ t: 'degats', c: 1, n: 35, pv: [30, 15], max: [50, 50], tour: 1 }),
      line({ t: 'tour', txt: 'Tour 3', tour: 2 }),
      line({ t: 'fin', gagnant: 0, tour: 2 }),
    ];
    expect(highlights(lines)).toEqual({ biggestHit: 4, comebackTurn: 2 });
  });

  test('a comeback by the loser is not marked; no amounts, no biggest hit', () => {
    const lines = [
      line({ t: 'degats', c: 1, pv: [50, 40], max: [50, 50] }),
      line({ t: 'tour', txt: 'Tour 1' }),
      line({ t: 'degats', c: 0, pv: [20, 40], max: [50, 50] }),
      line({ t: 'fin', gagnant: 0 }),
    ];
    expect(highlights(lines)).toEqual({ biggestHit: null, comebackTurn: null });
  });

  test('on a journal the engine writes: the biggest hit is a damage line', () => {
    const fighter = (n: number, atq: number, pv: number) => ({
      id: n,
      nom: `C${n}`,
      type: 'combattant',
      atq,
      pv,
      passif: null,
      ultime: null,
      raretes: { nom: 'Commun', poids: 50 },
    });
    const res = simuler(
      { pseudo: 'Seazer', deck: [fighter(1, 14, 60)] },
      { pseudo: 'Bot', deck: [fighter(2, 9, 70)] },
      { seed: 11 },
    ) as { journal: unknown[] };
    const lines = res.journal.map((l) => ReplayLine.parse(l));
    const { biggestHit } = highlights(lines);
    expect(biggestHit).not.toBeNull();
    expect(lines[biggestHit ?? -1]?.t).toBe('degats');
  });
});
