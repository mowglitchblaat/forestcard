// The text of every effect, passive, trap condition and ultimate trigger: one wording for every page
// (docs/adr/0003-le-texte-des-effets-dans-describe.md). The wording is the site's (legacy index.html FX
// block); pages add their own presentation (icons, HTML, colours) around it. The engine holds no
// text: this package reads its type lists and its normalization of admin-created effects.
//
// Texts are tables keyed on the engine's type lists: a type added to the engine without a text here
// fails to compile. Types never described one by one keep the legacy fallback, explicitly.

import {
  canonEffect,
  canonPassive,
  type EffectData,
  type EffectType,
  type PassiveType,
  type TrapCondition,
  type TrapConditionType,
  type UltimateTriggerType,
} from '@forestcard/engine';
import { EDITOR_CONDITIONS, EDITOR_MAGICS, EDITOR_PASSIVES, EDITOR_ULTIMATES } from './editor.ts';
import { plaqueLines } from './plaque.ts';

export * from './categories.ts';
export * from './editor.ts';
export * from './plaque.ts';

type Fx = EffectData & Record<string, unknown>;
export type DescribedCard = {
  type: string;
  passif?: Fx | null;
  ultime?: Fx | null;
  effet?: Fx | null;
};

// Swallow marks, written as escapes: the source stays emoji-free.
const FORK = '\u{1F374}';
const KNIFE = '\u{1F52A}';

export const nz = (v: unknown): number => +(v as number) || 0;
const trs = (t: number) => `${t} tour${t > 1 ? 's' : ''}`;
const sgn = (v: number) => (v > 0 ? '+' : '') + v;
const upc = (u: unknown) => (u === 'pct' ? ' %' : '');
const tousT = (t: number) => (t > 1 ? `tous les ${t} tours` : 'à chaque tour');
const ciblT = (e: Fx) => ((e.ciblem || e.cible) === 'soi' ? 'sa propre carte' : "l'adversaire");
const isEmpty = (v: unknown) => v == null || v === '';
// Editor label of a type, looked up as the legacy page did (plain property access on its tables).
const label = (table: object, t: unknown) =>
  (table as Record<string, readonly string[] | undefined>)[t as string];
// Fallback text of a type no table describes: its editor label, else the type itself.
const cat = (t: unknown) => {
  const L = label(EDITOR_MAGICS, t) || label(EDITOR_ULTIMATES, t) || label(EDITOR_PASSIVES, t);
  return L ? (L[0] as string) : String((t || 'Effet') as string);
};
const has = <T extends object>(table: T, key: unknown): key is keyof T =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);

const volTx = (e: Fx, pas?: boolean) => {
  const n = parseInt(String(e.tourdecl), 10) || 0;
  const d = parseInt(String(e.duree), 10) || 0;
  return `Vole ${e.carte === 'magie' ? 'la magie' : 'le piège'} de l'adversaire${n > 1 ? ` au début de son ${n}e tour` : pas ? ' dès son 1er tour' : ''}${d > 0 ? ` pendant ${d} tour${d > 1 ? 's' : ''} (puis la carte retourne à son propriétaire)` : pas ? " (une fois, jusqu'à la fin du combat)" : ''}`;
};

// Swallowing (legacy avTxt, defined outside the FX block but only used inside it).
const avTxt = (q: Fx) => {
  const n = (x: unknown) => +(x as number) || 0;
  const c = isEmpty(q.chance) ? 100 : n(q.chance);
  const r = isEmpty(q.ratio) ? 3 : n(q.ratio);
  const m = isEmpty(q.pctmache) ? 10 : n(q.pctmache);
  const t = n(q.tours) || 3;
  const rp = n(q.repos);
  return `${c < 100 ? `À chaque attaque réussie, ${c} % de chances de poser` : 'Chaque attaque réussie pose'} ${FORK} puis ${KNIFE} ; la 3e attaque réussie ne fait pas de dégâts : elle avale la cible si ses PV actuels valent au moins ${r} × l'ATQ de la cible (sinon les marques tombent et le coup porte normalement). La carte avalée est mâchée ${t} fois (${m} % de ses PV ${q.machebase === 'actuels' ? 'actuels' : 'max'} à chaque tour) puis recrachée${rp ? `, et la carte digère ${rp} tour${rp > 1 ? 's' : ''} sans attaquer` : ''}. Pendant l'avalage, personne n'attaque et tout ce qui visait la carte avalée la touche. Si la cible a des statuts négatifs, ils lui passent ×1,5 : une seule mâche, puis recrachée`;
};

