// Terrains (November 2026): the ground the combat is fought on. One terrain at a time, for both
// sides, until the end of the combat or until another one replaces it.
//   - Drawn at the start of the combat (rules.terrain.tirage: weights, a null terrain for none).
//     Without a weight there is no draw at all: combats without terrains are unchanged.
//   - Invoked by a card: the effect `terrain` (a magic, an ultimate, a trap) or the passive `terrain`
//     (when the card comes into play). It lasts until the end of the combat.
// Each terrain has its rule, for both sides, and a bonus for the cards it favours:
//   - orage (storm): at the start of each card's turn, `chance` % that a bolt strikes either fighter
//     (mechanics/storm.ts); the cards with the lightning passive (`foudre`) deal `bonus` % more.
//   - essaim (swarm): at the start of each card's turn, `chance` % that the card playing is stung (a
//     bleed of `niveau`, `tours` turns); the cards of the swarm's collection (`collection`, the
//     Xénoptera) are never stung and deal `bonus` % more.

import type { Strike, StrikeStep } from '../combat/attack.ts';
import { emit, id, raw, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import { bleed } from './bleed.ts';
import { stormBolt } from './storm.ts';

export const TERRAINS = ['orage', 'essaim'] as const;
export type Terrain = (typeof TERRAINS)[number];
export const isTerrain = (t: unknown): t is Terrain => TERRAINS.includes(t as Terrain);

// Each terrain's settings when the rules do not give them.
export const TERRAIN_DEFAULTS = {
  orage: { chance: 10, degats: 18, bonus: 10 },
  essaim: { chance: 20, niveau: 1, tours: 2, bonus: 10 },
} as const;

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? fallback : n;
};

const stormSettings = (c: Combat) => {
  const o = c.rules.terrain?.orage;
  const d = TERRAIN_DEFAULTS.orage;
  return {
    chance: num(o?.chance, d.chance),
    degats: num(o?.degats, d.degats),
    bonus: num(o?.bonus, d.bonus),
  };
};

const swarmSettings = (c: Combat) => {
  const o = c.rules.terrain?.essaim;
  const d = TERRAIN_DEFAULTS.essaim;
  return {
    chance: num(o?.chance, d.chance),
    niveau: Math.max(1, Math.round(num(o?.niveau, d.niveau))),
    tours: Math.max(1, Math.round(num(o?.tours, d.tours))),
    bonus: num(o?.bonus, d.bonus),
    collection: o?.collection ?? null,
  };
};

// Favoured by the terrain in play: the lightning passive under the storm, the swarm's collection in
// the swarm.
function favoured(c: Combat, s: Side): boolean {
  if (c.terrain === 'orage') return s.passives.some((p) => p.type === 'foudre');
  if (c.terrain === 'essaim') {
    const k = swarmSettings(c).collection;
    return k !== null && k !== undefined && Number(s.fighter.collection_id) === Number(k);
  }
  return false;
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
  if (c.terrain === 'orage' && !c.rules.orage) {
    const o = stormSettings(c);
    return o.chance > 0 ? stormBolt(c, s, o.chance, o.degats) : undefined;
  }
  if (c.terrain === 'essaim') {
    const o = swarmSettings(c);
    if (s.hp <= 0 || favoured(c, s) || !(o.chance > 0) || !roll(c, o.chance)) return undefined;
    emit(c, { type: 'stung', side: id(c, s) });
    bleed(c, s, o.niveau, o.tours);
  }
  return undefined;
}

// Each strike of a card the terrain favours: `bonus` % of its ATQ more.
export const terrainStrike: StrikeStep = (c: Combat, { a }, st: Strike) => {
  if (!c.terrain || st.n <= 0 || !favoured(c, a)) return undefined;
  const bonus = c.terrain === 'orage' ? stormSettings(c).bonus : swarmSettings(c).bonus;
  st.n += Math.max(0, round((raw(a.atq) * bonus) / 100));
  return undefined;
};

function terrainEffect({ c, e, o }: EffectContext): void {
  if (isTerrain(e.terrain)) setTerrain(c, e.terrain, 'effet', o);
}

export const effects = {
  terrain: { run: terrainEffect, once: true, withoutTarget: true },
} satisfies EffectRules;
