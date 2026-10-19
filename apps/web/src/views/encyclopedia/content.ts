// The encyclopedia's texts: the effects and the rarities, taken from the author's "Comment jouer"
// (legacy index.html, vRegles: "Des effets partout", "Raretés & collections"). Corrections of
// these texts go here.

import type { RuleEffect } from './effects';
import type { RarityBadge } from './rarities';

// Each effect, the engine types behind it, its animation in the preview. An effect's id in the
// address is its first type.
export type EffectGroup = { title: string; intro?: string; effects: RuleEffect[] };

export const EFFECT_GROUPS: EffectGroup[] = [
  {
    title: 'Statuts',
    effects: [
      { label: 'Poison', types: ['poison', 'poison_effet'], target: 'opponent', preview: 'poison' },
      {
        label: 'Brûlure',
        types: ['brulure', 'brulure_effet'],
        target: 'opponent',
        preview: 'brulure',
      },
      { label: 'Saignement', types: ['saignement'], target: 'opponent', preview: 'saignement' },
      { label: 'Gel', types: ['gel'], target: 'opponent', preview: 'gel' },
      { label: 'Fracture', types: ['fracture'], target: 'opponent', preview: 'fracture' },
      { label: 'Malédiction', types: ['malediction'], target: 'opponent', preview: 'malediction' },
      {
        label: 'Étourdissement',
        types: ['etourdir', 'etourdir_effet'],
        target: 'opponent',
        preview: 'etourdi',
      },
      { label: 'Rage', types: ['rage'], target: 'self', preview: 'rage' },
      { label: 'Fatigue', types: ['fatigue'], target: 'opponent', preview: 'fatigue' },
    ],
  },
  {
    title: 'Défense',
    effects: [
      { label: 'Esquive', types: ['esquive', 'esquive_mod'], target: 'self', preview: 'esquive' },
      { label: 'Blocage', types: ['reduc_degats'], target: 'self', preview: 'blocage' },
      { label: 'Renvoi de dégâts', types: ['renvoi'], target: 'self', preview: 'renvoi' },
      {
        label: 'Soin',
        types: ['soin', 'soin_tour', 'soin_tours'],
        target: 'self',
        preview: 'soin',
      },
      { label: 'Purification', types: ['purification'], target: 'self', preview: 'purification' },
      {
        label: 'Évite la mort',
        types: ['evite_mort', 'mort_evitee'],
        target: 'self',
        preview: 'evite_mort',
      },
      { label: 'Réanimation', types: ['reanimation'], target: 'self', preview: 'reanimation' },
    ],
  },
  {
    title: 'Attaque',
    effects: [
      {
        label: 'Enchaînement de frappes',
        types: ['enchainement', 'multi_frappe'],
        target: 'opponent',
      },
      { label: 'Vol de vie', types: ['vol_vie', 'vol_pct_atq'], target: 'both' },
      {
        label: "Vol d'ultime",
        types: ['vol_ultime', 'copie_ultime'],
        target: 'self',
        preview: 'vol_ultime',
      },
      { label: 'Vol de magie ou de piège', types: ['voler'], target: 'self' },
      {
        label: "Échange d'ATQ et de PV",
        types: ['echange_atq', 'echange_pv', 'echange_tout', 'echange_atq_def'],
        target: 'both',
        preview: 'echange',
      },
      {
        label: 'Exécution',
        types: ['execution', 'execution_direct'],
        target: 'opponent',
        preview: 'execution',
      },
      {
        label: 'Avalage',
        types: ['avalage', 'atk_avalage', 'marque_avalage'],
        target: 'opponent',
        preview: 'avalage',
      },
      { label: 'Effets aléatoires', types: ['aleatoire'], target: 'both' },
    ],
  },
  {
    title: 'Transcendance',
    intro:
      "Tous les X tours, au début de son tour et avant d'attaquer, la carte monte d'un niveau (jusqu'à 3) : elle est purifiée, gagne de l'ATQ et des PV max, et ses coups purifient l'adversaire et volent de la vie (de plus en plus à chaque niveau).",
    effects: [
      {
        label: 'Transcendance',
        types: ['transcendance'],
        target: 'self',
        preview: 'transcendance',
      },
    ],
  },
];

// Every effect the encyclopedia shows (checked against the preview's animations).
export const RULE_EFFECTS = EFFECT_GROUPS.flatMap((g) => g.effects);
export const effectId = (e: RuleEffect): string => e.types[0] ?? e.label;

// How statuses play out, under the effects.
export const STATUS_RULES = [
  "Les effets suivent le tour de la carte concernée : la malédiction baisse l'ATQ au début de son tour, juste avant son attaque ; poison, brûlure et saignement font effet à la fin de son tour, juste après son attaque. Jouer en premier ou en deuxième ne change jamais cet ordre.",
  "Un statut garde la même intensité à chaque tour. Si un effet le réapplique par-dessus, l'intensité s'additionne et la durée repart de zéro.",
  "La purification retire tous les statuts négatifs présents à ce moment-là, sauf l'étourdissement : il fait toujours sauter la prochaine attaque de la carte touchée, quoi qu'il arrive.",
  'Rage, fatigue, gel et fracture comptent les tours de la carte touchée.',
  "La fatigue fait vraiment baisser l'ATQ de la carte touchée (rendue à la fin) ; réappliquée, elle dure plus longtemps mais ne s'aggrave pas.",
];

// The rarities, in the colours of the legacy page.
export const RARITIES: RarityBadge[] = [
  { label: 'Commun', tier: 'commun', background: '#9ca3af' },
  { label: 'Rare', tier: 'rare', background: '#60a5fa' },
  { label: 'Épique', tier: 'epique', background: '#c084fc' },
  { label: 'Légendaire', tier: 'legendaire', background: '#fbbf24' },
  {
    label: 'GGEZ',
    tier: 'ggez',
    background: 'linear-gradient(90deg,#f87171,#fbbf24,#4ade80,#60a5fa,#c084fc)',
  },
];

export const RARITY_INTRO = 'Plus une carte est rare, plus elle est difficile à obtenir.';

export const RARITY_NOTES: { title: string; body: string }[] = [
  {
    title: 'Les collections',
    body: "Plusieurs collections (Horreurs, Chasseurs et d'autres), chacune avec ses boosters. Les cartes communes peuvent sortir dans tous les boosters, quelle que soit leur collection.",
  },
  {
    title: 'Versions alternatives',
    body: 'Certaines cartes existent en version « full art » : le même effet, un visuel encore plus beau à exhiber.',
  },
  {
    title: 'GGEZ',
    body: 'La rareté ultime, au-dessus du légendaire, avec son aura arc-en-ciel.',
  },
];