// The execution effect or passive itself (the page read an undefined `X` here until upstream
// 078e524, the same fix as phase 4b).
// Marking status (`statmarque`, `chancemarque`): the status damage that places more marks.
const MARKING_NAMES: Record<string, string> = {
  saignement: 'de saignement',
  brulure: 'de brûlure',
  poison: 'de poison',
  tous: 'de brûlure, de poison ou de saignement',
};
const markingText = (e: Fx) =>
  nz(e.chancemarque) > 0 && typeof e.statmarque === 'string' && MARKING_NAMES[e.statmarque]
    ? `. Une fois marquée, chaque dégât ${MARKING_NAMES[e.statmarque]} qu'elle subit a ${nz(e.chancemarque)} % de chances de poser une marque, jusqu'à la fin du combat`
    : '';

const executionText = (e: Fx) =>
  `${e.chance == null || e.chance === '' || +(e.chance as number) >= 100 ? 'Marque la cible à chaque coup' : `À chaque coup, ${nz(e.chance)} % de chances de marquer la cible`}. À 3 marques, une attaque qui la laisse sous ${nz(e.seuilexec) || 10} % de ses PV max l'exécute (ignore « évite la mort »)${markingText(e)}`;

const transcendenceText = (e: Fx) =>
  `Au début de ses tours ${nz(e.tours) || 4}, ${(nz(e.tours) || 4) * 2} et ${(nz(e.tours) || 4) * 3}, avant d'attaquer, monte d'un niveau (I, II, III) jusqu'à la fin du combat : à chaque niveau purifiée (étourdissement compris), ATQ +${isEmpty(e.patq) ? 15 : nz(e.patq)} %, PV max +${isEmpty(e.ppv) ? 15 : nz(e.ppv)} % ; ses attaques purifient l'adversaire et volent ${(['vv1', 'vv2', 'vv3'] as const).map((k, i) => (isEmpty(e[k]) ? [10, 20, 30][i] : nz(e[k]))).join(' / ')} % des dégâts selon le niveau`;

// Rocket, written as an escape: the source stays emoji-free.
const ROCKET = '\u{1F680}';
const ELEMENTS = ['brulure', 'gel', 'malediction', 'poison', 'saignement', 'fatigue'];
// The status a breath or a missile lays, in words (undefined for an unknown one, as on the page).
const elementText = (el: string, v: number, e: Fx): string | undefined =>
  (
    {
      brulure: `brûlure ${v} % des PV max par tour`,
      gel: `gel ${v} % d'attaque annulée`,
      malediction: `malédiction ATQ −${v} par tour`,
      poison: `poison ${v} dégâts par tour`,
      saignement: `saignement ${v} % des PV max par tour${nz(e.reducsoin) ? `, soins −${nz(e.reducsoin)} %` : ''}`,
      fatigue: `fatigue ATQ −${v} %`,
    } as Record<string, string>
  )[el];

// The riposte of a block (bloque_attaque), once, on the first strike it blocks.
function riposteText(e: Fx): string {
  const ch = isEmpty(e.chance) ? 100 : nz(e.chance);
  const p = ch < 100 ? `${ch} % de chances de ` : '';
  if (e.riposte === 'renvoi')
    return ` · riposte : ${p}renvoyer ${nz(e.pctriposte)} % des dégâts bloqués à l'attaquant`;
  if (e.riposte !== 'statut') return '';
  const T = nz(e.tours) || 2;
  const el = (e.rstatut as string) || 'brulure';
  const st =
    el === 'aleatoire'
      ? `un statut au hasard (valeur ${nz(e.sval)})`
      : el === 'etourdi'
        ? "l'étourdir"
        : elementText(el, nz(e.sval), e) || el;
  return ` · riposte : ${p}${el === 'etourdi' ? st : 'infliger ' + st} à l'attaquant pendant ${trs(T)}`;
}

