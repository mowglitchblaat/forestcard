// The short labels written on a fighter's plaque (écriteau) when the admin composes its card image:
// the ultimate on the first line, then one line per passive, each with its colour category
// (categories.ts). One short wording per effect and passive type: a type added to the engine
// without its label does not compile. The admin can replace each line by its own text.

import { levelOf, type EffectType, type LeveledStatus, type PassiveType } from '@forestcard/engine';
import { categoryOf } from './categories.ts';

type Fx = Record<string, unknown>;

const foe = (e: Fx) => e.cible === 'adversaire' || e.ciblem === 'adversaire';
const down = (e: Fx) => +(e.val as number) < 0;
// A leveled status shows its level (rework of October 2026): « Poison II ».
const ROMAN = ['I', 'II', 'III'];
const lv = (name: string, kind: LeveledStatus) => (e: Fx) =>
  `${name} ${ROMAN[levelOf(kind, e) - 1] as string}`;
const ROOTS: Record<string, string> = {
  epineux: 'Enracinement épineux',
  empoisonne: 'Enracinement empoisonné',
  inhibiteur: 'Enracinement inhibiteur',
};
const rootLabel = (e: Fx) => ROOTS[String(e.variante)] ?? 'Enracinement';

const BREATHS: Record<string, string> = {
  brulure: 'Souffle de feu',
  gel: 'Souffle de glace',
  malediction: 'Souffle maudit',
  poison: 'Souffle empoisonné',
  saignement: 'Souffle de sang',
  fatigue: "Souffle d'épuisement",
  aleatoire: 'Souffle élémentaire',
};

const EFFECT_LABELS: Record<EffectType, (e: Fx) => string> = {
  atq_mod: (e) => (foe(e) ? 'Affaiblit l’ATQ' : down(e) ? 'Perd de l’ATQ' : 'Gagne de l’ATQ'),
  pv_mod: (e) => (foe(e) ? 'Affaiblit les PV' : down(e) ? 'Perd des PV' : 'Gagne des PV'),
  soin: () => 'Soin',
  reanimation: () => 'Réanimation',
  rage: () => 'Rage',
  fatigue: lv('Fatigue', 'fatigue'),
  aleatoire: () => 'Effet aléatoire',
  soin_tours: () => 'Régénération',
  purification: () => 'Purification',
  degats: () => 'Dégâts directs',
  vol_vie: () => 'Vol de vie',
  annule_attaque: () => 'Annule l’attaque',
  renvoi: () => 'Renvoi des dégâts',
  insensible_piege: () => 'Insensible aux pièges',
  annule_magies: () => 'Annule la magie',
  degats_tours: () => 'Dégâts différés',
  double_degats: () => 'Double son ATQ',
  echange_atq: () => 'Échange d’ATQ',
  echange_atq_def: () => 'Inverse ATQ et PV',
  echange_pv: () => 'Échange de PV',
  echange_tout: () => 'Échange total',
  malediction: () => 'Malédiction',
  saignement: lv('Saignement', 'saignement'),
  souffle: (e) => BREATHS[String(e.statut)] || 'Souffle',
  execution: () => 'Exécution',
  atk_avalage: () => 'Avalage',
  marque_avalage: () => 'Avalage',
  execution_direct: () => 'Marque d’exécution',
  transcendance: () => 'Transcendance',
  solidification: () => 'Solidification',
  gel: () => 'Gel',
  fracture: lv('Fracture', 'fracture'),
  copie_ultime: () => 'Copie l’ultime',
  vol_ultime: () => 'Vole l’ultime',
  poison_effet: lv('Poison', 'poison'),
  brulure_effet: lv('Brûlure', 'brulure'),
  etourdir_effet: () => 'Étourdissement',
  atk_fatigue: () => 'Coup épuisant',
  atk_enchainement: () => 'Enchaînement',
  atk_brulure: () => 'Coup brûlant',
  atk_poison: () => 'Coup empoisonné',
  atk_etourdir: () => 'Coup étourdissant',
  atk_saignement: () => 'Coup sanglant',
  atk_malediction: () => 'Coup maudit',
  atk_fracture: () => 'Coup brise-os',
  atk_gel: () => 'Coup glacial',
  glas_effet: lv('Glas', 'glas'),
  atk_glas: () => 'Coup funèbre',
  esquive_mod: (e) => (down(e) ? 'Baisse l’esquive' : 'Esquive accrue'),
  reset_ultime: () => 'Relance l’ultime',
  mort_evitee: () => 'Évite la mort',
  detruire: (e) => (e.carte === 'piege' ? 'Détruit un piège' : 'Détruit une magie'),
  voler: (e) => (e.carte === 'piege' ? 'Vole un piège' : 'Vole une magie'),
  equiper: (e) => (e.carte === 'piege' ? 'Équipe un piège' : 'Équipe une magie'),
  detonation: () => 'Détonation',
  bloque_attaque: () => 'Blocage',
  missiles: () => 'Missiles',
  atk_detonation: () => 'Coup détonant',
  programmation: () => 'Programmation',
  atk_headshot: () => 'Headshot',
  ciblage: () => 'Ciblage',
  brume: () => 'Brume',
  lien_parasite: () => 'Lien parasitaire',
  mue_forcee: () => 'Mue forcée',
  reduc_degats: () => 'Protection',
  enracinement: rootLabel,
  atk_enracinement: () => 'Coup enracinant',
  contamination: () => 'Contamination',
  atk_contamination: () => 'Coup contaminant',
  cisaillement: () => 'Cisaillement',
  atk_cisaillement: () => 'Coup tranchant',
  atk_critique: () => 'Coups critiques',
  marque_foudre: () => 'Marque de foudre',
  atk_foudre: () => 'Coup foudroyant',
  embrasement: () => 'Embrasement',
  fureur_incandescente: () => 'Fureur incandescente',
  sangsue_toxique: () => 'Sangsue toxique',
  injection_virulente: () => 'Injection virulente',
  surcharge: () => 'Surcharge',
  brisure_volonte: () => 'Brisure de volonté',
  verrouillage_total: () => 'Verrouillage total',
  etreinte_maudite: () => 'Étreinte maudite',
};

