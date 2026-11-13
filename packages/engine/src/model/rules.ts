// Combat rules. Keys stay in French: the edge function passes them and the result echoes them
// (`regles`), so they are part of the contract.

import type { Card } from './card.ts';
import type { StatusLevels } from './levels.ts';

export type Rules = {
  maxTours: number; // rounds per period (docs/glossaire.md: a round is each card playing once)
  gain: number; // reward for a win
  perte: number; // reward for a loss
  nul: number; // reward for a draw
  plafondEsquive: number; // dodge chance cap, in percent
  maxProlong: number; // overtimes after the first period
  equipe?: number; // relay combat (relay.ts): fighters per player (3)
  niveaux?: Partial<StatusLevels>; // what each status level does (model/levels.ts); defaults when absent
  // Storm, a combat event (mechanics/storm.ts): at the start of each turn, `chance` % that a bolt
  // strikes a fighter for `degats` damage and a lightning mark. Absent: no storm.
  orage?: { chance: number; degats: number };
  // The game's existing magics and traps (with their image): the creation forge forges one of them
  // (mechanics/forge.ts). Absent or empty: it forges a new card with an effect drawn at random.
  forgeCartes?: Card[];
};

export const DEFAULT_RULES: Rules = {
  maxTours: 10,
  gain: 50,
  perte: 10,
  nul: 20,
  plafondEsquive: 75,
  maxProlong: 3,
};