// Programming text (the passive, and the effect that gives it).
function programmingText(p: Fx): string {
  // Bricks as stored, nulls included: a null brick throws, as on the legacy page.
  const ls = (x: unknown): Fx[] =>
    !x ? [] : (x as Fx).briques ? ((x as Fx).briques as Fx[]) : [x as Fx];
  const it = [
    ...ls(p.passifs).map((q) => q.lib || q.type),
    ...ls(p.ultimes).map((q) => 'ultime ' + String((q.lib || q.type) as string)),
  ];
  const ch = isEmpty(p.chance) ? 50 : nz(p.chance);
  const N = isEmpty(p.nbpassif) ? 2 : nz(p.nbpassif);
  return `Programmation : à chaque tour, ${ch} % de chances de se programmer (les ${N} premières fois en passif, puis 50 % passif / 50 % actif). Passif : acquiert au hasard ${it.length ? (it as string[]).join(', ') : 'un passif ou un ultime parmi tous ceux du jeu'}, qui reste en attente. Actif : réveille les passifs programmés et lance tous les ultimes programmés`;
}

// ── Passives ──
type PassiveContext = { c: number; t: number; v: number; T: number };
const PASSIVE_TEXT: Record<PassiveType, (p: Fx, x: PassiveContext) => string> = {
  detonation: (p) => {
    const ch = isEmpty(p.chance) ? 100 : nz(p.chance);
    const b = isEmpty(p.bonus) ? 50 : nz(p.bonus);
    const cs = isEmpty(p.conso) ? 100 : nz(p.conso);
    return `${ch < 100 ? ch + ' % de chances, à chaque coup, de faire' : 'À chaque coup, fait'} DÉTONER la brûlure, le poison et le saignement de la cible : ${cs >= 100 ? 'tous leurs dégâts restants' : cs + ' % de leurs dégâts restants'} d'un coup, +${b} %${nz(p.val) ? ` et +${nz(p.val)} dégâts bruts` : ''}${nz(p.recul) ? ` (dégâts de zone : subit ${nz(p.recul)} % du souffle)` : ''} · statuts purgés · dégâts des statuts divisés par 2 contre une carte solidifiée · une carte tuée par l'explosion ne peut pas être réanimée`;
  },
  programmation: (p) => programmingText(p),
  evite_mort: () => 'Évite la mort une fois (reste à 1 PV, statuts négatifs retirés)',
  voler: (p) => volTx(p, true),
  reanimation: (p) => `Réanimation : revient avec ${nz(p.pctrev)} % de ses PV max (une fois)`,
  esquive: (_, { c }) => `${c} % de chances d'esquiver chaque attaque`,
  fatigue: (p, { c }) =>
    `${c} % de chances de fatiguer la cible à chaque coup (ATQ −${nz(p.fatval)}${upc(p.u)} pendant ${trs(nz(p.fattours) || 1)})`,
  aleatoire: (p, { c }) =>
    `Effet aléatoire ${tousT(nz(p.every))}${c < 100 ? ` (${c} % de chances)` : ''}`,
  purification: (p) =>
    `Purification : retire les statuts négatifs ${tousT(nz(p.every))}${nz(p.fois) > 0 ? ` (${p.fois} fois max)` : ''}`,
  soin_tour: (p, { v }) =>
    `Se soigne de ${v}${p.u === 'pct' ? ' % des PV max' : ' PV'} à chaque tour`,
  renvoi: (p, { v }) =>
    p.u === 'pct' ? `Renvoie ${v} % des dégâts reçus` : `Renvoie ${v} dégâts à chaque coup reçu`,
  atq_tours: (p, { v, t }) => `ATQ +${v}${upc(p.u)} ${tousT(t)}`,
  pv_tours: (p, { v, t }) => `PV max +${v}${upc(p.u)} ${tousT(t)}`,
  multi_frappe: (p, { c }) => `${c} % de chances de frapper ${nz(p.frappes)} fois par tour`,
  reduc_degats: (p, { c, v }) => `${c} % de chances de réduire les dégâts reçus de ${v}${upc(p.u)}`,
  bonus_frappe: (p, { v }) =>
    `S'il est frappé ${nz(p.coups) || 1} fois, sa prochaine attaque fait +${v}${upc(p.u)} de dégâts`,
  etourdir: (p, { c, t }) =>
    `${c} % de chances${nz(p.essais) > 1 ? ` (${p.essais} tentatives)` : ''} d'étourdir la cible ${t > 1 ? `pendant ${t} attaques` : '(elle saute sa prochaine attaque)'}`,
  vol_pct_atq: (p, { c }) =>
    `${c} % de chances de se soigner de ${nz(p.pctatq)} % des dégâts infligés`,
  brulure: (p, { c, T }) =>
    `${c} % de chances de brûler la cible (${nz(p.pctpv)} % de ses PV max par tour, ${trs(T)})`,
  poison: (p, { c, T }) =>
    `${c} % de chances d'empoisonner la cible (${nz(p.degtour)} dégâts par tour, ${trs(T)})`,
  malediction: (_, { c, v, T }) =>
    `${c} % de chances de maudire la cible (ATQ −${v} par tour, ${trs(T)}, puis l'ATQ revient petit à petit)`,
  enchainement: (p, { c }) =>
    `${c} % de chances de frapper une fois de plus, puis retente${nz(p.max) > 0 ? ` (${p.max} frappes en plus au maximum)` : ''}`,
  saignement: (p, { c, T }) =>
    `${c} % de chances de faire saigner la cible (${nz(p.pctpv)} % des PV max par tour, soins −${nz(p.reducsoin)} %, ${trs(T)})`,
  gel: (p, { c, T }) => `${c} % de chances de geler la cible : ${frostLevels(p, T)}`,
  execution: (p) => executionText(p),
  avalage: (p) => avTxt(p),
  transcendance: (p) => transcendenceText(p),
  solidification: (_, { c, T }) =>
    `À chacun de ses tours, ${c < 100 ? c + ' % de chances de se solidifier' : 'se solidifie'} pendant ${trs(T)} de l'adversaire (insensible à l'étourdissement, ne se purge pas, brisée par une fracture ; détonations et missiles ne lui font que la moitié des dégâts de statuts)`,
  fracture: (p, { c, T }) =>
    `${c} % de chances de fracturer la cible (${nz(p.fchance)} % de se blesser de ${nz(p.degfrac)} PV en attaquant, ${trs(T)})`,
};

