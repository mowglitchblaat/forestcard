// Shapes exchanged with an engine during the iso run. They mirror the legacy contract
// (docs/legacy/moteur.md) loosely on purpose: the harness never interprets card data, it only
// feeds identical inputs to both engines and compares what comes out.

export type CardType = 'combattant' | 'magie' | 'piege';

export type Card = {
  id: number | string;
  type: CardType;
  nom: string;
  [field: string]: unknown;
};

export type Player = { pseudo: string; deck: Card[] };

export type Rules = Record<string, number>;

export type EngineOptions = { seed: number; regles?: Rules };

export type JournalEvent = { t: string; k?: string; [field: string]: unknown };

export type EngineResult = {
  seed: number;
  gagnant: number | null;
  recompenses: number[];
  journal: JournalEvent[];
  [field: string]: unknown;
};

export type Engine = (a: Player, b: Player, options: EngineOptions) => EngineResult;

// One combat to run on both engines. `id` locates it in its suite so it can be replayed.
export type Encounter = {
  id: string;
  a: Player;
  b: Player;
  options: EngineOptions;
};
