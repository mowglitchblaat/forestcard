// The booster message, as the legacy overlay receives it (apps/overlay-boosters/src/overlay.html):
// ouvrir_booster's result, sent by Streamer.bot in live (WebSocket, General.Custom) or by the site with
// postMessage (?site, the "Jouer" tab while the game is paused). The draw happens on the server; the
// overlay only shows it.
//
//   { pseudo, booster, image_path?, cartes: [{ carte, couleur, image }] }
//
// It carries a card's name, its rarity colour and its flattened image: enough for a flat face, not for a
// built one. The ENRICHED message (proposed to the author) adds, per card, what building it needs, in the
// database's own keys:
//
//   { carte, couleur, image,                       the legacy fields, unchanged
//     id, rarete, type, atq, pv,                   cartes, raretes.nom
//     passif, ultime, effet,                       cartes: the plaque's lines (@forestcard/describe)
//     dessin_path, compo,                          variantes_carte: the drawing alone, the composer's settings
//     cadres }                                     the frame set of the version (FRAME_SETS), standard by default
//
// Every added field is optional and checked: a card is built when it has a known type and a drawing,
// flat otherwise. A legacy message stays a valid enriched one, all flat.

import { fxCond, fxTrigUlt, plaqueLinesExplained } from '@forestcard/describe';
import {
  isFrameSetName,
  type CardType,
  type Compo,
  type FrameSetName,
  type Tier,
} from '@forestcard/layout';
import type { CardData } from '../card/card.ts';
import { RARITIES } from '../config/rarities.ts';
import type { BoosterEvent } from '../scenes/booster.ts';

export type BoosterMessageCard = {
  carte: string; // the card's name
  couleur?: string | null; // its rarity colour (raretes.couleur)
  image?: string | null; // its version's flattened image (variantes_carte.image_path)
  // enriched
  id?: number | null;
  rarete?: string | null; // raretes.nom: wins over the colour
  type?: CardType | null;
  atq?: number | null;
  pv?: number | null;
  passif?: Record<string, unknown> | null;
  ultime?: Record<string, unknown> | null;
  effet?: Record<string, unknown> | null;
  dessin_path?: string | null;
  compo?: Partial<Compo> | null;
  cadres?: FrameSetName | null;
};

export type BoosterMessage = {
  pseudo: string;
  booster: string; // the booster type's name (types_boosters.nom)
  image_path?: string | null; // the booster's image; the legacy overlay also reads booster_image, image_booster
  cartes: BoosterMessageCard[];
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const parse = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v) as unknown;
  } catch {
    return null;
  }
};
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (isObj(v) ? v : null);
const CARD_TYPES: readonly CardType[] = ['combattant', 'magie', 'piege'];
const cardType = (v: unknown): CardType | null => CARD_TYPES.find((t) => t === v) ?? null;

/** A card of a message, read field by field (a wrong field is left out): the booster's and the combat's. */
export function readCard(c: Record<string, unknown>): BoosterMessageCard {
  return {
    carte: text(c['carte']) ?? '?',
    couleur: text(c['couleur']),
    image: text(c['image']),
    id: num(c['id']),
    rarete: text(c['rarete']),
    type: cardType(c['type']),
    atq: num(c['atq']),
    pv: num(c['pv']),
    passif: obj(c['passif']),
    ultime: obj(c['ultime']),
    effet: obj(c['effet']),
    dessin_path: text(c['dessin_path']),
    // the composer's own settings; the layout lays them over its defaults
    compo: obj(c['compo']) as Partial<Compo> | null,
    cadres: isFrameSetName(c['cadres']) ? c['cadres'] : null,
  };
}

/**
 * The message from whatever arrived, with the legacy overlay's unwrapping (extraire): as text, in a list,
 * wrapped in { data } or { ouvrir_booster }. Null when it has no list of cards.
 */
export function readBoosterMessage(raw: unknown): BoosterMessage | null {
  let d = parse(raw);
  if (Array.isArray(d)) d = d[0];
  if (isObj(d) && d['data'] !== undefined && !d['cartes']) d = d['data'];
  d = parse(d);
  if (isObj(d) && d['ouvrir_booster'] !== undefined) d = d['ouvrir_booster'];
  d = parse(d);
  if (!isObj(d) || !Array.isArray(d['cartes'])) return null;
  const cartes = (d['cartes'] as unknown[]).filter(isObj).map(readCard);
  return {
    pseudo: text(d['pseudo']) ?? '',
    booster: text(d['booster']) ?? 'Booster',
    image_path: text(d['image_path']) ?? text(d['booster_image']) ?? text(d['image_booster']),
    cartes,
  };
}