export function fxPassif(passive: Fx): string {
  const p = canonPassive(passive) as Fx;
  const c = isEmpty(p.chance) ? 100 : nz(p.chance);
  const t = nz(p.tours);
  const v = nz(p.val);
  const T = t || 1;
  return has(PASSIVE_TEXT, p.type) ? PASSIVE_TEXT[p.type](p, { c, t, v, T }) : cat(p.type);
}

// Frost in 3 levels (mechanics/frost.ts): what each level does, with the frost's values.
const frostLevels = (e: Fx, T: number): string => {
  const a = nz(e.annul);
  const s = isEmpty(e.eclat) ? 10 : nz(e.eclat);
  const a2 = Math.min(100, Math.round(a * 2.5));
  return `+1 niveau de gel, ${trs(T)} (1 : ${a} % d'attaque annulée et esquive −${a} % · 2 : ${a2} % et esquive −${a2} % · 3 : glaciation, n'attaque pas à son tour suivant puis la glace éclate, ${s} dégâts)`;
};

// ── Effects (magics, ultimates, trap payloads) ──
type EffectContext = { t: number; T: number; v: number; pct: boolean; ci: string };
// Basic attack effects reuse the passive texts.
const attackEffect = (e: Fx) => [
  'Attaque de base : ' + fxPassif({ ...e, type: (e.type as string).slice(4) }),
];
const BREATH_NAMES: Record<string, string> = {
  brulure: 'de feu (brûlure',
  gel: 'de glace (gel',
  malediction: 'maudit (malédiction',
  poison: 'empoisonné (poison',
  saignement: 'de sang (saignement',
  fatigue: "d'épuisement (fatigue",
};