const PASSIVE_LABELS: Record<PassiveType, (p: Fx) => string> = {
  evite_mort: () => 'Évite la mort',
  reanimation: () => 'Réanimation',
  multi_frappe: () => 'Frappes multiples',
  enchainement: () => 'Enchaînement',
  esquive: () => 'Esquive',
  reduc_degats: () => 'Réduction des dégâts',
  renvoi: () => 'Renvoi des dégâts',
  vol_pct_atq: () => 'Vol de vie',
  etourdir: () => 'Étourdissement',
  brulure: lv('Brûlure', 'brulure'),
  poison: lv('Poison', 'poison'),
  saignement: lv('Saignement', 'saignement'),
  malediction: () => 'Malédiction',
  fracture: lv('Fracture', 'fracture'),
  gel: () => 'Gel',
  fatigue: lv('Fatigue', 'fatigue'),
  execution: () => 'Marque d’exécution',
  avalage: () => 'Avalage',
  solidification: () => 'Solidification',
  bonus_frappe: () => 'Contre-attaque',
  voler: (p) => (p.carte === 'piege' ? 'Vole un piège' : 'Vole une magie'),
  transcendance: () => 'Transcendance',
  aleatoire: () => 'Passif aléatoire',
  soin_tour: () => 'Régénération',
  atq_tours: () => 'ATQ croissante',
  pv_tours: () => 'PV croissants',
  purification: () => 'Purification',
  programmation: () => 'Programmation',
  detonation: () => 'Détonation',
  glas: lv('Glas', 'glas'),
  headshot: () => 'Headshot',
  lien_parasite: () => 'Lien parasitaire',
  mutation: () => 'Mutation insecte',
  mue: () => 'Mue',
  reaction: (p) => REACTION_LABELS[String(p.stat)] ?? 'Réaction',
  enracinement: rootLabel,
  contamination: () => 'Contamination',
  sedimentation: () => 'Sédimentation',
  replique: () => 'Réplique sismique',
  critique: () => 'Coup critique',
  courant_ascendant: () => 'Courant ascendant',
  cisaillement: () => 'Cisaillement',
  foudre: () => 'Marque de foudre',
  fureur_incandescente: () => 'Fureur incandescente',
  sangsue_toxique: () => 'Sangsue toxique',
  accumulateur: () => 'Accumulateur',
  etreinte_maudite: () => 'Étreinte maudite',
  visee_maintenue: () => 'Visée maintenue',
};

