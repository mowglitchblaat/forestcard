// Status levels (rework of October 2026). A status a card lays has a level, I to III; what each level
// does lives in ONE table, set in the admin (rules `niveaux`), not on the card. The card keeps its
// level (`niveau`), its duration and its chance.
//
//   poison       fixed damage per tick
//   saignement   % of max HP per tick, and heals reduced by a %
//   brulure      % of max HP per tick; the same amount of max HP burnt away (calcination %)
//   fatigue      % of the ATQ taken while it runs
//   fracture     chance to get hurt when attacking, damage in % of its own ATQ
//   glas         speed of the shadow, % of max HP per turn
//   malediction  no level: a fixed ATQ loss for its turns
//   faiblesse    no level: the weakness a vaporisation leaves (damage taken +X % for X turns)
//   critique     the critical power, the same for every card (only a boost raises it)
//   embrasement  the blaze skill: ATQ bonus and self calcination (mechanics/blaze.ts)
//
// Levels add up: a level II laid on a level I gives a level III; level III at most.
//
// Cards saved before the rework have no `niveau`: their level is the one closest to their old value
// (`legacyLevel`), the same mapping as the conversion of the cards in base. Read against the DEFAULT
// table, so that a change of values in the admin does not move old cards from one level to another.

import type { EffectData, Num } from './card.ts';

export type Levels3 = [number, number, number];

export type StatusLevels = {
  poison: Levels3; // damage per tick
  saignement: Levels3; // % of max HP per tick
  saignementSoin: Levels3; // % taken off heals
  brulure: Levels3; // % of max HP per tick
  calcination: number; // % of a burn tick's damage burnt off max HP
  fatigue: Levels3; // % of ATQ
  fractureChance: Levels3; // % chance to get hurt when attacking
  fractureAtq: Levels3; // damage, % of its own ATQ
  glas: Levels3; // % of max HP per turn
  malediction: number; // ATQ lost by each curse
  faiblesse: number; // weakness: % of damage taken in more
  faiblesseTours: number; // weakness: its turns
  critique: number; // critical power: % of the ATQ a critical hit adds (mechanics/critical.ts)
  foudre: number; // lightning mark level I: % more on the next strike taken (mechanics/lightning.ts)
  embrasementAtq: number; // blaze: % of the ATQ its strikes deal in more (mechanics/blaze.ts)
  embrasementCalcination: number; // blaze: % of its max HP burnt off at the end of each turn
  // Skills of October 2026 (mechanics/skills.ts): fixed values, the same for every card.
  fureurPct: number; // incandescent fury: % of ATQ gained per HP loss
  fureurMax: number; // incandescent fury: % of ATQ at most
  sangsue: Levels3; // toxic leech: % of a poison tick healed, by the poison's level
  injection: number; // virulent injection on a level III poison: % of the poison left, as raw damage
  surchargeAuto: number; // overload: % of its max HP it takes (self electrocution)
  surchargeAtq: number; // overload: % of ATQ its strikes lose
  surchargeEnchainement: number; // overload: % of chances to chain (up to 3 strikes)
  accumulateurCharges: number; // accumulator: lightning marks to lay before a charged attack
  accumulateurBonus: number; // accumulator: % more damage on the charged attack
  brisure: number; // will break: damage = this × the ATQ the opponent lost to curses
  etreinte: number; // cursed embrace: ATQ each curse takes more at each attack of the cursed card
  visee: number; // held aim: % of chances to keep a targeting once it is used
};

export const DEFAULT_LEVELS: StatusLevels = {
  poison: [4, 8, 14],
  saignement: [3, 5, 8],
  saignementSoin: [25, 50, 75],
  brulure: [2, 4, 7],
  calcination: 100,
  fatigue: [15, 30, 50],
  fractureChance: [15, 30, 50],
  fractureAtq: [10, 20, 30],
  glas: [5, 8, 12],
  malediction: 3,
  faiblesse: 25,
  faiblesseTours: 2,
  critique: 50,
  foudre: 40,
  embrasementAtq: 30,
  embrasementCalcination: 10,
  fureurPct: 5,
  fureurMax: 50,
  sangsue: [20, 35, 50],
  injection: 50,
  surchargeAuto: 10,
  surchargeAtq: 40,
  surchargeEnchainement: 60,
  accumulateurCharges: 3,
  accumulateurBonus: 50,
  brisure: 2,
  etreinte: 1,
  visee: 50,
};