const EFFECT_TEXT: Record<EffectType, (e: Fx, x: EffectContext) => string[]> = {
  atq_mod: (e, { v }) => [
    `${e.cible === 'adversaire' ? "ATQ de l'adversaire" : 'Son ATQ'} ${sgn(v)}${upc(e.u)}`,
  ],
  pv_mod: (e, { v }) => [
    `${e.cible === 'adversaire' ? "PV max de l'adversaire" : 'Ses PV max'} ${sgn(v)}${upc(e.u)}`,
  ],
  soin: (_, { v, pct }) => [`Se soigne de ${v}${pct ? ' % des PV max' : ' PV'}`],
  reanimation: (e) => [`Réanimation : revient avec ${nz(e.pctrev)} % de ses PV max (une fois)`],
  rage: (e) => [
    `Rage : +${nz(e.ragev)}${upc(e.u)} de dégâts par coup pendant ${trs(nz(e.ragetours) || 1)}, puis fatigue (ATQ −${nz(e.fatval)}${upc(e.u)} pendant ${trs(nz(e.fattours) || 1)})`,
  ],
  fatigue: (e, { ci }) => [
    `Fatigue ${ci} : ATQ −${nz(e.fatval)}${upc(e.u)} pendant ${trs(nz(e.fattours) || 1)}`,
  ],
  aleatoire: (e) => {
    const n = Math.max(1, nz(e.nbalea) || nz(e.fois) || 1);
    return [`Effet aléatoire${n > 1 ? ` ×${n}` : ''}`];
  },
  soin_tours: (_, { v, pct, T }) => [
    `Régénération : +${v}${pct ? ' % des PV max' : ' PV'} par tour pendant ${trs(T)}`,
  ],
  purification: (e) => [
    `Purification ${e.cible === 'adversaire' ? "de l'adversaire" : 'de sa carte'} : retire les statuts négatifs${nz(e.fois) > 1 ? ` (${e.fois} fois, ${tousT(nz(e.every))})` : ''}`,
  ],
  degats: (_, { v }) => [`Inflige ${v} dégâts directs`],
  vol_vie: (_, { v }) => [`Vole ${v} PV à l'adversaire`],
  annule_attaque: () => [
    "Annule la prochaine attaque de l'adversaire (elle n'a pas lieu : ni dégâts, ni statuts, ni marques)",
  ],
  bloque_attaque: (e) => [
    `Bloque ${nz(e.nbbloque) > 0 ? `les ${nz(e.nbbloque) > 1 ? nz(e.nbbloque) + ' premiers coups' : 'le premier coup'} de ` : ''}la prochaine attaque de l'adversaire : ${nz(e.nbbloque) > 0 ? 'ils touchent' : 'elle touche'} sans faire de dégâts, mais ses statuts et ses marques (exécution, avalage) s'appliquent${riposteText(e)}`,
  ],
  detonation: (e) => {
    const b = isEmpty(e.bonus) ? 50 : nz(e.bonus);
    const cs = isEmpty(e.conso) ? 100 : nz(e.conso);
    const p = e;
    return [
      `DÉTONATION : fait exploser la brûlure, le poison et le saignement de l'adversaire : ${cs >= 100 ? 'tous leurs dégâts restants' : cs + ' % de leurs dégâts restants'} d'un coup, +${b} %${nz(p.val) ? ` et +${nz(p.val)} dégâts bruts` : ''}${nz(p.recul) ? ` (dégâts de zone : subit ${nz(p.recul)} % du souffle)` : ''} · statuts purgés · dégâts des statuts divisés par 2 contre une carte solidifiée · une carte tuée par l'explosion ne peut pas être réanimée`,
    ];
  },
  missiles: (e) => {
    const N = nz(e.frappes) || 3;
    const b = isEmpty(e.bonus) ? 50 : nz(e.bonus);
    const cs = isEmpty(e.conso) ? 100 : nz(e.conso);
    const al = e.mstatut === 'aleatoire';
    const el = ELEMENTS.includes(e.mstatut as string) ? (e.mstatut as string) : '';
    const ch = isEmpty(e.chance) ? 100 : nz(e.chance);
    const v = nz(e.sval);
    const T2 = nz(e.tours) || 2;
    const st = elementText(el, v, e);
    return [
      `${ROCKET} ${N} MISSILE${N > 1 ? 'S' : ''} : chacun explose pour ${nz(e.val)} dégâts bruts et fait détoner la brûlure, le poison et le saignement de la cible (${cs >= 100 ? 'tous leurs dégâts restants' : cs + ' % de leurs dégâts restants'}, +${b} %)${al || el ? `, puis ${ch < 100 ? ch + ' % de chances de poser ' : 'pose '}${al ? `un statut au hasard (valeur ${v})` : st} pendant ${trs(T2)} — le missile suivant le fait exploser` : ''}${nz(e.recul) ? ` · dégâts de zone : subit ${nz(e.recul)} % du souffle` : ''} · une carte tuée par l'explosion ne se réanime pas · esquivable (l'explosion à côté touche alors les deux cartes avec les dégâts de zone), blocable, renvoyé par le renvoi de dégâts`,
    ];
  },
  renvoi: (_, { v, T }) => [`Renvoie ${v} % des dégâts reçus pendant ${trs(T)}`],
  insensible_piege: (_, { T }) => [`Insensible aux pièges pendant ${trs(T)}`],
  annule_magies: (e) => [
    nz(e.tours) > 0
      ? `Annule la magie de l'adversaire pendant ${trs(nz(e.tours))}`
      : "Annule la magie de l'adversaire jusqu'à la fin du combat",
  ],
  degats_tours: (_, { v, T }) => [`Inflige ${v} dégâts après ${trs(T)}`],
  double_degats: (_, { T }) => [`Double ses dégâts pendant ${trs(T)}`],
  echange_atq: () => ["Échange son ATQ avec celle de l'adversaire"],
  echange_atq_def: (e) => [
    `Échange l'ATQ et les PV ${(e.ciblem || e.cible) === 'soi' ? 'de sa carte' : "de l'adversaire"}`,
  ],
  echange_pv: () => ["Échange ses PV avec ceux de l'adversaire"],
  echange_tout: () => ["Échange ATQ et PV avec l'adversaire"],
  malediction: (_, { v, T, ci }) => [
    `Maudit ${ci} : ATQ −${v} par tour pendant ${trs(T)}, puis l'ATQ revient petit à petit`,
  ],
  saignement: (e, { T, ci }) => [
    `Fait saigner ${ci} : ${nz(e.pctpv)} % des PV max par tour, soins −${nz(e.reducsoin)} %, ${trs(T)}`,
  ],
  gel: (e, { T, ci }) => [`Gèle ${ci} : ${frostLevels(e, T)}`],
  souffle: (e) => {
    const al = e.statut === 'aleatoire';
    const el = al ? '' : (e.statut as string) || 'brulure';
    const ch = isEmpty(e.chance) ? 100 : nz(e.chance);
    const v = nz(e.sval);
    const T2 = nz(e.tours) || 2;
    const rc = nz(e.rechance);
    const rm = isEmpty(e.remax) ? 3 : nz(e.remax);
    const st = elementText(el, v, e);
    // An unknown status prints "undefined)", as on the legacy page.
    return [
      `Souffle ${al ? 'élémentaire aléatoire' : `${BREATH_NAMES[el]})`} : ${nz(e.val)} dégâts, puis ${ch < 100 ? ch + ' % de chances de ' : ''}${al ? `un statut au hasard à chaque souffle (brûlure, gel, malédiction, poison, saignement ou fatigue ; valeur ${v})` : st} pendant ${trs(T2)}${rc > 0 ? ` · ${rc} % de chances de souffler encore (${rm} souffle${rm > 1 ? 's' : ''} en plus au maximum)` : ''} · esquivable, blocable et réductible ; le renvoi ne renvoie que les dégâts`,
    ];
  },
  execution: (e) => [executionText(e)],
  execution_direct: (e) => [
    `Pose ${Math.max(1, nz(e.nbmarques))} marque${Math.max(1, nz(e.nbmarques)) > 1 ? 's' : ''} d'exécution sur l'adversaire. À 3 marques, une attaque qui le laisse sous ${nz(e.seuilexec) || 10} % de ses PV max l'exécute (ignore « évite la mort »)${markingText(e)}`,
  ],
  atk_avalage: (e) => ['Attaque de base : ' + avTxt(e)],
  marque_avalage: (e) => {
    const k = Math.min(2, Math.max(1, nz(e.nbmarques)));
    return [
      `Pose ${k === 1 ? `la fourchette ${FORK}` : `la fourchette ${FORK} et le couteau ${KNIFE}`} (avalage) sur l'adversaire`,
    ];
  },
  transcendance: (e) => [transcendenceText(e)],
  programmation: (e) => [`Donne le passif ${programmingText(e)} (jusqu'à la fin du combat)`],
  solidification: (e, { T }) => {
    const ch = isEmpty(e.chance) ? 100 : nz(e.chance);
    return [
      `${ch < 100 ? ch + ' % de chances de se solidifier' : 'Se solidifie'} pendant ${trs(T)} de l'adversaire (insensible à l'étourdissement, ne se purge pas, brisée par une fracture ; détonations et missiles ne lui font que la moitié des dégâts de statuts)`,
    ];
  },
  fracture: (e, { T, ci }) => [
    `Fracture ${ci} (${nz(e.fchance)} % de se blesser de ${nz(e.degfrac)} PV en attaquant, ${trs(T)})`,
  ],
  vol_ultime: () => ["Vole l'ultime de l'adversaire"],
  copie_ultime: () => [
    "Copie l'ultime de l'adversaire : il le garde, et cette carte peut aussi le lancer",
  ],
  poison_effet: (e, { T, ci }) => [
    `Empoisonne ${ci} : ${nz(e.degtour)} dégâts par tour pendant ${trs(T)}`,
  ],
  brulure_effet: (e, { T, ci }) => [
    `Brûle ${ci} : ${nz(e.pctpv)} % des PV max par tour pendant ${trs(T)}`,
  ],
  etourdir_effet: (e, { T }) => {
    const ch = isEmpty(e.chance) ? 100 : nz(e.chance);
    const qui = (e.ciblem || e.cible) === 'soi' ? 'sa propre carte' : "l'adversaire";
    return [
      `${ch < 100 ? `${ch} % de chances${nz(e.essais) > 1 ? ` (${e.essais} tentatives)` : ''} d'étourdir` : 'Étourdit'} ${qui} pendant ${trs(T)}`,
    ];
  },
  esquive_mod: (e, { v }) => [
    `${e.cible === 'adversaire' ? "Esquive de l'adversaire" : 'Son esquive'} ${sgn(v)} %`,
  ],
  reset_ultime: () => ["Réinitialise l'ultime (utilisable à nouveau)"],
  mort_evitee: (e) => {
    const k = e.cond || 'aucune';
    return [
      `Évite la mort une fois (reste à 1 PV, statuts négatifs retirés)${k === 'pv_max' ? ` — si ses PV max sont d'au moins ${nz(e.seuil)}` : k === 'degats_infliges' ? ` — s'il a déjà infligé ${nz(e.seuil)} dégâts` : ''}`,
    ];
  },
  detruire: (e) => [`Détruit ${e.carte === 'magie' ? 'la magie' : 'le piège'} de l'adversaire`],
  voler: (e) => [volTx(e)],
  equiper: (e) => [`Équipe ${e.carte === 'magie' ? 'une autre magie' : 'un autre piège'} du deck`],
  // Not described one by one by the site: the generic basic-attack text.
  atk_fatigue: attackEffect,
  atk_detonation: attackEffect,
  atk_enchainement: attackEffect,
  atk_brulure: attackEffect,
  atk_poison: attackEffect,
  atk_etourdir: attackEffect,
  atk_saignement: attackEffect,
  atk_malediction: attackEffect,
  atk_fracture: attackEffect,
  atk_gel: attackEffect,
};

