// Projection of domain events into the legacy combat journal: one line per event, with the exact
// French text (`txt`), the fields the OBS overlay animates from (`t`, `k`, `c`, `n`, `from`…), the
// round (`tour`) and the HP / max HP / ATQ snapshots of both cards. This file is the only place the
// journal wording lives. The iso run compares its output with the legacy engine's journal.
//
// The view is read only during the call (docs/adr/0001-un-moteur-des-evenements-une-projection.md, rule 3).

import type {
  Card,
  CombatView,
  DomainEvent,
  ProgrammedDraw,
  RandomEffectKey,
  RandomPassiveKey,
  StatusKind,
} from '@forestcard/engine';

export type JournalLine = {
  t: string;
  txt: string;
  tour: number;
  pv: number[];
  max: number[];
  atq: number[];
  [field: string]: unknown;
};

type Line = { t: string; txt: string; o?: Record<string, unknown> };

// Swallow marks (fork, then knife), written as escapes: the source stays emoji-free.
const FORK = '\u{1F374}';
const KNIFE = '\u{1F52A}';

const turns = (n: number) => `${n} tour${n > 1 ? 's' : ''}`;

const RANDOM_EFFECT_LABELS: Record<RandomEffectKey, string> = {
  atqUp: 'ATQ en hausse',
  atqDown: 'ATQ adverse en baisse',
  maxHpUp: 'PV max en hausse',
  maxHpDown: 'PV max adverse en baisse',
  heal: 'Soin',
  directDamage: 'Dégâts directs',
  lifeSteal: 'Vol de vie',
  attackCancelled: 'Attaque adverse annulée',
  doubleDamage: 'Dégâts doublés',
  reflect: 'Renvoi de dégâts',
  trapImmunity: 'Insensible aux pièges',
  delayedDamage: 'Dégâts différés',
  swapAtq: 'Échange des ATQ',
  swapHp: 'Échange des PV',
  swapAll: 'Échange ATQ et PV',
  swapAtqHp: 'ATQ et défense adverses échangés',
  poison: 'Poison',
  burn: 'Brûlure',
  stun: 'Étourdissement',
  curse: 'Malédiction',
  bleed: 'Saignement',
  breath: 'Souffle élémentaire',
  executionAttack: 'Exécution (attaque)',
  executionMarks: 'Exécution (marques)',
  transcendence: 'Transcendance',
  solidification: 'Solidification',
  frost: 'Gel',
  fracture: 'Fracture',
  fatigue: 'Fatigue adverse',
  rage: 'Rage',
  purification: 'Purification',
  regen: 'Régénération',
  dodgeUp: 'Esquive en hausse',
  stealUltimate: "Vol de l'ultime adverse",
  copyUltimate: "Copie de l'ultime adverse",
  resetUltimate: 'Ultime rechargé',
  cancelMagic: 'Magie adverse annulée',
  destroyMagic: 'Magie adverse détruite',
  destroyTrap: 'Piège adverse détruit',
  stealMagic: 'Magie adverse volée',
  stealTrap: 'Piège adverse volé',
  revive: 'Réanimation',
  attackBleed: 'Attaque de base : saignement',
  attackFrost: 'Attaque de base : gel',
  attackChain: 'Attaque de base : enchaînement',
};

const ATTACK_EFFECT_VERBS: Record<string, string> = {
  fatigue: 'fatiguer',
  enchainement: 'enchaîner les frappes',
  brulure: 'brûler',
  poison: 'empoisonner',
  etourdir: 'étourdir',
  saignement: 'faire saigner',
  malediction: 'maudire',
  fracture: 'fracturer',
  gel: 'geler',
};

// Explosion mark, written as an escape: the source stays emoji-free.
const BOOM = '\u{1F4A5}';
const EXPLODED: Record<'brulure' | 'poison' | 'saignement', string> = {
  brulure: 'La brûlure',
  poison: 'Le poison',
  saignement: 'Le saignement',
};
// Names of the random passive pool (legacy: poolPassifs), for a programming without a list.
const RANDOM_PASSIVE_LABELS: Record<RandomPassiveKey, string> = {
  dodge: 'Esquive',
  lifeSteal: 'Vol de vie',
  burn: 'Brûlure',
  poison: 'Poison',
  bleed: 'Saignement',
  curse: 'Malédiction',
  stun: 'Étourdissement',
  multiStrike: 'Multi-frappe',
  chain: 'Enchaînement',
  damageReduction: 'Réduction de dégâts',
  reflect: 'Renvoi de dégâts',
  regen: 'Régénération',
  atqRise: 'ATQ qui monte',
  detonation: 'Détonation',
};

// A programmed effect's name: the name of what was drawn (programming without a list), else its
// admin label, else its type with spaces (legacy: lib).
const programLabel = (label: unknown, effectType: unknown, drawn: ProgrammedDraw | undefined) =>
  drawn
    ? drawn.pool === 'passives'
      ? RANDOM_PASSIVE_LABELS[drawn.key]
      : RANDOM_EFFECT_LABELS[drawn.key]
    : String((label || String(effectType).replace(/_/g, ' ')) as string);

