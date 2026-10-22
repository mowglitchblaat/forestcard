// Combat rules. Keys stay in French: the edge function passes them and the result echoes them
// (`regles`), so they are part of the contract.

export type Rules = {
  maxTours: number; // rounds per period (docs/glossaire.md: a round is each card playing once)
  gain: number; // reward for a win
  perte: number; // reward for a loss
  nul: number; // reward for a draw
  plafondEsquive: number; // dodge chance cap, in percent
  maxProlong: number; // overtimes after the first period
  equipe?: number; // relay combat (relay.ts): fighters per player (3)
};

export const DEFAULT_RULES: Rules = {
  maxTours: 10,
  gain: 50,
  perte: 10,
  nul: 20,
  plafondEsquive: 75,
  maxProlong: 3,
};
