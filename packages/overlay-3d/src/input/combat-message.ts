// The combat message, as the legacy combat overlay receives it: the edge function computes the combat
// (simuler), Streamer.bot relays its answer over WebSocket, the overlay replays the journal line by line
// without computing anything (combat.html: extraire, jouer). This reads it.
//
// A journal line (packages/journal, project.ts): its type `t` and text `txt`, the card it is about `c`
// (0 or 1: a side), an amount `n`, a kind `k`, and the state after it: both fighters' PV, max PV and
// ATQ. The lines that start a combat, an overtime or a relay carry the players (`joueurs`).

import type { CardType } from '@forestcard/layout';
import { readCard, type BoosterMessageCard } from './booster-message.ts';

/** A card as the journal names it: the overlay looks up the rest (scenes/combat.ts, resolve). */
export type CardRef = {
  id: number | null;
  name: string;
  image: string | null; // its version's flattened image
  // the fighter's version image without its numbers (image_combat): the overlay writes them live
  imageCombat?: string | null;
  type: CardType;
  rarity: string | null; // raretes.nom: the journal gives the fighter's only
};

export type CombatPlayer = {
  pseudo: string;
  back: string | null; // the image of the card back they chose (dos_cartes.image)
  fighter: CardRef;
  magic: CardRef | null; // null: an empty slot
  trap: CardRef | null;
  // The enriched message (the edge adds them): each card whole, as the booster's enriched message
  // carries it (its stats, effects, drawing alone, composition, frames). Null: a legacy message, the
  // cards show their flattened images.
  cards: {
    fighter: BoosterMessageCard | null;
    magic: BoosterMessageCard | null;
    trap: BoosterMessageCard | null;
  } | null;
};

type Pair = readonly [number, number];

export type CombatLine = {
  t: string;
  txt: string;
  c: 0 | 1 | null;
  n: number | null;
  k: string | null; // folded to ASCII (kind): 'brulure', never 'brûlure'
  pv: Pair;
  max: Pair;
  atq: Pair;
  // while a rage or double damage runs: [rage bonus, 1 if doubled] per side
  boost: readonly [Pair, Pair] | null;
  players: readonly CombatPlayer[] | null;
  // every field of the line, for what the scene reads that is not above (niv, gagnant, from…)
  raw: Readonly<Record<string, unknown>>;
};

export type CombatMessage = {
  journal: readonly CombatLine[];
  winner: 0 | 1 | null;
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// A line's kind, folded to ASCII: the journal writes the burn 'brûlure' on a damage line and 'brulure'
// on a status line (legacy), and the same letter may come composed (û) or decomposed (u + accent).
// Folded, both read 'brulure', whatever the form: the scene's keys are plain ASCII.
const kind = (v: unknown): string | null =>
  text(v)
    ?.normalize('NFD')
    .replace(/[̀-ͯ]/g, '') ?? null;
const side = (v: unknown): 0 | 1 | null => (v === 0 || v === 1 ? v : null);
const pair = (v: unknown): Pair | null => {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const a = num(v[0]),
    b = num(v[1]);
  return a === null || b === null ? null : [a, b];
};

// A card of a player; an empty slot (the engine's "no magic", "no trap") has neither id nor image.
function ref(
  name: unknown,
  image: unknown,
  id: unknown,
  type: CardType,
  rarity: unknown = null,
): CardRef | null {
  const r = {
    id: num(id),
    name: text(name) ?? '?',
    image: text(image),
    type,
    rarity: text(rarity),
  };
  return r.id === null && r.image === null ? null : r;
}

function readPlayer(p: unknown): CombatPlayer | null {
  if (!isObj(p)) return null;
  const ids = Array.isArray(p['ids']) ? (p['ids'] as unknown[]) : [];
  const rar = isObj(p['rar']) ? p['rar']['nom'] : null;
  const fighter = ref(p['carte'], p['image'], ids[0], 'combattant', rar);
  if (!fighter) return null;
  fighter.imageCombat = text(p['imageCombat']);
  return {
    pseudo: text(p['pseudo']) ?? '?',
    back: text(p['dos']),
    fighter,
    magic: ref(p['magie'], p['magieImg'], ids[1], 'magie'),
    trap: ref(p['piege'], p['piegeImg'], ids[2], 'piege'),
    cards: readCards(p['cartes']),
  };
}

// `cartes`: the fighter, the magic, the trap, in that order (null for an empty slot)
function readCards(v: unknown): CombatPlayer['cards'] {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [fighter, magic, trap] = (v as unknown[]).map((c) => (isObj(c) ? readCard(c) : null));
  return { fighter: fighter ?? null, magic: magic ?? null, trap: trap ?? null };
}

function readLine(l: unknown): CombatLine | null {
  if (!isObj(l)) return null;
  const t = text(l['t']),
    pv = pair(l['pv']),
    max = pair(l['max']),
    atq = pair(l['atq']);
  if (!t || !pv || !max || !atq) return null;
  const b = Array.isArray(l['boost']) ? (l['boost'] as unknown[]) : null;
  const boost = b && b.length === 2 ? [pair(b[0]), pair(b[1])] : null;
  let players: CombatPlayer[] | null = null;
  if (Array.isArray(l['joueurs'])) {
    const read = (l['joueurs'] as unknown[]).map(readPlayer);
    if (read.length !== 2 || read.some((p) => !p)) return null;
    players = read as CombatPlayer[];
  }
  return {
    t,
    txt: typeof l['txt'] === 'string' ? l['txt'] : '',
    c: side(l['c']),
    n: num(l['n']),
    k: kind(l['k']),
    pv,
    max,
    atq,
    boost: boost && boost[0] && boost[1] ? [boost[0], boost[1]] : null,
    players,
    raw: l,
  };
}

/**
 * The message from whatever arrived, unwrapped like the legacy overlay does (extraire: as text, up to
 * four levels deep, a list's first item, `data`). Null when it has no journal, or when a line of it
 * cannot be read: a combat is replayed whole or not at all.
 */
export function readCombatMessage(raw: unknown): CombatMessage | null {
  let d = raw;
  for (let k = 0; k < 4; k++) {
    if (typeof d === 'string') {
      try {
        d = JSON.parse(d) as unknown;
      } catch {
        return null;
      }
    }
    if (Array.isArray(d)) d = d[0];
    if (isObj(d) && Array.isArray(d['journal'])) break;
    if (isObj(d) && d['data'] !== undefined) d = d['data'];
    else return null;
  }
  if (!isObj(d) || !Array.isArray(d['journal'])) return null;
  const journal = (d['journal'] as unknown[]).map(readLine);
  if (!journal.length || journal.some((l) => !l)) return null;
  const lines = journal as CombatLine[];
  // a combat starts with its players
  if (!lines[0]!.players) return null;
  return { journal: lines, winner: side(d['gagnant']) };
}
