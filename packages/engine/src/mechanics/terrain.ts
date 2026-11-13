// Terrains (November 2026): the ground the combat is fought on. One terrain at a time, for both
// sides, until the end of the combat or until another one replaces it.
//   - Drawn at the start of the combat (rules.terrain.tirage: weights, a null terrain for none).
//     Without a weight there is no draw at all: combats without terrains are unchanged.
//   - Invoked by a card: the effect `terrain` (a magic, an ultimate, a trap) or the passive `terrain`
//     (when the card comes into play). It lasts until the end of the combat.
// Each terrain has its rule, for both sides, and a bonus for the cards it favours (the cards of its
// collection, `collection`; 0 is Basique, the cards without a collection):
//   - orage (storm): at the start of each card's turn, `chance` % that a bolt strikes either fighter
//     (mechanics/storm.ts). Favoured: the cards with the lightning passive (`foudre`), `bonus` % of
//     their ATQ more on each strike.
//   - essaim (swarm, Xénoptera): at the start of its turn, `chance` % that the card playing is stung
//     (a bleed of `niveau`, `tours` turns). Favoured: never stung, `bonus` % of ATQ more per strike.
//   - foret (Enchanted Forest, Basique): at the start of its turn, the card heals `pct` % of its max
//     HP. Favoured: `bonus` % instead.
//   - cathedrale (Programming Cathedral, Mechanics and Technology): at the start of its turn, `chance`
//     % that the card runs a programming (mechanics/programming.ts; its first one is passive).
//     Favoured: `bonus` points of chance more.
//   - lune (Blood Moon, Horrors & Hunters): at the start of its turn, `chance` % that the card playing
//     is cursed (`tours` turns). Favoured: never cursed, `bonus` % of ATQ more per strike.
//   - sakura (Sakura Garden, Nihon Densetsu): every card dodges `esquive` points more. Favoured:
//     `bonus` points instead.
//   - grimoire (Open Grimoire, the Author's Library): at the start of its turn, `chance` % that the
//     card playing casts an effect drawn at random (mechanics/random.ts). Favoured: `bonus` % instead.
//   - theatre (Grand Theatre, a collection not revealed yet): at the start of its turn, `chance` % that a thread falls
//     from the flies on the card playing (mechanics/threads.ts; it adds up, without a control draw
//     of its own). Favoured: never receives one, and its own threads take control `bonus` points
//     more easily.

import type { Strike, StrikeStep } from '../combat/attack.ts';
import { amount, emit, id, opponent, raw, roll, round, type Combat } from '../combat/combat.ts';
import { heal } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { Terrain as EventTerrain } from '../events.ts';
import { bleed } from './bleed.ts';
import { curse } from './curse.ts';
import { program } from './programming.ts';
import { layThreads } from './threads.ts';
import { randomEffect } from './random.ts';
import { stormBolt } from './storm.ts';

export const TERRAINS = [
  'orage',
  'essaim',
  'foret',
  'cathedrale',
  'lune',
  'sakura',
  'grimoire',
  'theatre',
] as const satisfies readonly EventTerrain[];
export type Terrain = EventTerrain;
export const isTerrain = (t: unknown): t is Terrain => TERRAINS.includes(t as Terrain);

// Each terrain's settings when the rules do not give them (`collection`: the one it favours).
export const TERRAIN_DEFAULTS: Record<Terrain, Record<string, number>> = {
  orage: { chance: 10, degats: 18, bonus: 10 },
  essaim: { chance: 20, niveau: 1, tours: 2, bonus: 10, collection: 10 },
  foret: { pct: 3, bonus: 6, collection: 0 },
  cathedrale: { chance: 15, bonus: 10, collection: 8 },
  lune: { chance: 20, tours: 2, bonus: 10, collection: 1 },
  sakura: { esquive: 10, bonus: 20, collection: 7 },
  grimoire: { chance: 15, bonus: 30, collection: 11 },
  theatre: { chance: 20, bonus: 15, collection: 14 },
};

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? fallback : n;
};

// A setting of a terrain: the rules' value, else its default.
function setting(c: Combat, t: Terrain, key: string): number {
  const given = c.rules.terrain?.[t] as Record<string, unknown> | undefined;
  return num(given?.[key], TERRAIN_DEFAULTS[t][key] ?? 0);
}

// Favoured by the terrain in play: the lightning passive under the storm, else its collection.
function favoured(c: Combat, s: Side): boolean {
  const t = c.terrain;
  if (!t) return false;
  if (t === 'orage') return s.passives.some((p) => p.type === 'foudre');
  return (Number(s.fighter.collection_id) || 0) === setting(c, t, 'collection');
}