const REACTION_LABELS: Record<string, string> = {
  atq: 'Colère',
  pv: 'Carapace',
  esquive: 'Instinct',
  blocage: 'Garde',
  reduc: 'Endurcissement',
};

// t: the short label; d: the explanation of the effect (empty without a describer).
// types: the effect or passive types the line stands for (the combat overlay lights the line when one acts).
export type PlaqueLine = { t: string; c: string; ult: boolean; d: string; types: string[] };
// Explanation of an effect brick and of a passive brick (index.ts passes its own text).
export type PlaqueDescriber = {
  effect: (b: Fx) => string;
  passive: (b: Fx) => string;
  condition: (c: Fx) => string;
};

// An admin "perso_" effect whose key mentions a stun plays as a stun (engine, combat/state.ts):
// its plaque line reads and is coloured like one, instead of showing its raw key.
const adminStun = (b: Fx) =>
  typeof b.type === 'string' && b.type.indexOf('perso_') === 0 && /etourd/.test(b.type);
// The colour category of a brick on the plaque: a breath takes its element's.
const colourOf = (b: Fx) =>
  categoryOf(b.type === 'souffle' ? b.statut : adminStun(b) ? 'etourdir_effet' : b.type);

const bricks = (x: unknown): Fx[] =>
  !x ? [] : ((x as Fx).briques ? ((x as Fx).briques as Fx[]) : [x as Fx]).filter(Boolean);
// An effect of the admin's own list (effets perso) has a label: its first words.
const own = (b: Fx) => String(b.lib || b.libelle || b.type || '').split(/ ?[:(]/)[0] || '?';

export function effectLabel(b: Fx): string {
  if (adminStun(b)) return EFFECT_LABELS.etourdir_effet(b);
  const f = (EFFECT_LABELS as Record<string, (e: Fx) => string>)[String(b.type)];
  return f ? f(b) : own(b);
}
export function passiveLabel(b: Fx): string {
  const f = (PASSIVE_LABELS as Record<string, (p: Fx) => string>)[String(b.type)];
  return f ? f(b) : own(b);
}

// The lines written on a card. A fighter: its ultimate (each brick of a multi-effect ultimate joined
// with " + "), then its passives; three passives at most on their own line, more are paired. A magic:
// one line per effect. A trap: one line per effect, the first one's explanation opened by its
// condition. With a describer, each line also carries the explanation of its effects.
export function plaqueLines(
  card: { type?: unknown; ultime?: unknown; passif?: unknown; effet?: unknown },
  describe?: PlaqueDescriber,
): PlaqueLine[] {
  const effectLine = (b: Fx): PlaqueLine => ({
    t: effectLabel(b),
    c: colourOf(b),
    ult: false,
    d: describe ? describe.effect(b) : '',
    types: [String(b.type)],
  });
  if (card.type === 'magie') return bricks(card.effet).map(effectLine);
  if (card.type === 'piege') {
    const trap = (card.effet || {}) as Fx;
    const lines = bricks(trap.effet).map(effectLine);
    const first = lines[0];
    if (first && describe && trap.condition) {
      const cond = describe.condition(trap.condition as Fx);
      first.d = [cond && `Se déclenche : ${cond}.`, first.d].filter(Boolean).join(' ');
    }
    return lines;
  }
  const lines: PlaqueLine[] = [];
  const u = bricks(card.ultime);
  if (u.length)
    lines.push({
      t: u.map(effectLabel).join(' + '),
      c: colourOf(u[0] as Fx),
      ult: true,
      d: describe ? u.map(describe.effect).join(' + ') : '',
      types: u.map((b) => String(b.type)),
    });
  const p = bricks(card.passif).map((b) => ({
    t: passiveLabel(b),
    c: colourOf(b),
    ult: false,
    d: describe ? describe.passive(b) : '',
    types: [String(b.type)],
  }));
  if (p.length <= 3) lines.push(...p);
  else
    for (let i = 0; i < p.length; i += 2) {
      const [a, b] = [p[i] as PlaqueLine, p[i + 1]];
      lines.push(
        b
          ? {
              t: `${a.t} · ${b.t}`,
              c: a.c,
              ult: false,
              d: [a.d, b.d].filter(Boolean).join(' · '),
              types: [...a.types, ...b.types],
            }
          : a,
      );
    }
  return lines;
}