const BREATH_NAMES: Record<string, string> = {
  brulure: 'de feu',
  gel: 'de glace',
  malediction: 'maudit',
  poison: 'empoisonné',
  saignement: 'de sang',
  fatigue: "d'épuisement",
};

// Status end: [legacy key, sentence].
const STATUS_ENDED: Record<StatusKind, [string, (name: string) => string]> = {
  curse: ['malediction', (n) => `La malédiction de ${n} se termine`],
  bleed: ['saignement', (n) => `Le saignement de ${n} s'arrête`],
  poison: ['poison', (n) => `poison de ${n} se termine`],
  burn: ['brulure', (n) => `brûlure de ${n} se termine`],
  frost: ['gel', (n) => `${n} n'est plus gelé`],
  fracture: ['fracture', (n) => `La fracture de ${n} guérit`],
  stun: ['etourdi', (n) => `${n} n'est plus étourdi`],
  rage: ['rage', (n) => `La rage de ${n} retombe`],
  fatigue: ['fatigue', (n) => `La fatigue de ${n} se dissipe`],
  solid: ['solide', (n) => `${n} n'est plus solidifié`],
};

const DISPELLED_LABELS: Record<string, string> = {
  annule: "annulation d'attaque",
  brulure: 'brûlure',
  malediction: 'malédiction',
};

const leftCard = (c: Card | null | undefined) =>
  c && !c.vide ? { nom: c.nom, img: c.image || null } : null;

export function project(event: DomainEvent, view: CombatView): JournalLine | null {
  const sides = view.sides;
  const at = (i: number) => sides[i] as (typeof sides)[number];
  const name = (i: number) => at(i).fighter.nom;
  const pseudo = (i: number) => at(i).pseudo;
  const players = () =>
    sides.map((s) => ({
      pseudo: s.pseudo,
      dos: s.dos,
      carte: s.fighter.nom,
      image: s.fighter.image || null,
      imageCombat: s.fighter.imageCombat || null,
      rar: s.fighter.rar || null,
      magie: s.magic.nom,
      piege: s.trap.nom,
      magieImg: s.magic.image || null,
      piegeImg: s.trap.image || null,
      ids: [s.fighter.id, s.magic.id, s.trap.id],
    }));

  const line = toLine(event, { name, pseudo, at, players });
  if (!line) return null;
  return {
    t: line.t,
    txt: line.txt,
    ...line.o,
    tour: view.round,
    pv: sides.map((s) => s.hp),
    max: sides.map((s) => s.maxHp),
    atq: sides.map((s) => s.atq),
    // Only while a card has a rage or double damage running: [rage bonus, 1 if doubled else 0]
    // per card, for the live ATQ of the overlay (atq × 2 if doubled, + rage).
    ...(sides.some((s) => s.rage || s.doubled)
      ? { boost: sides.map((s) => [s.rage, s.doubled ? 1 : 0]) }
      : {}),
  };
}

type Lookups = {
  name: (i: number) => string;
  pseudo: (i: number) => string;
  at: (i: number) => CombatView['sides'][number];
  players: () => unknown[];
};