export const MAX_LEVEL = 3;

// The table in use: the admin's values over the defaults (a missing or broken value keeps its default).
export function levelTable(given: Partial<StatusLevels> | null | undefined): StatusLevels {
  const t: StatusLevels = {
    ...DEFAULT_LEVELS,
    poison: [...DEFAULT_LEVELS.poison],
    saignement: [...DEFAULT_LEVELS.saignement],
    saignementSoin: [...DEFAULT_LEVELS.saignementSoin],
    brulure: [...DEFAULT_LEVELS.brulure],
    fatigue: [...DEFAULT_LEVELS.fatigue],
    fractureChance: [...DEFAULT_LEVELS.fractureChance],
    fractureAtq: [...DEFAULT_LEVELS.fractureAtq],
    glas: [...DEFAULT_LEVELS.glas],
    sangsue: [...DEFAULT_LEVELS.sangsue],
  };
  if (!given || typeof given !== 'object') return t;
  for (const key of Object.keys(DEFAULT_LEVELS) as (keyof StatusLevels)[]) {
    const v = given[key];
    const def = DEFAULT_LEVELS[key];
    if (Array.isArray(def)) {
      if (!Array.isArray(v)) continue;
      const row = t[key] as Levels3;
      for (let i = 0; i < 3; i++) {
        const n = +(v[i] as number);
        if (Number.isFinite(n) && n >= 0) row[i] = n;
      }
    } else {
      const n = +(v as number);
      if (Number.isFinite(n) && n >= 0) (t[key] as number) = n;
    }
  }
  return t;
}

// The value of a level (1 to 3) in a row.
export const at = (row: Levels3, level: number): number =>
  row[Math.min(MAX_LEVEL, Math.max(1, level)) - 1] as number;

// Two levels laid one on the other.
export const addLevels = (a: number, b: number): number => Math.min(MAX_LEVEL, a + b);

// The level whose value is the closest to v (ties go to the lower level); 0 or less: level I.
export function nearestLevel(row: Levels3, v: number): number {
  if (!(v > 0)) return 1;
  let best = 1;
  let gap = Infinity;
  row.forEach((x, i) => {
    const g = Math.abs(x - v);
    if (g < gap) {
      gap = g;
      best = i + 1;
    }
  });
  return best;
}

const num = (v: Num | undefined): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

// The level a card sets, or 0 when it sets none.
export function explicitLevel(v: Num | undefined): number {
  const n = parseInt(String(v), 10);
  return n >= 1 && n <= MAX_LEVEL ? n : 0;
}

export type LeveledStatus = 'poison' | 'saignement' | 'brulure' | 'fatigue' | 'fracture' | 'glas';

// The level an old card would have: the closest to its old value.
export function legacyLevel(kind: LeveledStatus, e: EffectData): number {
  const d = DEFAULT_LEVELS;
  switch (kind) {
    case 'poison':
      return nearestLevel(d.poison, num(e.degtour));
    case 'saignement':
      return nearestLevel(d.saignement, num(e.pctpv));
    case 'brulure':
      return nearestLevel(d.brulure, num(e.pctpv));
    case 'fatigue':
      return nearestLevel(d.fatigue, num(e.fatval));
    case 'fracture':
      return nearestLevel(d.fractureChance, num(e.fchance));
    case 'glas':
      return nearestLevel(d.glas, num(e.glasv));
  }
}

// The level of a status laid by an effect, a passive or an attack effect.
export const levelOf = (kind: LeveledStatus, e: EffectData): number =>
  explicitLevel(e.niveau) || legacyLevel(kind, e);

// The fatigue a rage leaves when it ends: the level the card sets (`fatniv`), or one that follows the
// rage's intensity (its ATQ bonus: up to 5, level I; up to 12, level II; more, level III).
export function rageFatigueLevel(e: EffectData): number {
  const set = explicitLevel(e.fatniv);
  if (set) return set;
  const bonus = num(e.ragev);
  return bonus <= 5 ? 1 : bonus <= 12 ? 2 : 3;
}
