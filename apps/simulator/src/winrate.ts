// Winrate statistics, ported from combat.html (the `wrCalc` function between `// wr:begin` and
// `// wr:end`): same duels, same seeds, same equipment draws, same counters. The page reads the
// journal only to count turns; here the engine runs without a journal and the turns are counted
// from its events, which is what makes the command line version fast.
//
// test/winrate.test.ts runs the page's own wrCalc against this port.

import { simulate, type Card, type OnEvent, type Player } from '@forestcard/engine';

// A card as the page loads it (combat.html, REEL): the database row plus its rarity name.
export type SimCard = Card & { id: number | string; rarete: string };

export type WinrateConfig = {
  kind: 'combattant' | 'magie' | 'piege'; // what is tested
  cartes: SimCard[]; // all fighters
  M: SimCard[]; // all magics
  Pg: SimCard[]; // all traps
  T: SimCard[]; // the cards tested
  mode: 'all' | 'rar' | 'sel'; // fighters: opponents = all, same rarity, or the checked ones
  N: number; // duels per opponent (fighters) or per tested card (magics, traps)
  checked: Set<string>; // checked fighter ids (mode 'sel')
  // Equipment: '' none, 'r' random, an id, or for opponents 's' (same as the tested cards).
  mt: string;
  pt: string;
  mo: string;
  po: string;
};

export type FighterResult = {
  t: SimCard;
  v: number; // wins
  d: number; // losses
  x: number; // draws
  n: number; // duels
  rounds: number; // sum of rounds
  par: Record<string, { v: number; n: number }>; // wins per opponent rarity
};

export type EquipmentResult = {
  t: SimCard;
  v: number; // with the tested card
  d: number;
  x: number;
  n: number;
  rounds: number;
  v0: number; // without it
  d0: number;
  x0: number;
};

export type WinrateResult = FighterResult | EquipmentResult;

// Same hash as the page (wrH): picks the random equipment of a duel.
const hash = (a: number, b: number) => {
  let h = Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 40503);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
};

type Duel = { winner: number | null; rounds: number };

// One duel, no journal: the turns are counted from the events.
function duel(a: Player, b: Player, seed: number): Duel {
  let turns = 0;
  const onEvent: OnEvent = (event) => {
    if (event.type === 'turnStarted') turns++;
  };
  const result = simulate(a, b, { seed }, onEvent);
  return { winner: result.gagnant, rounds: Math.ceil(turns / 2) };
}

// Computes the results of the tested cards T[from..to). The index of a tested card in T is part of
// its seeds, so a range computed alone gives the same numbers as the whole run (parallel workers).
export function winrates(cfg: WinrateConfig, from = 0, to = cfg.T.length): WinrateResult[] {
  const { kind, cartes, M, Pg, T, mode, N, checked } = cfg;
  const out: WinrateResult[] = [];
  const equip = (v: string, list: SimCard[], s: number, k: number): SimCard | null =>
    v === '' || !list.length
      ? null
      : v === 'r'
        ? (list[hash(s, k) % list.length] as SimCard)
        : list.find((c) => String(c.id) === v) || null;
  const deck = (c: SimCard, m: SimCard | null, p: SimCard | null) =>
    [c, m, p].filter(Boolean) as SimCard[];
  const opponentChoice = (vo: string, vt: string) => (vo === 's' ? vt : vo);
  const won = (r: Duel, side: number) => (r.winner === null ? 0 : r.winner === side ? 1 : -1);
  for (let ti = from; ti < to; ti++) {
    const t = T[ti] as SimCard;
    if (kind === 'combattant') {
      const opponents = cartes.filter(
        (o) =>
          o !== t &&
          (mode === 'all' ||
            (mode === 'rar' && o.rarete === t.rarete) ||
            (mode === 'sel' && checked.has(String(o.id)))),
      );
      const R: FighterResult = { t, v: 0, d: 0, x: 0, n: 0, rounds: 0, par: {} };
      for (let j = 0; j < opponents.length; j++) {
        const o = opponents[j] as SimCard;
        const P = R.par[o.rarete] || (R.par[o.rarete] = { v: 0, n: 0 });
        for (let s = 0; s < N; s++) {
          const k = ti * 100000 + j * 100 + s;
          const flip = s % 2; // the tested card alternates first / second player
          const testedSide = flip ? 1 : 0;
          const dt = deck(t, equip(cfg.mt, M, k, 1), equip(cfg.pt, Pg, k, 2));
          const dO = deck(
            o,
            equip(opponentChoice(cfg.mo, cfg.mt), M, k, 3),
            equip(opponentChoice(cfg.po, cfg.pt), Pg, k, 4),
          );
          const r = duel(
            { pseudo: 'A', deck: flip ? dO : dt },
            { pseudo: 'B', deck: flip ? dt : dO },
            k * 7919 + 1,
          );
          const w = won(r, testedSide);
          R.n++;
          P.n++;
          R.rounds += r.rounds;
          if (w === 0) R.x++;
          else if (w > 0) {
            R.v++;
            P.v++;
          } else R.d++;
        }
      }
      out.push(R);
    } else {
      // A magic or a trap: the same duels with and without the tested card.
      const R: EquipmentResult = { t, v: 0, d: 0, x: 0, n: 0, rounds: 0, v0: 0, d0: 0, x0: 0 };
      for (let s = 0; s < N; s++) {
        const k = ti * 100000 + s;
        const h = hash(k, 9);
        const X = cartes[h % cartes.length] as SimCard;
        let Y = cartes[(h >>> 8) % cartes.length] as SimCard;
        if (Y === X) Y = cartes[(h + 1) % cartes.length] as SimCard;
        const flip = s % 2;
        const testedSide = flip ? 1 : 0;
        const mO = equip(opponentChoice(cfg.mo, cfg.mt), M, k, 3);
        const pO = equip(opponentChoice(cfg.po, cfg.pt), Pg, k, 4);
        const mT = kind === 'magie' ? t : equip(cfg.mt, M, k, 1);
        const pT = kind === 'piege' ? t : equip(cfg.pt, Pg, k, 2);
        const dO = deck(Y, mO, pO);
        const d1 = deck(X, mT, pT);
        const d0 = deck(X, kind === 'magie' ? null : mT, kind === 'piege' ? null : pT);
        const r1 = duel(
          { pseudo: 'A', deck: flip ? dO : d1 },
          { pseudo: 'B', deck: flip ? d1 : dO },
          k * 7919 + 1,
        );
        const w1 = won(r1, testedSide);
        const r0 = duel(
          { pseudo: 'A', deck: flip ? dO : d0 },
          { pseudo: 'B', deck: flip ? d0 : dO },
          k * 7919 + 1,
        );
        const w0 = won(r0, testedSide);
        R.n++;
        R.rounds += r1.rounds;
        if (w1 === 0) R.x++;
        else if (w1 > 0) R.v++;
        else R.d++;
        if (w0 === 0) R.x0++;
        else if (w0 > 0) R.v0++;
        else R.d0++;
      }
      out.push(R);
    }
  }
  return out;
}