// One described item: its (normalized) type, for pages that colour by category, and its text.
export type Item = { type: string; text: string };

const effectTexts = (e: Fx): string[] => {
  const t = nz(e.tours);
  const context: EffectContext = { t, T: t || 1, v: nz(e.val), pct: e.u === 'pct', ci: ciblT(e) };
  if (has(EFFECT_TEXT, e.type)) return EFFECT_TEXT[e.type](e, context);
  // Unknown basic attack effect: same generic text; anything else: its admin label.
  if (String(e.type || '').startsWith('atk_')) return attackEffect(e);
  return [cat(e.type)];
};

// An effect (or a composite { briques }) as items, one per brick.
export function effectItems(effect: Fx | null | undefined): Item[] {
  if (!effect) return [];
  if (Array.isArray(effect.briques))
    return effect.briques.flatMap((b) => effectItems(b as Fx | null));
  const e = canonEffect(effect) as Fx;
  return effectTexts(e).map((text) => ({ type: String(e.type), text }));
}

export const fxEffet = (effect: Fx | null | undefined): string[] =>
  effectItems(effect).map((i) => i.text);

// ── Trap conditions, ultimate triggers ──
// The conditions without their own text fall back on their editor label in fxCond, as on the page.
const CONDITION_TEXT: { [K in TrapConditionType]?: (c: TrapCondition) => string } = {
  adv_attaque: (c) =>
    (nz(c.coups) || 1) > 1
      ? `Toutes les ${nz(c.coups)} attaques de l'adversaire`
      : "À chaque attaque de l'adversaire",
  adv_ultime: () => "Quand l'adversaire utilise son ultime",
  proprio_pv_sous: (c) => `Quand le propriétaire passe sous ${nz(c.seuilpv)} % de PV`,
  adv_pv_bas: (c) => `Quand l'adversaire passe sous ${nz(c.seuilpv)} % de PV`,
  adv_soigne: () => "Quand l'adversaire se soigne",
  proprio_soigne: () => 'Quand le propriétaire se soigne',
  proprio_meurt: () => 'Quand le propriétaire est sur le point de mourir',
  proprio_attaque: (c) =>
    (nz(c.coups) || 1) > 1
      ? `Toutes les ${nz(c.coups)} attaques du propriétaire`
      : 'À chaque attaque du propriétaire',
  proprio_coup_fort: (c) =>
    `Quand le propriétaire subit au moins ${nz(c.seuildeg) || 1} dégâts en un coup`,
  tour_n: (c) => `Au tour ${nz(c.ntour) || 1} du combat`,
};

