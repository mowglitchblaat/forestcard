// Every status of the engine (StatusKind, packages/engine) and how a combat shows it: a status the engine
// gains without its effect here does not compile. The transcendence is not a status of the engine (its
// own mechanic: transcendenceArmed, transcended, transcendenceLost), but it shows as one: a lasting
// light that transforms the picture, chained and shared with the others. So do the lasting states of the
// mechanics that change what a card is made of while they run (LASTING: mist, roots, mutation, molt,
// electric charges, a card under control): status/shaders-more.ts.

import type { StatusKind } from '@forestcard/engine';
import { defineStatusFx, type StatusFxDef } from './define.ts';
import {
  BLEED,
  BURN,
  CURSE,
  DIVINE,
  FRACTURE,
  FROST,
  KNELL,
  POISON,
  RAGE,
  STONE,
  STUN,
  TIRED,
} from './shaders.ts';
import {
  CONTAMINATION,
  GAG,
  MIST,
  MOLT,
  MUTATION,
  PUPPET,
  ROOTS,
  VOLT,
  WEAKNESS,
} from './shaders-more.ts';
import { CHARM, SKIN } from './shaders-contact.ts';

// The lasting states shown like a status, though the engine does not call them statuses.
// skin: a skin worn (mechanics/skin.ts), its level the skin's kind (1 lava … 7 electric).
export type LastingKind = 'mist' | 'roots' | 'mutation' | 'molt' | 'volt' | 'puppet' | 'skin';
export type StatusFxKind = StatusKind | 'transcendence' | LastingKind;

export const STATUS_FX: Readonly<Record<StatusFxKind, StatusFxDef>> = {
  curse: defineStatusFx({
    shader: CURSE,
    acts: 'stat malediction_tick: the curse takes ATQ away',
    layer: 'cover',
  }),
  bleed: defineStatusFx({
    shader: BLEED,
    acts: 'degats, cause bleed: the bleed deals its damage',
    layer: 'cover',
  }),
  poison: defineStatusFx({
    shader: POISON,
    acts: 'degats, cause poison: the poison deals its damage',
    layer: 'detail',
  }),
  burn: defineStatusFx({
    shader: BURN,
    acts: 'degats, cause burn: the burn deals its damage',
    layer: 'detail',
  }),
  frost: defineStatusFx({
    shader: FROST,
    acts: 'statut gel_bloque: the frost cancels an attack',
    layer: 'cover',
  }),
  knell: defineStatusFx({
    shader: KNELL,
    acts: 'the Knell moves on (its shadow advances)',
    layer: 'cover',
  }),
  fracture: defineStatusFx({
    shader: FRACTURE,
    acts: 'the fracture deals its damage on a hit',
    layer: 'detail',
  }),
  stun: defineStatusFx({
    shader: STUN,
    acts: 'statut etourdi_tour: the stun skips a turn',
    layer: 'detail',
  }),
  rage: defineStatusFx({
    shader: RAGE,
    acts: 'each hit of its bearer (field boost)',
    layer: 'cover',
  }),
  fatigue: defineStatusFx({ shader: TIRED, acts: null, layer: 'cover' }),
  transcendence: defineStatusFx({
    shader: DIVINE,
    acts: 'transcended: the transcendence passes a level',
    layer: 'cover',
  }),
  solid: defineStatusFx({
    shader: STONE,
    acts: 'statut solide_bloque: the stone blocks an attack or a stun',
    layer: 'cover',
  }),
  contamination: defineStatusFx({
    shader: CONTAMINATION,
    acts: 'statut contamination: laid again, it prolongs the statuses',
    layer: 'cover',
  }),
  weakness: defineStatusFx({
    shader: WEAKNESS,
    acts: 'statut faiblesse: the weakness takes its share of a blow',
    layer: 'cover',
  }),
  gag: defineStatusFx({
    shader: GAG,
    acts: 'degats, cause gag: a gag lands (hammer, TNT, banana peel, anvil)',
    layer: 'detail',
  }),
  mist: defineStatusFx({
    shader: MIST,
    acts: 'statut brume_bloque / brume_renvoi: the mist stops or sends back a status',
    layer: 'cover',
  }),
  roots: defineStatusFx({
    shader: ROOTS,
    acts: 'statut enracinement: the roots hold the card',
    layer: 'detail',
  }),
  mutation: defineStatusFx({
    shader: MUTATION,
    acts: 'statut mutation: the mutation passes a level',
    layer: 'cover',
  }),
  molt: defineStatusFx({
    shader: MOLT,
    acts: 'statut mue: the molt is done (statuses and marks shed)',
    layer: 'cover',
  }),
  volt: defineStatusFx({
    shader: VOLT,
    acts: 'statut decharge / surcharge: the charges discharge',
    layer: 'detail',
  }),
  charm: defineStatusFx({
    shader: CHARM,
    acts: 'statut charme_coup: the charmed card holds back a blow',
    layer: 'cover',
  }),
  skin: defineStatusFx({
    shader: SKIN,
    acts: 'statut peau_contact: someone touched the skin',
    layer: 'detail',
  }),
  puppet: defineStatusFx({
    shader: PUPPET,
    acts: 'statut fils_cout: the puppeteer pays to hold the card',
    layer: 'cover',
  }),
};

// The name of each status, as the bench and the journal say it.
export const STATUS_LABELS: Readonly<Record<StatusFxKind, string>> = {
  curse: 'Malédiction',
  bleed: 'Saignement',
  poison: 'Poison',
  burn: 'Brûlure',
  frost: 'Gel',
  knell: 'Le Glas',
  fracture: 'Fracture',
  stun: 'Étourdissement',
  rage: 'Rage',
  fatigue: 'Fatigue',
  solid: 'Solidification',
  transcendence: 'Transcendance',
  contamination: 'Contamination',
  weakness: 'Faiblesse',
  gag: 'Gag',
  mist: 'Brume',
  roots: 'Enracinement',
  mutation: 'Mutation insecte',
  molt: 'Mue',
  volt: 'Charges électriques',
  puppet: 'Sous contrôle (fils)',
  charm: 'Charme',
  skin: 'Peau',
};
