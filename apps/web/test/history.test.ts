// The history: address parameters, a stored journal grouped by turn and turned into HP series, and
// the journal validation against a journal the engine really writes.

import { describe, expect, test } from 'vite-plus/test';
import { simuler } from '../../../packages/journal/src/index.ts';
import { ReplayLine } from '../src/data/history.ts';
import { byTurn, hpSeries } from '../src/views/history/replay.tsx';
import { HistorySearch } from '../src/views/history/search.ts';

const line = (t: string, txt: string, pv?: number[], max?: number[]) =>
  ReplayLine.parse({ t, txt, ...(pv && { pv }), ...(max && { max }) });

describe('address parameters', () => {
  test('tab and combat, invalid ones dropped', () => {
    expect(HistorySearch.parse({ tab: 'boosters', combat: 4 })).toEqual({
      tab: 'boosters',
      combat: 4,
    });
    expect(HistorySearch.parse({ tab: 'x', combat: 'y' })).toEqual({});
  });
});

describe('replay', () => {
  const lines = [
    line('debut', 'Le combat commence !', [50, 40], [50, 40]),
    line('tour', 'Tour 1'),
    line('degats', 'A frappe : 10', [50, 30], [50, 40]),
    line('tour', 'Tour 2'),
    line('soin', 'B se soigne', [50, 40], [50, 40]),
    line('fin', 'A gagne'),
  ];

  test('lines grouped by turn, the start without a title', () => {
    expect(byTurn(lines).map((g) => [g.title, g.lines.map((l) => l.line.t)])).toEqual([
      [null, ['debut']],
      ['Tour 1', ['degats']],
      ['Tour 2', ['soin', 'fin']],
    ]);
  });

  test('HP as a share of max HP, only from lines that carry them', () => {
    expect(hpSeries(lines)).toEqual([
      [1, 1],
      [1, 0.75],
      [1, 1],
    ]);
  });

  test('a journal written by the engine validates, and gives an HP series', () => {
    const fighter = (id: number, atq: number, pv: number) => ({
      id,
      nom: `C${id}`,
      type: 'combattant',
      atq,
      pv,
      passif: null,
      ultime: null,
      raretes: { nom: 'Commun', poids: 50 },
    });
    const player = (pseudo: string, c: ReturnType<typeof fighter>) => ({ pseudo, deck: [c] });
    const { journal } = simuler(
      player('Seazer', fighter(1, 12, 60)),
      player('Bot', fighter(2, 9, 70)),
      {
        seed: 7,
      },
    ) as { journal: unknown[] };
    const parsed = journal.map((l) => ReplayLine.parse(l));
    expect(parsed[0]?.joueurs?.map((j) => j.pseudo)).toEqual(['Seazer', 'Bot']);
    expect(hpSeries(parsed).length).toBe(parsed.length);
  });
});