// Ultimate triggers on an event or under X % of HP (udecl), X in udx. An unknown key shows as is;
// only the first X is replaced, as on the page.
const ULTIMATE_TRIGGER_TEXT: Record<UltimateTriggerType, string> = {
  pv_sous: 'quand il passe sous X % de ses PV',
  adv_pv_sous: "quand l'adversaire passe sous X % de PV",
  coups_recus: "toutes les X attaques de l'adversaire",
  attaques: "toutes les X attaques qu'il fait",
  coup_fort: 'quand il subit au moins X dégâts en un coup',
  statut: 'quand il reçoit un statut (brûlure, poison, gel, malédiction…)',
  esquive: 'quand il esquive',
  bloque: 'quand il bloque une attaque',
  soigne: 'quand il est soigné',
  son_piege: 'quand son piège se déclenche',
  piege_adv: 'quand le piège adverse se déclenche',
  adv_ultime: "quand l'adversaire lance son ultime",
};

export function fxCond(c: TrapCondition | null | undefined): string {
  if (!c || !c.type) return '';
  const text = has(CONDITION_TEXT, c.type) ? CONDITION_TEXT[c.type] : undefined;
  if (text) return text(c);
  const L = label(EDITOR_CONDITIONS, c.type);
  return L ? (L[0] as string) : String(c.type);
}

