// The short labels written on a fighter's plaque (écriteau) when the admin composes its card image:
// the ultimate on the first line, then one line per passive, each with its colour category
// (categories.ts). One short wording per effect and passive type: a type added to the engine
// without its label does not compile. The admin can replace each line by its own text.

import type { EffectType, PassiveType } from '@forestcard/engine';
import { categoryOf } from './categories.ts';

type Fx = Record<string, unknown>;

const foe = (e: Fx) => e.cible === 'adversaire' || e.ciblem === 'adversaire';
const down = (e: Fx) => +(e.val as number) < 0;

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
  fatigue: () => 'Fatigue',
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
  saignement: () => 'Saignement',
  souffle: (e) => BREATHS[String(e.statut)] || 'Souffle',
  execution: () => 'Exécution',
  atk_avalage: () => 'Avalage',
  marque_avalage: () => 'Avalage',
  execution_direct: () => 'Marque d’exécution',
  transcendance: () => 'Transcendance',
  solidification: () => 'Solidification',
  gel: () => 'Gel',
  fracture: () => 'Fracture',
  copie_ultime: () => 'Copie l’ultime',
  vol_ultime: () => 'Vole l’ultime',
  poison_effet: () => 'Poison',
  brulure_effet: () => 'Brûlure',
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
  brulure: () => 'Brûlure',
  poison: () => 'Poison',
  saignement: () => 'Saignement',
  malediction: () => 'Malédiction',
  fracture: () => 'Fracture',
  gel: () => 'Gel',
  fatigue: () => 'Fatigue',
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
};

export type PlaqueLine = { t: string; c: string; ult: boolean };

// The colour category of a brick on the plaque: a breath takes its element's.
const colourOf = (b: Fx) => categoryOf(b.type === 'souffle' ? b.statut : b.type);

const bricks = (x: unknown): Fx[] =>
  !x ? [] : ((x as Fx).briques ? ((x as Fx).briques as Fx[]) : [x as Fx]).filter(Boolean);
// An effect of the admin's own list (effets perso) has a label: its first words.
const own = (b: Fx) => String(b.lib || b.libelle || b.type || '').split(/ ?[:(]/)[0] || '?';

export function effectLabel(b: Fx): string {
  const f = (EFFECT_LABELS as Record<string, (e: Fx) => string>)[String(b.type)];
  return f ? f(b) : own(b);
}
export function passiveLabel(b: Fx): string {
  const f = (PASSIVE_LABELS as Record<string, (p: Fx) => string>)[String(b.type)];
  return f ? f(b) : own(b);
}

// The lines of a fighter's plaque: its ultimate (each brick of a multi-effect ultimate joined with
// " + "), then its passives. Three passives at most on their own line; more are paired.
export function plaqueLines(card: { ultime?: unknown; passif?: unknown }): PlaqueLine[] {
  const lines: PlaqueLine[] = [];
  const u = bricks(card.ultime);
  if (u.length)
    lines.push({
      t: u.map(effectLabel).join(' + '),
      c: colourOf(u[0] as Fx),
      ult: true,
    });
  const p = bricks(card.passif).map((b) => ({
    t: passiveLabel(b),
    c: colourOf(b),
    ult: false,
  }));
  if (p.length <= 3) lines.push(...p);
  else
    for (let i = 0; i < p.length; i += 2) {
      const [a, b] = [p[i] as PlaqueLine, p[i + 1]];
      lines.push(b ? { t: `${a.t} · ${b.t}`, c: a.c, ult: false } : a);
    }
  return lines;
}