function toLine(e: DomainEvent, { name, pseudo, at, players }: Lookups): Line | null {
  switch (e.type) {
    // ── Combat flow ──
    case 'combatStarted':
      return {
        t: 'debut',
        txt: 'Le combat commence !',
        o: { joueurs: players(), premier: e.first, ...(e.team ? { equipe: e.team } : {}) },
      };
    case 'fighterEntered':
      return {
        t: 'relais',
        txt: `${pseudo(e.side)} envoie son combattant ${e.index}/${e.of} : ${name(e.side)} !`,
        o: { c: e.side, n: e.index, of: e.of, joueurs: players() },
      };
    case 'fighterExhausted':
      return {
        t: 'statut',
        txt: `${name(e.side)} s'effondre, à bout de forces !`,
        o: { c: e.side, k: 'epuise' },
      };
    case 'turnStarted':
      return { t: 'tour', txt: `Tour ${e.turn}`, o: { c: e.side } };
    case 'overtimeStarted':
      return {
        t: 'prolongation',
        txt: `Prolongation${e.period > 1 ? ' ' + e.period : ''} ! Chacun tire 3 nouvelles cartes`,
        o: { joueurs: players(), premier: e.first, manche: e.period },
      };
    case 'combatEnded':
      return {
        t: 'fin',
        txt: e.winner === null ? 'Match nul !' : `${pseudo(e.winner)} remporte le combat !`,
        o: { gagnant: e.winner, recompenses: e.rewards },
      };

    // ── Cards ──
    case 'magicRevealed': {
      const magic = at(e.side).magic;
      return {
        t: 'magie',
        txt: `Magie de ${pseudo(e.side)} : ${magic.nom}`,
        o: { c: e.side, carte: magic.nom, img: magic.image || null },
      };
    }
    case 'magicCancelled':
      return {
        t: 'statut',
        txt: `La magie de ${pseudo(e.side)} est annulée${e.turns ? ` (${turns(e.turns)})` : ''}`,
        o: { c: e.side, k: 'magie_annulee' },
      };
    case 'magicBack':
      return {
        t: 'statut',
        txt: `La magie de ${pseudo(e.side)} revient : ${at(e.side).magic.nom}`,
        o: { c: e.side, k: 'magie_retour' },
      };
    case 'magicDestroyed':
      return {
        t: 'vol',
        txt: `La magie de ${pseudo(e.side)} est détruite`,
        o: { c: e.side, k: 'magie_annulee' },
      };
    case 'trapFired': {
      const trap = at(e.side).trap;
      return {
        t: 'piege',
        txt: `Piège de ${pseudo(e.side)} : ${trap.nom} !`,
        o: { c: e.side, carte: trap.nom, img: trap.image || null },
      };
    }
    case 'trapNullified': {
      const trap = at(e.side).trap;
      return {
        t: 'piege',
        txt: `Le piège de ${pseudo(e.side)} se déclenche mais ${name(e.target)} est insensible${e.exhausted ? ' : piège épuisé' : ''}`,
        o: { c: e.side, k: 'bloque', carte: trap.nom, img: trap.image || null },
      };
    }
    case 'trapDestroyed': {
      const trap = at(e.side).trap;
      return {
        t: 'vol',
        txt: `Le piège de ${pseudo(e.side)} est détruit`,
        o: { c: e.side, k: 'piege_detruit', carte: trap.nom, img: trap.image || null },
      };
    }
    case 'trapRearmed':
      return {
        t: 'statut',
        txt: `Le piège de ${pseudo(e.side)} redevient actif`,
        o: { c: e.side, k: 'piege_rearme' },
      };
    case 'ultimateTriggered':
      return { t: 'ultime', txt: `ULTIME de ${name(e.side)} !`, o: { c: e.side } };
    case 'ultimateCopied':
      return {
        t: 'vol',
        txt: `${pseudo(e.side)} copie l'ultime de ${pseudo(e.from)}`,
        o: { k: 'copie_ultime', from: e.from, c: e.side },
      };
    case 'ultimateAlreadyHeld':
      return { t: 'statut', txt: `${name(e.side)} a déjà cet ultime` };
    case 'noUltimateToCopy':
      return { t: 'statut', txt: `${pseudo(e.side)} n'a aucun ultime à copier` };
    case 'ultimateStolen':
      return {
        t: 'vol',
        txt: `${pseudo(e.side)} vole l'ultime de ${pseudo(e.from)}`,
        o: { k: 'vol_ultime', from: e.from, c: e.side },
      };
    case 'noUltimateToSteal':
      return { t: 'statut', txt: `${pseudo(e.side)} n'a aucun ultime à voler` };
    case 'ultimateReset':
      return {
        t: 'statut',
        txt: `L'ultime de ${name(e.side)} est réinitialisé !`,
        o: { c: e.side },
      };
    case 'theftScheduled':
      return {
        t: 'statut',
        txt: `${name(e.side)} volera ${e.carte === 'piege' ? 'le piège' : 'la magie'} adverse au début de son tour ${e.turn}`,
        o: { c: e.side, k: 'vol_prevu' },
      };
    case 'magicStolen':
      return {
        t: 'vol',
        txt: `${pseudo(e.side)} vole la magie de ${pseudo(e.from)} : ${e.card.nom}${e.turns ? ` (${turns(e.turns)})` : ''}`,
        o: {
          c: e.side,
          k: 'vol_carte',
          from: e.from,
          to: e.side,
          de: 'magie',
          sur: e.slot,
          carte: e.card.nom,
          img: e.card.image || null,
          duree: e.turns,
        },
      };
    case 'trapStolen':
      return {
        t: 'vol',
        txt: `${pseudo(e.side)} vole le piège de ${pseudo(e.from)} : ${e.card.nom}${e.turns ? ` (${turns(e.turns)})` : ''}`,
        o: {
          c: e.side,
          k: 'vol_carte',
          from: e.from,
          to: e.side,
          de: 'piege',
          sur: 'piege',
          carte: e.card.nom,
          img: e.card.image || null,
          duree: e.turns,
        },
      };
    case 'magicReturned':
      return {
        t: 'vol',
        txt: `${e.ok ? 'La magie retourne à ' + pseudo(e.side) : 'La magie volée disparaît'} : ${e.card.nom}`,
        o: {
          c: e.side,
          k: 'vol_retour',
          from: e.from,
          to: e.side,
          de: e.slot,
          sur: 'magie',
          carte: e.card.nom,
          img: e.card.image || null,
          reste: leftCard(e.uncovered),
          ok: e.ok ? 1 : 0,
        },
      };
    case 'trapReturned':
      return {
        t: 'vol',
        txt: `${e.ok ? 'Le piège retourne à ' + pseudo(e.side) : 'Le piège volé disparaît'} : ${e.card.nom}`,
        o: {
          c: e.side,
          k: 'vol_retour',
          from: e.from,
          to: e.side,
          de: 'piege',
          sur: 'piege',
          carte: e.card.nom,
          img: e.card.image || null,
          reste: leftCard(e.uncovered),
          ok: e.ok ? 1 : 0,
          epuise: e.exhausted ? 1 : 0,
        },
      };
    case 'equipped':
      return { t: 'vol', txt: `${name(e.side)} équipe ${e.card.nom}` };
    case 'unknownEffect':
      return { t: 'inconnu', txt: `Effet non géré par le moteur : ${e.effectType}` };
    case 'randomEffectDrawn':
      return {
        t: 'statut',
        txt: `Effet aléatoire de ${name(e.side)} : ${RANDOM_EFFECT_LABELS[e.effect]} !`,
        o: { c: e.side, k: 'alea' },
      };

    // ── Attack ──
    case 'cannotAttack':
      switch (e.reason) {
        case 'mouthFull':
          return {
            t: 'statut',
            txt: `${name(e.side)} a la bouche pleine : il n'attaque pas`,
            o: { c: e.side, k: 'av_bloque' },
          };
        case 'swallowed':
          return {
            t: 'statut',
            txt: `${name(e.side)} est dans le ventre de ${name(e.swallower as number)} : il n'attaque pas`,
            o: { c: e.side, k: 'av_bloque' },
          };
        case 'digesting':
          return {
            t: 'statut',
            txt: `${name(e.side)} digère : il n'attaque pas`,
            o: { c: e.side, k: 'digere' },
          };
        case 'stunned':
          return {
            t: 'statut',
            txt: `${name(e.side)} est étourdi, il n'attaque pas`,
            o: { c: e.side, k: e.stillStunned ? 'etourdi_tour' : 'etourdi_fin' },
          };
        case 'frozen':
          return {
            t: 'statut',
            txt: `${name(e.side)} est gelé : son attaque est annulée !`,
            o: { c: e.side, k: 'gel_bloque' },
          };
        case 'paralysed':
          return {
            t: 'statut',
            txt: `${name(e.side)} est paralysé par le givre : il n'attaque pas !`,
            o: { c: e.side, k: 'gel_bloque' },
          };
      }
      return null;
    case 'attackCancelled':
      return { t: 'bloque', txt: `L'attaque de ${name(e.side)} est annulée`, o: { c: e.defender } };
    case 'attacked':
      return {
        t: 'attaque',
        txt: `${name(e.side)} attaque${e.strikes > 1 ? ` (${e.strikes} frappes)` : ''}`,
        o: { c: e.side },
      };
    case 'extraStrike':
      return {
        t: 'attaque',
        txt: `${name(e.side)} enchaîne une frappe de plus !`,
        o: { c: e.side, k: 'enchaine' },
      };
    case 'strike':
      return { t: 'frappe', txt: `Frappe ${e.index}/${e.of} de ${name(e.side)}`, o: { c: e.side } };
    case 'dodged':
      return { t: 'esquive', txt: `${name(e.side)} esquive !`, o: { c: e.side } };
    case 'damageReduced':
      return { t: 'bloque', txt: `${name(e.side)} bloque une partie des dégâts`, o: { c: e.side } };
    case 'nextAttackCancelled':
      return {
        t: 'statut',
        txt: `La prochaine attaque de ${name(e.side)} est annulée`,
        o: { c: e.side },
      };
    case 'nextAttackBlocked':
      return {
        t: 'statut',
        txt: `La prochaine attaque de ${name(e.side)} sera bloquée`,
        o: { c: e.side },
      };
    case 'attackBlocked':
      return { t: 'bloque', txt: `L'attaque de ${name(e.side)} est bloquée`, o: { c: e.defender } };
    case 'blockRiposte':
      return {
        t: 'statut',
        txt: `${name(e.side)} riposte au blocage${e.kind === 'renvoi' ? ' et renvoie les dégâts' : ''} !`,
        o: { c: e.side, k: 'riposte', cible: e.target, quoi: e.kind },
      };
    case 'damageDoubled':
      return { t: 'statut', txt: `${name(e.side)} double ses dégâts`, o: { c: e.side } };
    case 'counterPrepared':
      return {
        t: 'statut',
        txt: `${name(e.side)} prépare une contre-attaque renforcée`,
        o: { c: e.side, k: 'bonus' },
      };

    // ── Damage, healing, death ──
    case 'damaged': {
      if (e.amount === 0) return null; // nothing to show for 0 damage
      const n = e.amount;
      const c = e.side;
      switch (e.cause) {
        case 'direct':
          return { t: 'degats', txt: `${name(c)} subit ${n} dégâts directs`, o: { c, n } };
        case 'lifeSteal':
        case 'attack':
          return { t: 'degats', txt: `${name(c)} subit ${n} dégâts`, o: { c, n } };
        case 'breath':
          return {
            t: 'degats',
            txt: `${name(c)} subit ${n} dégâts (souffle)`,
            o: { c, n, k: 'souffle' },
          };
        case 'poison':
          return { t: 'degats', txt: `${name(c)} subit ${n} (poison)`, o: { c, n, k: 'poison' } };
        case 'burn':
          return { t: 'degats', txt: `${name(c)} subit ${n} (brûlure)`, o: { c, n, k: 'brûlure' } };
        case 'bleed':
          return {
            t: 'degats',
            txt: `${name(c)} subit ${n} (saignement)`,
            o: { c, n, k: 'saignement' },
          };
        case 'selfFracture':
          return {
            t: 'degats',
            txt: `${name(c)} se blesse en attaquant (fracture) : ${n} dégâts`,
            o: { c, n, k: 'fracture' },
          };
        case 'reflect':
          return {
            t: 'degats',
            txt: `${name(c)} subit ${n} dégâts renvoyés`,
            o: { c, n, k: 'renvoi', from: e.from },
          };
        case 'execution':
          return {
            t: 'degats',
            txt: `${name(c)} subit ${n} dégâts (exécution)`,
            o: { c, n, k: 'execution' },
          };
        case 'detonation':
          return {
            t: 'degats',
            txt: `${name(c)} subit ${n} dégâts (détonation)`,
            o: { c, n, k: 'detonation' },
          };
        case 'missile':
          return {
            t: 'degats',
            txt: `${name(c)} subit ${n} dégâts (missile)`,
            o: { c, n, k: 'detonation' },
          };
        case 'blast':
          return {
            t: 'degats',
            txt: `${name(c)} subit ${n} dégâts (souffle de l'explosion)`,
            o: { c, n, k: 'detonation' },
          };
        case 'missileReturned':
          return {
            t: 'degats',
            txt: `${name(c)} subit ${n} dégâts (missile renvoyé)`,
            o: { c, n, k: 'detonation' },
          };
        case 'chew':
          return {
            t: 'degats',
            txt: `${name(e.by as number)} mâche ${name(c)} : ${n} dégâts${e.single ? '' : ` (${e.bite}/${e.bites})`}`,
            o: { c, n, k: 'mache', by: e.by },
          };
        case 'delayed':
          return { t: 'degats', txt: `${name(c)} subit ${n} (dégâts différés)`, o: { c, n } };
      }
      return null;
    }
    case 'healed':
      return {
        t: 'soin',
        txt: `${name(e.side)} récupère ${e.amount} PV`,
        o: { c: e.side, n: e.amount, k: e.revive ? 'revive' : undefined },
      };
    case 'deathAvoided': {
      const how = { magic: '(1 PV)', passive: '(passif)', trap: '(piège)' }[e.source];
      return { t: 'protege', txt: `${name(e.side)} évite la mort ${how} !`, o: { c: e.side } };
    }
    case 'avoidDeathGranted':
      return {
        t: 'statut',
        txt: `${name(e.side)} est protégé : il évitera la mort une fois`,
        o: { c: e.side },
      };
    case 'reviveGranted':
      return {
        t: 'statut',
        txt: `${name(e.side)} sera réanimé s'il meurt (${e.pct} % des PV max)`,
        o: { c: e.side, rp: 1 },
      };
    case 'shattered':
      return { t: 'reanim_mort', txt: `${name(e.side)} est détruit !`, o: { c: e.side } };
    case 'revived':
      return {
        t: 'reanim',
        txt: `${name(e.side)} est réanimé avec ${e.hp} PV (${e.pct} %) !`,
        o: { c: e.side, n: e.hp, k: 'reanim' },
      };
    case 'reviveDenied':
      return {
        t: 'statut',
        txt: `${name(e.side)} est réduit en cendres : pas de réanimation !`,
        o: { c: e.side, k: 'anti_rea' },
      };

    // ── Stats ──
    case 'statChanged': {
      const d = e.delta;
      if (d === 0) return null; // nothing to show for an unchanged stat
      const label = e.stat === 'atq' ? 'ATQ' : 'PV max';
      const who = `${label} de ${name(e.side)}`;
      const mod = { c: e.side, k: 'mod', s: label, d };
      switch (e.cause) {
        case 'effect':
          return { t: 'stat', txt: `${who} ${d >= 0 ? '+' : ''}${d}`, o: mod };
        case 'growth':
        case 'transcendence':
          return { t: 'stat', txt: `${who} +${d}`, o: mod };
        case 'fatigue':
          return { t: 'stat', txt: `${who} −${-d} (fatigue)`, o: mod };
        case 'fatigueRemoved':
          return { t: 'stat', txt: `${who} +${d} (fatigue retirée)`, o: mod };
        case 'fatigueEnded':
          return { t: 'stat', txt: `${who} +${d} (fatigue dissipée)`, o: mod };
        case 'fatigueLifted':
          return { t: 'stat', txt: `${who} +${d} (fatigue levée)`, o: mod };
        case 'curseTick':
          return {
            t: 'stat',
            txt: `${who} −${-d} (malédiction)`,
            o: { ...mod, k: 'malediction_tick' },
          };
        case 'curseFading':
          return { t: 'stat', txt: `${who} +${d} (la malédiction s'estompe)`, o: mod };
        case 'curseLifted':
          return { t: 'stat', txt: `${who} +${d} (malédiction levée)`, o: mod };
        case 'statusesLeft':
          return { t: 'stat', txt: `${who} +${d} (statuts partis)`, o: mod };
      }
      return null;
    }
    case 'dodgeChanged': {
      const d = e.delta;
      if (d === 0) return null;
      return {
        t: 'stat',
        txt: `Esquive de ${name(e.side)} ${d >= 0 ? '+' : ''}${d} %`,
        o: { c: e.side, k: 'esq', d },
      };
    }
    case 'statsSwapped': {
      const [txt, col] = {
        atq: ['échangent leur ATQ', 'bleu'],
        hp: ['échangent leurs PV', 'rouge'],
        all: ['échangent ATQ et PV', 'mixte'],
      }[e.what];
      return {
        t: 'stat',
        txt: `${name(e.side)} et ${name(e.with)} ${txt}`,
        o: { k: 'echange', cs: [e.side, e.with], col },
      };
    }
    case 'attackAndHpSwapped':
      return {
        t: 'stat',
        txt: `${name(e.side)} : ATQ et PV échangés`,
        o: { k: 'echange', c: e.side },
      };

    // ── Statuses ──
    case 'statusEnded': {
      const [k, sentence] = STATUS_ENDED[e.status];
      return { t: 'finstatut', txt: sentence(name(e.side)), o: { c: e.side, k } };
    }
    case 'statusDispelled':
      return {
        t: 'finstatut',
        txt: `${DISPELLED_LABELS[e.status] || e.status} dissipé${e.status === 'annule' ? 'e' : ''}`,
        o: { c: e.side, k: e.status === 'annule' ? 'etourdi' : e.status },
      };
    case 'purified': {
      const detail = e.removedSomething
        ? e.stunned
          ? " (sauf l'étourdissement)"
          : ''
        : e.stunned
          ? " (l'étourdissement reste)"
          : ' (rien à retirer)';
      return {
        t: 'statut',
        txt: `${name(e.side)} est purifié${detail} !`,
        o: { c: e.side, k: 'purif' },
      };
    }
    case 'rageStarted':
      return {
        t: 'statut',
        txt: `${name(e.side)} entre en rage ! (+${e.bonus} dégâts par coup, ${turns(e.turns)})`,
        o: { c: e.side, k: 'rage' },
      };
    case 'regenStarted':
      return {
        t: 'statut',
        txt: `${name(e.side)} se régénère (+${e.amount} PV par tour, ${turns(e.turns)})`,
        o: { c: e.side, k: 'regen' },
      };
    case 'regenEnded':
      return { t: 'statut', txt: `La régénération de ${name(e.side)} se termine` };
    case 'curseApplied':
      return {
        t: 'statut',
        txt: `${name(e.side)} est maudit${e.stacked ? ' à nouveau' : ''} (ATQ −${e.amount} par tour, ${turns(e.turns)}) !`,
        o: { c: e.side, k: 'malediction' },
      };
    case 'bleedApplied':
      return {
        t: 'statut',
        txt: `${name(e.side)} saigne${e.stacked ? ' encore plus' : ''} (${e.pct} % des PV max par tour, soins −${e.healReduction} %, ${turns(e.turns)}) !`,
        o: { c: e.side, k: 'saignement' },
      };
    case 'dotApplied':
      return {
        t: 'statut',
        txt: `${name(e.side)} ${e.kind === 'poison' ? 'est empoisonné' : 'brûle'}${e.stacked ? ' encore plus fort' : ''} !`,
        o: { c: e.side, k: e.kind === 'poison' ? 'poison' : 'brulure' },
      };
    case 'fatigueApplied':
      return {
        t: 'statut',
        txt: `${name(e.side)} est fatigué${e.stacked ? ' plus longtemps' : ''} (ATQ −${e.amount}, ${turns(e.turns)})${e.afterRage ? ' après la rage' : ''} !`,
        o: { c: e.side, k: 'fatigue' },
      };
    case 'frozen':
      return {
        t: 'statut',
        txt: `${name(e.side)} est gelé (${e.cancelChance} % d'attaque annulée, ${e.stunChance} % d'être étourdi, ${turns(e.turns)}) !`,
        o: { c: e.side, k: 'gel' },
      };
    case 'fractured':
      return {
        t: 'statut',
        txt: `${name(e.side)} est fracturé (${e.chance} % de se blesser en attaquant, −${e.damage} PV, ${turns(e.turns)}) !`,
        o: { c: e.side, k: 'fracture' },
      };
    case 'solidified':
      return {
        t: 'statut',
        txt: `${name(e.side)} se solidifie (${turns(e.turns)}) : insensible à l'étourdissement`,
        o: { c: e.side, k: 'solide' },
      };
    case 'solidBroken':
      return {
        t: 'statut',
        txt: `La solidification de ${name(e.side)} se brise !`,
        o: { c: e.side, k: 'solide_brise' },
      };
    case 'stunned':
      return {
        t: 'statut',
        txt:
          e.by === 'effect'
            ? `${name(e.side)} est étourdi (${turns(e.turns)}) !`
            : `${name(e.side)} est étourdi${e.turns > 1 ? ` (${e.turns} tours)` : ''} !`,
        o: { c: e.side, k: 'etourdi' },
      };
    case 'stunResisted':
      return {
        t: 'statut',
        txt: `${name(e.side)} résiste à l'étourdissement (${e.chance} % de chances${e.attempts > 1 ? ', ' + e.attempts + ' tentatives' : ''})`,
        o: { c: e.side },
      };
    case 'stunBlockedBySolid':
      return {
        t: 'statut',
        txt: `${name(e.side)} est solidifié : l'étourdissement n'a aucun effet`,
        o: { c: e.side, k: 'solide_bloque' },
      };
    case 'breathed':
      return {
        t: 'souffle',
        txt: `${name(e.side)} crache un souffle ${BREATH_NAMES[e.element]}${e.index > 1 ? ` (souffle n°${e.index})` : ''} !`,
        o: { c: e.target, from: e.side, el: e.element, ...(e.index > 1 ? { n: e.index } : {}) },
      };
    case 'breathDodged':
      return { t: 'esquive', txt: `${name(e.side)} esquive le souffle !`, o: { c: e.side } };
    case 'breathBlocked':
      return { t: 'bloque', txt: `Le souffle de ${name(e.by)} est bloqué`, o: { c: e.side } };

    // ── Missiles and detonation ──
    case 'missileFired':
      return e.returned
        ? {
            t: 'missile',
            txt: `${name(e.from)} renvoie le missile !`,
            o: { c: e.side, from: e.from, n: e.index, tot: e.of, retour: 1 },
          }
        : {
            t: 'missile',
            txt: `${name(e.from)} tire un missile${e.of > 1 ? ` (${e.index}/${e.of})` : ''} !`,
            o: { c: e.side, from: e.from, n: e.index, tot: e.of },
          };
    case 'missileDodged':
      return {
        t: 'esquive',
        txt: `${name(e.side)} esquive le missile : il explose à côté !`,
        o: { c: e.side, k: 'missile_esq' },
      };
    case 'missileBlocked':
      return { t: 'bloque', txt: `Le missile de ${name(e.by)} est bloqué`, o: { c: e.side } };
    case 'detonated': {
      const o = { c: e.side, from: e.from, parts: e.parts };
      switch (e.explosion) {
        case 'detonation':
          return { t: 'detonation', txt: `${BOOM} DÉTONATION sur ${name(e.side)} !`, o };
        case 'missile':
          return {
            t: 'detonation',
            txt: `${BOOM} Le missile explose sur ${name(e.side)} !`,
            o: { ...o, mis: 1 },
          };
        case 'missileBeside':
          return {
            t: 'detonation',
            txt: `${BOOM} Le missile explose à côté de ${name(e.side)} !`,
            o: { ...o, mis: 1, esq: 1 },
          };
        case 'missileReturned':
          return {
            t: 'detonation',
            txt: `${BOOM} Le missile renvoyé explose sur ${name(e.side)} !`,
            o: { ...o, mis: 1 },
          };
      }
      return null;
    }
    case 'statusExploded':
      return {
        t: 'finstatut',
        txt: `${EXPLODED[e.status]} de ${name(e.side)} explose`,
        o: { c: e.side, k: e.status },
      };
    case 'detonationEmpty':
      return {
        t: 'statut',
        txt: `${name(e.side)} n'a aucun statut à faire exploser`,
        o: { c: e.side, k: 'deto_rien' },
      };
    case 'detonationDampened':
      return {
        t: 'statut',
        txt: `${name(e.side)} est solidifié : la détonation est amortie de moitié`,
        o: { c: e.side, k: 'solide_bloque' },
      };
    case 'breathResisted':
      return {
        t: 'statut',
        txt: `${name(e.side)} résiste au souffle (${e.chance} % de chances)`,
        o: { c: e.side },
      };

    // ── Attack effects ──
    case 'attackEffectGranted':
      return {
        t: 'statut',
        txt: `L'attaque de ${name(e.side)} peut maintenant ${ATTACK_EFFECT_VERBS[e.effect]} (${e.chance} %)`,
      };
    case 'executionPrepared':
      return {
        t: 'statut',
        txt: `L'attaque de ${name(e.side)} peut maintenant marquer la cible (${e.chance} %)`,
        o: { c: e.side, k: 'exec_prep' },
      };
    case 'markReceived':
      return {
        t: 'statut',
        txt: `${name(e.side)} reçoit une marque d'exécution (${e.marks}/3)`,
        o: { c: e.side, k: 'marque', n: e.marks },
      };
    case 'marksLost':
      return {
        t: 'finstatut',
        txt: `${name(e.side)} perd ${e.count} marque${e.count > 1 ? 's' : ''} d'exécution (${e.marks}/3)`,
        o: { c: e.side, k: 'marque', n: e.marks },
      };
    case 'executed':
      return {
        t: 'statut',
        txt: `${name(e.side)} est EXÉCUTÉ !`,
        o: { c: e.side, k: 'execution' },
      };

    // ── Swallowing ──
    case 'swallowPrepared':
      return {
        t: 'statut',
        txt: `L'attaque de ${name(e.side)} peut maintenant préparer un avalage`,
        o: { c: e.side, k: 'aval_prep' },
      };
    case 'swallowMarkReceived':
      return {
        t: 'statut',
        txt: `${name(e.side)} reçoit ${e.marks === 1 ? `la fourchette ${FORK}` : `le couteau ${KNIFE}`} (avalage ${e.marks}/2)`,
        o: { c: e.side, k: 'av_marque', n: e.marks },
      };
    case 'swallowFailed':
      return {
        t: 'statut',
        txt: `${name(e.side)} n'a pas assez de PV pour avaler ${name(e.target)} (il faut ${e.ratio} × son ATQ) : les marques tombent`,
        o: { c: e.target, k: 'av_rate' },
      };
    case 'swallowed':
      return {
        t: 'statut',
        txt: `${name(e.side)} AVALE ${name(e.target)} !`,
        o: { c: e.side, k: 'avale', cible: e.target },
      };
    case 'statusesTransferred':
      return {
        t: 'statut',
        txt: `Les statuts de ${name(e.from)} passent à ${name(e.side)}, plus forts (×1,5) !`,
        o: { c: e.side, k: 'av_transfert', from: e.from, ks: e.kinds },
      };
    case 'statusLostToSwallower':
      return {
        t: 'finstatut',
        txt: `${name(e.side)} perd son statut (${e.status})`,
        o: { c: e.side, k: e.status },
      };
    case 'spatOut':
      return {
        t: 'statut',
        txt: `${name(e.side)} recrache ${name(e.target)} !`,
        o: { c: e.side, k: 'recrache', cible: e.target },
      };
    case 'digestionStarted':
      return {
        t: 'statut',
        txt: `${name(e.side)} digère : il n'attaquera pas pendant ${turns(e.turns)}`,
        o: { c: e.side, k: 'digere_debut' },
      };

    // ── Transcendence ──
    case 'transcendenceArmed':
      return {
        t: 'statut',
        txt: `${name(e.side)} porte la Transcendance : elle transcendera au début de son tour ${e.turn}`,
        o: { c: e.side, k: 'transc_prep' },
      };
    case 'transcendenceLost':
      return {
        t: 'finstatut',
        txt: `${name(e.side)} perd la Transcendance`,
        o: { c: e.side, k: 'transc_prep' },
      };
    // ── Programming ──
    case 'programmed':
      return {
        t: 'statut',
        txt: `${name(e.side)} se programme : ${e.what === 'p' ? 'passif' : 'ultime'} « ${programLabel(e.label, e.effectType, e.drawn)} » (en attente)`,
        o: { c: e.side, k: 'prog', quoi: e.what },
      };
    case 'programmingActivated':
      return {
        t: 'statut',
        txt: `${name(e.side)} : PROGRAMMATION ACTIVE !`,
        o: { c: e.side, k: 'prog_act' },
      };
    case 'programmedPassivesAwake': {
      const n = e.count;
      return {
        t: 'statut',
        txt: `${n} passif${n > 1 ? 's' : ''} programmé${n > 1 ? 's' : ''} de ${name(e.side)} ${n > 1 ? "s'activent" : "s'active"}`,
        o: { c: e.side, k: 'prog_on' },
      };
    }
    case 'programmedUltimate':
      return {
        t: 'ultime',
        txt: `ULTIME programmé de ${name(e.side)} : ${programLabel(e.label, e.effectType, e.drawn)} !`,
        o: { c: e.side },
      };

    case 'transcended':
      return {
        t: 'statut',
        txt: `${name(e.side)} TRANSCENDE (niveau ${['I', 'II', 'III'][e.level - 1]}) : vol de vie ${e.lifeSteal} %`,
        o: { c: e.side, k: 'transc', niv: e.level },
      };
  }
}