// raretes.nom -> tier
const TIER_OF_NAME: Readonly<Record<string, Tier>> = {
  commune: 'commun',
  rare: 'rare',
  epique: 'epique',
  épique: 'epique',
  légendaire: 'legendaire',
  legendaire: 'legendaire',
  ggez: 'ggez',
};
// A card's rarity: its name when the message has it, else its colour.
export const tierOf = (c: BoosterMessageCard): Tier =>
  (c.rarete && TIER_OF_NAME[c.rarete.trim().toLowerCase()]) || tierOfColour(c.couleur);

// The rarity whose colour this is (raretes.couleur, the same values as config/rarities.ts). An unknown
// colour plays as a common: the card still shows, with the plainest reveal.
export function tierOfColour(colour: string | null | undefined): Tier {
  const c = (colour ?? '').trim().toLowerCase();
  const found = (Object.keys(RARITIES) as Tier[]).find(
    (t) => RARITIES[t].colour.toLowerCase() === c,
  );
  return found ?? 'commun';
}

// Texture names: the caller says what a flattened image and a drawing go by, and loads them.
export type TextureKeys = {
  imageKey: (path: string) => string;
  drawingKey: (path: string) => string;
};

type Buildable = BoosterMessageCard & { type: CardType; dessin_path: string };
// Built when the card has a known type and a drawing; flat otherwise.
const builds = (c: BoosterMessageCard): c is Buildable => !!c.type && !!c.dessin_path;

/** The textures the message's cards need: a drawing for a built one, an image for a flat one. */
export const texturesOf = (m: BoosterMessage, k: TextureKeys): string[] =>
  m.cartes.flatMap((c) =>
    builds(c) ? [k.drawingKey(c.dessin_path)] : c.image ? [k.imageKey(c.image)] : [],
  );

/** The scene's event. `boosterImage`: the texture name of the booster's image, when there is one. */
export function toBoosterEvent(
  m: BoosterMessage,
  o: TextureKeys & { boosterImage: string | null },
): BoosterEvent {
  const cartes = m.cartes.map((c, i) => toCardData(c, i, o));
  return { t: 'booster', pseudo: m.pseudo, booster: m.booster, image: o.boosterImage, cartes };
}

/**
 * A card of a message, ready to build: from its drawing when it has one and a known type, else its
 * flattened image. `i`: its id when the message has none. The combat scene builds its cards with it too.
 */
export function toCardData(
  c: BoosterMessageCard,
  i: number,
  o: TextureKeys,
): CardData & { compo?: Partial<Compo> | null } {
  const id = c.id === null || c.id === undefined ? `${i}` : String(c.id);
  if (builds(c))
    return {
      id,
      name: c.carte,
      tier: tierOf(c),
      type: c.type,
      atq: c.atq,
      pv: c.pv,
      lines: plaqueLinesExplained({
        type: c.type,
        passif: c.passif,
        ultime: c.ultime,
        effet: c.effet,
      }),
      face: { kind: 'built', drawing: o.drawingKey(c.dessin_path) },
      compo: c.compo,
      frames: c.cadres,
      // in words, for the frame sets that write them (the Nihon frames)
      trigger:
        c.type === 'piege' && c.effet && typeof c.effet['condition'] === 'object'
          ? fxCond(c.effet['condition'] as Parameters<typeof fxCond>[0]) || null
          : null,
      ultimateTrigger:
        c.type === 'combattant' && c.ultime
          ? fxTrigUlt(c.ultime as Parameters<typeof fxTrigUlt>[0]) || null
          : null,
    };
  return {
    id,
    name: c.carte,
    tier: tierOf(c),
    // a flat face does not use them
    type: c.type ?? 'combattant',
    lines: [],
    face: { kind: 'flat', image: c.image ? o.imageKey(c.image) : '' },
    frames: c.cadres,
  };
}

/**
 * The booster's image when the message has none: read from types_boosters by the booster's name, like
 * the legacy overlay (the only table readable without a session). Null after `timeout` ms, on an error,
 * or when no booster has that name.
 */
export async function lookupBoosterImage(
  name: string,
  o: { rest: string; key: string; timeout?: number },
): Promise<string | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), o.timeout ?? 2500);
  try {
    const url = `${o.rest}/types_boosters?select=image_path&nom=ilike.${encodeURIComponent(name)}&limit=1`;
    const r = await fetch(url, { headers: { apikey: o.key }, signal: abort.signal });
    if (!r.ok) return null;
    const rows = (await r.json()) as unknown;
    const first = Array.isArray(rows) ? (rows[0] as unknown) : null;
    return isObj(first) ? text(first['image_path']) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
