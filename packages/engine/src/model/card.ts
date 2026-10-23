// Card data as stored in the `cartes` table and passed by the edge function. Keys stay in French:
// they are the data contract with the database (docs/glossaire.md).
//
// Numeric fields are typed `Num`: the admin editor writes a number or null, and the legacy engine
// also tolerates an empty string (`x == null || x === ''` checks). The engine never validates or
// normalizes these values: it applies the same JavaScript coercions as the legacy engine, so its
// behaviour stays identical even on unexpected input.

export type Num = number | '' | null | undefined;

export type CardType = 'combattant' | 'magie' | 'piege';

// A single effect, passive, ultimate or trap payload ("brique"). The legacy engine treats them all
// as one loose shape keyed by `type`; the fields below are every field it reads.
export type EffectData = {
  type?: string;
  briques?: (EffectData | null)[];

  // Targeting: `cible` for stat and swap effects, `ciblem` for statuses ("soi" | "adversaire").
  cible?: string;
  ciblem?: string;

  // Generic amounts. `u` is the unit of `val`: 'pct' (percent of a stat) or 'pts' (points).
  val?: Num;
  u?: string;
  tours?: Num;
  chance?: Num;
  essais?: Num;
  fois?: Num;
  every?: Num;
  max?: Num;

  // Revive, rage and fatigue.
  pctrev?: Num;
  ragev?: Num;
  ragetours?: Num;
  fatval?: Num;
  fattours?: Num;

  // Statuses.
  pctpv?: Num;
  reducsoin?: Num;
  degtour?: Num;
  annul?: Num;
  stunch?: Num; // old frost (a chance of stun), no longer read
  eclat?: Num; // frost: shatter damage at glaciation (level 3)
  glasv?: Num; // knell: speed of its shadow (% of max HP per turn)
  fchance?: Num;
  degfrac?: Num;

  // Breath: the status laid (`aleatoire`: drawn for each breath), its value, and the chance to
  // breathe again (`rechance` %, `remax` more breaths at most).
  statut?: string;
  sval?: Num;
  // bloque_attaque: strikes blocked, riposte (renvoi: % of the blocked damage; statut: rstatut)
  nbbloque?: Num;
  riposte?: string;
  pctriposte?: Num;
  rstatut?: string;
  rechance?: Num;
  remax?: Num;

  // Detonation and missiles: share of the remaining status damage consumed (`conso` %), bonus %,
  // blast on the detonator (`recul` %); missiles: their status (`mstatut`), their number is `frappes`.
  conso?: Num;
  bonus?: Num;
  recul?: Num;
  mstatut?: string;

  // Programming passive: how many first programmings are passive, and the programmable passives
  // and ultimates. `lib`: an effect's label, given by the admin.
  nbpassif?: Num;
  passifs?: EffectData | null;
  ultimes?: EffectData | null;
  lib?: unknown;

  // Random effect.
  nbalea?: Num;

  // Execution and swallowing.
  seuilexec?: Num;
  nbmarques?: Num;
  statmarque?: string; // marking status: 'saignement', 'brulure', 'poison', 'tous' or 'aucun'
  chancemarque?: Num;
  ratio?: Num;
  pctmache?: Num;
  machebase?: string;
  repos?: Num;

  // Transcendence.
  patq?: Num;
  ppv?: Num;
  vv1?: Num;
  vv2?: Num;
  vv3?: Num;

  // Avoid death (magic): condition and threshold.
  cond?: string;
  seuil?: Num;

  // Passives.
  frappes?: Num;
  pctatq?: Num;
  coups?: Num;

  // Card theft, destruction, equipment: which card ("magie" | "piege"), delay and duration.
  carte?: string;
  tourdecl?: Num;
  duree?: Num;

  // Ultimate triggers.
  apres_tours?: Num;
  delai_tours?: Num;
  utilisations?: Num;
  sur_carte?: unknown;
  udecl?: string; // an ULTIMATE_TRIGGER_TYPES key: on an event, or under X % of HP
  udx?: Num; // its X: count, damage or percent

  // Trap payload: when it fires, what it does, how many times.
  condition?: TrapCondition;
  effet?: EffectData | null;
  declenchements?: Num;
};

export type TrapCondition = {
  type?: string;
  coups?: Num;
  seuilpv?: Num;
  seuildeg?: Num; // proprio_coup_fort: damage of a single hit
  ntour?: Num; // tour_n: turn of the combat
};

export type Card = {
  id?: unknown;
  type: string; // a CardType; other values are kept as stored
  nom: string;
  atq?: Num;
  pv?: Num;
  passif?: EffectData | null;
  ultime?: EffectData | null;
  effet?: EffectData | null;
  image?: string | null;
  imageCombat?: string | null;
  rar?: unknown;
  // Set on the engine's "no magic" / "no trap" placeholders only.
  vide?: number;
};

export type Player = {
  pseudo: string;
  deck: Card[];
  dos?: string | null;
};