export function fxTrigUlt(u: Fx): string {
  const p: string[] = [];
  if (nz(u.apres_tours)) p.push(`dès son tour ${u.apres_tours}`);
  if (u.sur_carte) p.push('quand un piège se déclenche');
  if (u.udecl) {
    const X = u.udx ?? (/pv_sous/.test(u.udecl) ? 50 : 1);
    p.push(String(label(ULTIMATE_TRIGGER_TEXT, u.udecl) || u.udecl).replace(/\bX\b/, String(X)));
  }
  let s = p.length ? 'Se déclenche ' + p.join(' ou ') : 'Ultime';
  if (nz(u.delai_tours) > 0) s += `, au plus une fois tous les ${u.delai_tours} tours`;
  if (nz(u.utilisations) > 0)
    s += `, ${u.utilisations} utilisation${(u.utilisations as number) > 1 ? 's' : ''} maximum`;
  return s;
}

// A card's description, as sections. Pages render them with their own presentation.
export type Section = {
  kind: 'passives' | 'ultimate' | 'magic' | 'trap';
  title: string;
  meta?: string; // ultimate trigger, or trap condition and number of triggers
  items: Item[];
};

export function describeCard(c: DescribedCard): Section[] {
  const sections: Section[] = [];
  if (c.type === 'combattant') {
    const passives = c.passif
      ? c.passif.briques
        ? (c.passif.briques.filter((b) => b && b.type) as Fx[])
        : c.passif.type
          ? [c.passif]
          : []
      : [];
    if (passives.length)
      sections.push({
        kind: 'passives',
        title: passives.length > 1 ? 'Passifs' : 'Passif',
        items: passives.map((p) => ({
          type: String((canonPassive(p) as Fx).type),
          text: fxPassif(p),
        })),
      });
    const u = c.ultime;
    if (u && (u.type || u.briques)) {
      const items = effectItems(u);
      if (items.length)
        sections.push({ kind: 'ultimate', title: 'Ultime', meta: fxTrigUlt(u), items });
    }
  } else if (c.type === 'magie') {
    const items = effectItems(c.effet);
    if (items.length) sections.push({ kind: 'magic', title: 'Effet de la magie', items });
  } else if (c.type === 'piege' && c.effet) {
    const e = c.effet;
    const items = effectItems(e.effet as Fx | null | undefined);
    if (items.length || e.condition)
      sections.push({
        kind: 'trap',
        title: 'Piège',
        meta:
          (fxCond(e.condition) || 'Piège caché') +
          ` · ${nz(e.declenchements) > 1 ? `jusqu'à ${e.declenchements} déclenchements` : '1 seul déclenchement'}`,
        items,
      });
  }
  return sections;
}

// The plaque's lines with the explanation of each effect, in the site's wording (the card composer).
export const plaqueLinesExplained = (card: {
  type?: unknown;
  ultime?: unknown;
  passif?: unknown;
  effet?: unknown;
}) =>
  plaqueLines(card, {
    effect: (b) => fxEffet(b as Fx).join(' '),
    passive: (b) => fxPassif(b as Fx),
    condition: (c) => fxCond(c as TrapCondition),
  });
