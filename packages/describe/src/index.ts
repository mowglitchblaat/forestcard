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
  DEFAULT_LEVELS,
  levelOf,
  rageFatigueLevel,
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
// The default status levels (engine model/levels.ts), for the admin's level table.
export { DEFAULT_LEVELS } from '@forestcard/engine';
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

// Status levels (rework of October 2026, engine model/levels.ts): the text gives the level and what
// it does with the default values of the level table.
const ROMAN = ['I', 'II', 'III'] as const;
const roman = (n: number) => ROMAN[Math.min(3, Math.max(1, n)) - 1] as string;
const L = DEFAULT_LEVELS;
const of = (row: readonly number[], n: number) => row[Math.min(3, Math.max(1, n)) - 1] as number;
const poisonTxt = (e: Fx) => {
  const n = levelOf('poison', e);
  return `poison ${roman(n)} : ${of(L.poison, n)} dégâts par tour`;
};
const bleedTxt = (e: Fx) => {
  const n = levelOf('saignement', e);
  return `saignement ${roman(n)} : ${of(L.saignement, n)} % des PV max par tour, soins −${of(L.saignementSoin, n)} %`;
};
const burnTxt = (e: Fx) => {
  const n = levelOf('brulure', e);
  return `brûlure ${roman(n)} : ${of(L.brulure, n)} % des PV max par tour, qui calcine les PV max`;
};
const fatigueLevelTxt = (n: number) => `fatigue ${roman(n)} : ATQ −${of(L.fatigue, n)} %`;
const fatigueTxt = (e: Fx) => fatigueLevelTxt(levelOf('fatigue', e));
const fractureTxt = (e: Fx) => {
  const n = levelOf('fracture', e);
  return `fracture ${roman(n)} : ${of(L.fractureChance, n)} % de se blesser en attaquant, ${of(L.fractureAtq, n)} % de son ATQ`;
};
const knellTxt = (e: Fx) => {
  const n = levelOf('glas', e);
  return `Glas ${roman(n)} : une ombre avance sur sa vie de ${of(L.glas, n)} % de ses PV max par tour`;
};
const curseTxt = `ATQ −${L.malediction}`;
// Rooting (engine mechanics/rooting.ts): its variant and values.
const rootTxt = (e: Fx) => {
  if (e.variante === 'inhibiteur')
    return "enracinement inhibiteur : pas d'ultime tant qu'il dure (l'ultime attend, puis se lance)";
  if (e.variante === 'empoisonne')
    return `enracinement empoisonné : chaque frappe qu'elle porte l'empoisonne (poison ${roman(nz(e.niveau) || 1)}, ${trs(nz(e.ptours) || 2)})`;
  return `enracinement épineux : chaque frappe qu'elle porte lui inflige ${isEmpty(e.val) ? 5 : nz(e.val)} dégâts`;
};
// Shear (engine mechanics/blades.ts): a packet of air blades on the opponent.
const shearTxt = (e: Fx) => {
  const n = Math.max(1, Math.floor(nz(e.lames) || 1));
  const d = isEmpty(e.val) ? 10 : nz(e.val);
  return `poser ${n} lame${n > 1 ? 's' : ''} d'air sur l'adversaire, qui frappe${n > 1 ? 'nt' : ''} ensemble dans ${trs(isEmpty(e.tours) ? 2 : nz(e.tours))} : ${n} × ${d} = ${n * d} dégâts (esquivable ; ni purifiée, ni prolongée)`;
};
// Lightning mark (engine mechanics/lightning.ts).
const lightningTxt = `poser un niveau de marque de foudre sur l'adversaire (niveau I : son prochain coup reçu fait +${L.foudre} % · niveau II : l'éclair rebondit sur sa magie puis son piège, les charge, et détruit une carte déjà chargée ; puis la marque revient à zéro)`;
const blazeTxt = `Embrasement : la carte s'enflamme pendant 2 de ses tours : ATQ +${L.embrasementAtq} %, chaque coup pose une brûlure I (2 tours), et elle se calcine (−${L.embrasementCalcination} % de ses PV max) à chacun de ses tours`;
const furyTxt = `Fureur incandescente : chaque perte de PV donne +${L.fureurPct} % d'ATQ à ses coups (jusqu'à +${L.fureurMax} %) ; chaque soin en retire un`;
const leechTxt = `Sangsue toxique : à chaque tic de poison de l'adversaire, récupère ${L.sangsue[0]} / ${L.sangsue[1]} / ${L.sangsue[2]} % de ses dégâts (poison I / II / III)`;
const injectionTxt = `Injection virulente : sans poison, pose un poison I (3 tours) ; empoisonné, son poison monte d'un niveau ; au poison III, dégâts bruts : ${L.injection} % des dégâts de poison restants (le poison reste)`;
const overloadTxt = `Surcharge : s'électrocute (${L.surchargeAuto} % de ses PV max), puis pendant 2 tours : ATQ −${L.surchargeAtq} %, ${L.surchargeEnchainement} % de chances d'enchaîner (jusqu'à 3 coups), chaque coup pose la foudre`;
const willBreakTxt = `Brisure de volonté : dégâts bruts égaux à ${L.brisure} × l'ATQ que l'adversaire a perdue aux malédictions depuis le début du combat`;
const contaminationTxt = `contamination : ses statuts négatifs (ceux déjà là et ceux qui arrivent) durent un tour de plus ; avec une brûlure, VAPORISATION : la brûlure part en vapeur et la carte est affaiblie (dégâts reçus +${L.faiblesse} % pendant ${L.faiblesseTours} tours)`;
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
  return `${c < 100 ? `À chaque attaque réussie, ${c} % de chances de poser` : 'Chaque attaque réussie pose'} ${FORK} puis ${KNIFE} ; la 3e attaque réussie ne fait pas de dégâts : elle avale la cible si ses PV actuels valent au moins ${r} × l'ATQ de la cible (sinon les marques tombent et le coup porte normalement). La carte avalée est mâchée ${t} fois (${m} % de ses PV ${q.machebase === 'actuels' ? 'actuels' : 'max'} à chaque tour) puis recrachée${rp ? `, et la carte digère ${rp} tour${rp > 1 ? 's' : ''} sans attaquer` : ''}. Pendant l'avalage, personne n'attaque et tout ce qui visait la carte avalée la touche. Si la cible a des statuts négatifs, ils lui passent plus forts (un niveau de plus, ×1,5 pour le gel) et ×1,5 plus longs : une seule mâche, puis recrachée`;
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
// A leveled status takes the effect's level (`niveau`), else the level of its old value (`sval`).
const elementText = (el: string, v: number, e: Fx): string | undefined =>
  (
    {
      brulure: burnTxt({ niveau: e.niveau, pctpv: v }),
      gel: `gel ${v} % d'attaque annulée`,
      malediction: `malédiction ${curseTxt}`,
      poison: poisonTxt({ niveau: e.niveau, degtour: v }),
      saignement: bleedTxt({ niveau: e.niveau, pctpv: v }),
      fatigue: fatigueTxt({ niveau: e.niveau, fatval: v }),
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
    `${c} % de chances de fatiguer la cible à chaque coup (${fatigueTxt(p)}, ${trs(nz(p.fattours) || 1)})`,
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
    `${c} % de chances de brûler la cible (${burnTxt(p)}, ${trs(T)} ; fait fondre la glace d'un niveau)`,
  poison: (p, { c, T }) => `${c} % de chances d'empoisonner la cible (${poisonTxt(p)}, ${trs(T)})`,
  malediction: (_, { c, T }) =>
    `${c} % de chances de maudire la cible (${curseTxt} pendant ${trs(T)}, puis l'ATQ revient ; chaque malédiction ajoute la sienne)`,
  enchainement: (p, { c }) =>
    `${c} % de chances de frapper une fois de plus, puis retente${nz(p.max) > 0 ? ` (${p.max} frappes en plus au maximum)` : ''}`,
  saignement: (p, { c, T }) =>
    `${c} % de chances de faire saigner la cible (${bleedTxt(p)}, ${trs(T)})`,
  gel: (p, { c, T }) => `${c} % de chances de geler la cible : ${frostLevels(p, T)}`,
  execution: (p) => executionText(p),
  avalage: (p) => avTxt(p),
  transcendance: (p) => transcendenceText(p),
  solidification: (_, { c, T }) =>
    `À chacun de ses tours, ${c < 100 ? c + ' % de chances de se solidifier' : 'se solidifie'} pendant ${trs(T)} de l'adversaire (insensible à l'étourdissement, ne se purge pas, brisée par une fracture ; détonations et missiles ne lui font que la moitié des dégâts de statuts)`,
  fracture: (p, { c, T }) =>
    `${c} % de chances de fracturer la cible (${fractureTxt(p)}, ${trs(T)})`,
  headshot: (p, { c }) => headshotText(p, c),
  lien_parasite: (p, { c }) =>
    `${c} % de chances, à chaque coup, de poser ${linksTxt(p)} sur la cible pendant ${trs(nz(p.tours) || 3)} : ${linkPct(p)} % de ses soins ${linkEach(p)}lui reviennent, et elle partage les siens de la même façon (les liens se cumulent, 100 % au plus)`,
  mutation: (p) => mutationText(p),
  mue: (p) =>
    `Mue : après 2 tours de suite avec un statut négatif, la carte entre en mue ; 2 tours plus tard, au début de son tour, elle mue : statuts négatifs (étourdissement compris), marques d'exécution, ciblage et lien parasitaire retirés, mais ${moltLoss(p)}`,
  reaction: (p) => reactionText(p),
  glas: (p, { c }) =>
    `${c} % de chances de faire sonner le Glas (${knellTxt(p)}) ; quand ses PV passent dessous, la mort l'emporte (pas d'évite la mort ni de réanimation ; 3 purifications pour l'effacer)`,
  enracinement: (p, { c }) =>
    `${c} % de chances, à chaque coup, d'enraciner la cible (${rootTxt(p)}, ${trs(nz(p.tours) || 2)})`,
  contamination: (p, { c }) =>
    `${c} % de chances, à chaque coup, de contaminer la cible (${contaminationTxt}, ${trs(nz(p.tours) || 2)})`,
  sedimentation: (p) =>
    `Sédimentation : chaque coup reçu (hors esquive) lui donne une couche de roche ; à 3 couches, un bouclier de ${isEmpty(p.val) ? '20 % de ses PV max' : `${nz(p.val)}${p.u === 'pct' ? ' % de ses PV max' : ''}`} se lève (il encaisse les coups avant le blocage et les réductions ; les boucliers s'additionnent)`,
  critique: (_, { c }) =>
    `${c} % de chances, à chaque coup, de faire un COUP CRITIQUE (${critTxt}, avant blocage et réductions)`,
  courant_ascendant: (p) =>
    `Courant ascendant : à chaque coup critique, ce coup fait +${isEmpty(p.val) ? 20 : nz(p.val)} % de dégâts et sa puissance critique monte de ${isEmpty(p.pctcrit) ? 10 : nz(p.pctcrit)} points pendant ${trs(isEmpty(p.tours) ? 2 : nz(p.tours))} (cumulable ${isEmpty(p.max) ? 3 : nz(p.max)} fois)`,
  cisaillement: (p, { c }) => `${c} % de chances, à chaque coup, de ${shearTxt(p)}`,
  foudre: (_, { c }) => `${c} % de chances, à chaque coup, de ${lightningTxt}`,
  fureur_incandescente: () => furyTxt,
  sangsue_toxique: () => leechTxt,
  accumulateur: () =>
    `Accumulateur : chaque marque de foudre posée lui donne une charge ; à ${L.accumulateurCharges} charges, sa prochaine attaque fait +${L.accumulateurBonus} %`,
  etreinte_maudite: () =>
    `Étreinte maudite : à chaque attaque de l'adversaire, chacune de ses malédictions lui retire ${L.etreinte} ATQ de plus (rendue avec la malédiction)`,
  visee_maintenue: () =>
    `Visée maintenue : quand un de ses ciblages est utilisé, ${L.visee} % de chances de le garder pour le coup suivant`,
  replique: (p) =>
    `Réplique sismique : chaque coup reçu (hors esquive) lui donne une charge ; à 3 charges, la terre frappe l'attaquant (${isEmpty(p.pctatq) ? 50 : nz(p.pctatq)} % de son ATQ, esquivable ; ce n'est pas une attaque)`,
};

// Headshot, mist, parasitic link, mutation, molt, reaction (engine: mechanics/headshot.ts, mist.ts,
// parasite.ts, insect.ts, reaction.ts).
// Critical hits (engine mechanics/critical.ts): the common power, a % of the ATQ.
const critTxt = `+${L.critique} % de son ATQ en dégâts`;
const linkPct = (e: Fx) => (isEmpty(e.pctlien) ? 50 : Math.min(100, nz(e.pctlien)));
const linkN = (e: Fx) => Math.max(1, Math.floor(nz(e.nbliens)) || 1);
const linksTxt = (e: Fx) =>
  linkN(e) > 1 ? `${linkN(e)} liens parasitaires` : 'un lien parasitaire';
const linkEach = (e: Fx) => (linkN(e) > 1 ? 'par lien ' : '');
const headshotText = (_e: Fx, c: number) =>
  `${c < 100 ? c + ' % de chances, à chaque coup, de faire' : 'Chaque coup fait'} un HEADSHOT, un coup critique sans tirer la chance de critique : ${critTxt}, avant blocage et réductions`;
const lossAmt = (v: unknown, u: unknown) => (isEmpty(v) ? '10 %' : `${nz(v)}${upc(u)}`);
const moltLoss = (e: Fx) =>
  `perd ${lossAmt(e.mueatq, e.uatq)} d'ATQ et ${lossAmt(e.muepv, e.upv)} de PV max`;
const mutationText = (p: Fx) => {
  const L2 = [
    nz(p.mreduc) ? `dégâts subis −${nz(p.mreduc)} %` : '',
    nz(p.msaignpct) || nz(p.msaignniv)
      ? `son attaque fait saigner (${isEmpty(p.msaignch) ? 100 : nz(p.msaignch)} % de chances, ${bleedTxt({ niveau: p.msaignniv, pctpv: p.msaignpct })}, ${trs(nz(p.msaigntours) || 2)})`
      : '',
  ].filter(Boolean);
  const own = !isEmpty(p.mueatq) || !isEmpty(p.muepv);
  return `Mutation insecte : monte d'un niveau (3 max) à chaque statut négatif reçu et après 4 tours de suite sans statut négatif. I : ATQ +${nz(p.matq)}${upc(p.u)} et PV +${nz(p.mpv)}${upc(p.u)} · II : ${L2.join(', ') || 'rien de plus'} · III : mue instantanée${own ? ` (${moltLoss(p)})` : ''}, esquive +${nz(p.mesq)} % et lien parasitaire sur l'adversaire (${trs(nz(p.lientours) || 3)}, ${linkPct(p)} % de ses soins pour elle)`;
};
const REACTION_STATS: Record<string, string> = {
  atq: 'ATQ',
  pv: 'PV max',
  esquive: 'esquive',
  blocage: 'chance de bloquer un coup',
  reduc: 'réduction des dégâts',
};
const reactionText = (p: Fx) => {
  const stat = String(p.stat || 'atq');
  const unit = stat === 'atq' || stat === 'pv' ? upc(p.u) : ' %';
  const cap = nz(p.plafond);
  return `Quand elle ${p.quand === 'statut' ? 'reçoit un statut négatif' : 'subit des dégâts'} : ${REACTION_STATS[stat] ?? stat} +${nz(p.val)}${unit}${cap > 0 ? ` (${cap}${unit === ' %' ? ' %' : ''} au total au maximum)` : ''}`;
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
  return `+1 niveau de gel, ${trs(T)} (1 : ${a} % d'attaque annulée et esquive −${a} % · 2 : ${a2} % et esquive −${a2} % · 3 : glaciation, n'attaque pas à son tour suivant puis la glace éclate, ${s} dégâts ; sur une carte qui brûle, la glace éteint le feu au lieu de geler)`;
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
    `Rage : +${nz(e.ragev)}${upc(e.u)} de dégâts par coup pendant ${trs(nz(e.ragetours) || 1)}, puis ${fatigueLevelTxt(rageFatigueLevel(e))} pendant ${trs(nz(e.fattours) || 1)}`,
  ],
  fatigue: (e, { ci }) => [
    `Fatigue ${ci} : ${fatigueTxt(e)} pendant ${trs(nz(e.fattours) || 1)} (les niveaux s'additionnent)`,
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
    `Bloque ${nz(e.nbbloque) > 1 ? `les ${nz(e.nbbloque)} premiers coups de ` : nz(e.nbbloque) > 0 ? 'le premier coup de ' : ''}la prochaine attaque de l'adversaire : ${nz(e.nbbloque) > 1 ? 'ils touchent' : nz(e.nbbloque) > 0 ? 'il touche' : 'elle touche'} sans faire de dégâts, mais ses statuts et ses marques (exécution, avalage) s'appliquent${riposteText(e)}`,
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
  malediction: (_, { T, ci }) => [
    `Maudit ${ci} : ${curseTxt} pendant ${trs(T)}, puis l'ATQ revient (chaque malédiction ajoute la sienne)`,
  ],
  saignement: (e, { T, ci }) => [`Fait saigner ${ci} : ${bleedTxt(e)}, ${trs(T)}`],
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
  fracture: (e, { T, ci }) => [`Fracture ${ci} (${fractureTxt(e)}, ${trs(T)})`],
  vol_ultime: () => ["Vole l'ultime de l'adversaire"],
  copie_ultime: () => [
    "Copie l'ultime de l'adversaire : il le garde, et cette carte peut aussi le lancer",
  ],
  poison_effet: (e, { T, ci }) => [`Empoisonne ${ci} : ${poisonTxt(e)} pendant ${trs(T)}`],
  brulure_effet: (e, { T, ci }) => [
    `Brûle ${ci} : ${burnTxt(e)} pendant ${trs(T)} (fait fondre la glace d'un niveau)`,
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
  atk_glas: attackEffect,
  atk_headshot: (e) => [
    'Attaque de base : ' + headshotText(e, isEmpty(e.chance) ? 100 : nz(e.chance)),
  ],
  ciblage: (e, { T }) => [
    `${isEmpty(e.chance) || nz(e.chance) >= 100 ? 'Prend' : nz(e.chance) + ' % de chances de prendre'} l'adversaire pour cible pendant ${trs(T)} : chacun de ses coups sur lui est un HEADSHOT (coup critique : ${critTxt})${e.consomme === 'non' ? '' : ' ; la marque saute au premier headshot'}`,
  ],
  brume: (e, { T }) => [
    `${isEmpty(e.chance) || nz(e.chance) >= 100 ? "S'entoure" : nz(e.chance) + " % de chances de s'entourer"} de brume pendant ${trs(T)} : les statuts négatifs reçus se dissipent. Brume relancée sur une carte déjà embrumée : vent tourné, le prochain statut est renvoyé à l'adversaire puis la brume se dissipe`,
  ],
  lien_parasite: (e) => [
    `Pose ${linksTxt(e)} sur l'adversaire pendant ${trs(nz(e.tours) || 3)} : ${linkPct(e)} % de ses soins ${linkEach(e)}reviennent à sa carte, qui partage les siens de la même façon (les liens se cumulent, 100 % au plus)`,
  ],
  reduc_degats: (e, { v, T, t }) => [
    `${isEmpty(e.chance) || nz(e.chance) >= 100 ? 'Réduit' : nz(e.chance) + ' % de chances de réduire'} chaque coup reçu de ${v}${e.u === 'pts' ? '' : ' %'} ${t > 0 ? `pendant ${trs(T)}` : "jusqu'à la fin du combat"}`,
  ],
  mue_forcee: (e) => [
    `${isEmpty(e.chance) || nz(e.chance) >= 100 ? 'Force' : nz(e.chance) + ' % de chances de forcer'} la mue ${e.cible === 'adversaire' ? "de l'adversaire" : 'de sa carte'}, tout de suite : statuts négatifs (étourdissement compris), marques d'exécution, ciblage et liens parasitaires retirés, mais la carte ${isEmpty(e.mueatq) && isEmpty(e.muepv) ? "perd les valeurs de son passif Mue (10 % d'ATQ et de PV max sans passif)" : moltLoss(e)}`,
  ],
  glas_effet: (e, { ci }) => [
    `Fait sonner le Glas pour ${ci} (${knellTxt(e)}) ; quand ses PV passent dessous, la mort l'emporte (pas d'évite la mort ni de réanimation ; 3 purifications pour l'effacer)`,
  ],
  enracinement: (e, { ci }) => [`Enracine ${ci} : ${rootTxt(e)}, ${trs(nz(e.tours) || 2)}`],
  atk_enracinement: attackEffect,
  contamination: (e, { ci }) => [`Contamine ${ci} : ${contaminationTxt}, ${trs(nz(e.tours) || 2)}`],
  atk_contamination: attackEffect,
  cisaillement: (e) => [shearTxt(e).replace(/^p/, 'P')],
  atk_cisaillement: attackEffect,
  atk_critique: attackEffect,
  marque_foudre: () => [lightningTxt.replace(/^p/, 'P')],
  atk_foudre: attackEffect,
  embrasement: () => [blazeTxt],
  fureur_incandescente: () => [`Donne à son combattant la ${furyTxt.replace(/^F/, 'f')}`],
  sangsue_toxique: (e) => [`${leechTxt}, ${trs(nz(e.tours) || 2)}`],
  injection_virulente: () => [injectionTxt],
  surcharge: () => [overloadTxt],
  brisure_volonte: () => [willBreakTxt],
  verrouillage_total: () => [
    "Verrouillage total : les 3 prochains coups de son combattant sur l'adversaire sont des headshots",
  ],
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
  adv_soigne: "quand l'adversaire est soigné",
  adv_statut: "quand l'adversaire reçoit un statut (brûlure, poison, gel, malédiction…)",
  adv_esquive: "quand l'adversaire esquive",
  adv_bloque: "quand l'adversaire bloque une attaque",
  inflige_coup_fort: 'quand il inflige au moins X dégâts en un coup',
  purifie: 'quand il est purifié',
  adv_purifie: "quand l'adversaire est purifié",
  evite_mort: 'quand il évite la mort',
  adv_evite_mort: "quand l'adversaire évite la mort",
  reanime: 'quand il est réanimé',
  adv_reanime: "quand l'adversaire est réanimé",
  atq_baisse: "quand son ATQ baisse (malédiction, fatigue, vol d'ATQ…)",
  adv_atq_baisse: "quand l'ATQ de l'adversaire baisse",
  pvmax_baisse: 'quand ses PV max baissent (calcination…)',
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

// A magic's timing (`magdebut`, `magduree`): from which of its turns it acts, for how long.
export function magicTiming(e: Fx | null | undefined): string {
  if (!e) return '';
  const from = nz(e.magdebut);
  const lasts = nz(e.magduree);
  return [
    from > 1 ? `Agit au début de son ${from}e tour` : '',
    lasts > 0 ? `dure ${trs(lasts)}, puis ses effets prennent fin` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

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
    const timing = magicTiming(c.effet);
    if (items.length)
      sections.push({
        kind: 'magic',
        title: 'Effet de la magie',
        ...(timing ? { meta: timing } : {}),
        items,
      });
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