export function setTerrain(
  c: Combat,
  terrain: Terrain,
  cause: 'tirage' | 'effet' | 'passif',
  by?: Side,
): void {
  c.terrain = terrain;
  emit(c, {
    type: 'terrainChanged',
    terrain,
    cause,
    ...(by ? { by: id(c, by) } : {}),
  });
}

// At the start of the combat: one draw among the weighted terrains (none drawn: no terrain).
export function drawTerrain(c: Combat): void {
  const pool = (c.rules.terrain?.tirage ?? []).filter(
    (x) => num(x.poids, 0) > 0 && (x.terrain === null || isTerrain(x.terrain)),
  );
  if (!pool.length) return;
  const total = pool.reduce((n, x) => n + num(x.poids, 0), 0);
  let r = c.random() * total;
  const picked = pool.find((x) => (r -= num(x.poids, 0)) < 0) ?? pool[pool.length - 1];
  if (picked && isTerrain(picked.terrain)) setTerrain(c, picked.terrain, 'tirage');
}

// When cards come into play: their terrain passive invokes their terrain, in turn order.
export function terrainPassives(c: Combat, order: Side[]): void {
  order.forEach((s) => {
    const p = s.passives.find((q) => q.type === 'terrain' && isTerrain(q.terrain));
    if (p && s.hp > 0) setTerrain(c, p.terrain as Terrain, 'passif', s);
  });
}

// Start of a card's turn: the terrain acts. The storm terrain does nothing more while the storm
// event is on (one storm is enough).
export function terrainAtStart(c: Combat, s: Side): Flow {
  const t = c.terrain;
  if (!t || s.hp <= 0) return undefined;
  if (t === 'orage') {
    if (c.rules.orage) return undefined;
    const chance = setting(c, t, 'chance');
    return chance > 0 ? stormBolt(c, s, chance, setting(c, t, 'degats')) : undefined;
  }
  const fav = favoured(c, s);
  if (t === 'foret') {
    const pct = setting(c, t, fav ? 'bonus' : 'pct');
    if (pct > 0 && s.hp < s.maxHp) {
      emit(c, { type: 'terrainActs', terrain: t, side: id(c, s) });
      heal(c, s, amount({ u: 'pct', val: pct }, s.maxHp));
    }
    return undefined;
  }
  if (t === 'sakura') return undefined; // a dodge bonus (terrainDodge)
  if ((t === 'essaim' || t === 'lune' || t === 'theatre') && fav) return undefined; // never stung, cursed, threaded
  const chance =
    t === 'cathedrale'
      ? setting(c, t, 'chance') + (fav ? setting(c, t, 'bonus') : 0)
      : setting(c, t, t === 'grimoire' && fav ? 'bonus' : 'chance');
  if (!(chance > 0) || !roll(c, chance)) return undefined;
  emit(c, { type: 'terrainActs', terrain: t, side: id(c, s) });
  if (t === 'essaim')
    bleed(
      c,
      s,
      Math.max(1, Math.round(setting(c, t, 'niveau'))),
      Math.max(1, Math.round(setting(c, t, 'tours'))),
    );
  else if (t === 'lune') curse(c, s, Math.max(1, Math.round(setting(c, t, 'tours'))));
  else if (t === 'cathedrale') program(c, s, { chance: 100, nbpassif: 1 });
  else if (t === 'theatre') layThreads(c, s, 1, 0, false);
  else randomEffect(c, s, opponent(c, s));
  return s.hp <= 0 ? 'stop' : undefined;
}

// Each strike of a card the terrain favours (storm, swarm, blood moon): `bonus` % of its ATQ more.
export const terrainStrike: StrikeStep = (c: Combat, { a }, st: Strike) => {
  const t = c.terrain;
  if ((t !== 'orage' && t !== 'essaim' && t !== 'lune') || st.n <= 0 || !favoured(c, a))
    return undefined;
  st.n += Math.max(0, round((raw(a.atq) * setting(c, t, 'bonus')) / 100));
  return undefined;
};

// The sakura garden: the dodge chance it adds (mechanics/dodge.ts).
export const terrainDodge = (c: Combat, d: Side): number =>
  c.terrain === 'sakura' ? setting(c, 'sakura', favoured(c, d) ? 'bonus' : 'esquive') : 0;

// The grand theatre: the control chance it adds to the threads laid on d by a card it favours
// (mechanics/threads.ts).
export const terrainControl = (c: Combat, d: Side): number =>
  c.terrain === 'theatre' && favoured(c, opponent(c, d)) ? setting(c, 'theatre', 'bonus') : 0;

function terrainEffect({ c, e, o }: EffectContext): void {
  if (isTerrain(e.terrain)) setTerrain(c, e.terrain, 'effet', o);
}

export const effects = {
  terrain: { run: terrainEffect, once: true, withoutTarget: true },
} satisfies EffectRules;
