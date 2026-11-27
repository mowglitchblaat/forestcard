// Skin (peau, November 2026): a contact defence, for golems and their kind. A card with a skin
// punishes whoever touches it: each strike of a basic attack that lands on it (damage dealt, or
// blocked) may lay a status on the ATTACKER. Only basic attacks touch: an ultimate, a breath, a
// missile, a direct damage, a status tick do not.
//
// One skin, one status (`pstatut`): brulure (lava skin), saignement (thorny bark), gel (frost skin),
// poison (toxic skin), malediction (cursed skin), fracture (stone skin: the blow breaks the
// attacker's bones), foudre (electric skin: a lightning mark). Its fields:
//   - `chance` % (100 when empty) on each strike that touches;
//   - `niveau` (I when empty) and `stours` turns (2 when empty) of the status it lays (the status's
//     own rules apply: levels add up, a mist takes it, fire melts ice…).
// Several skins of the same status add their chances (one draw, combat/sources.ts); skins of
// different statuses each act, in the order the card holds them.
//
// Comes from: a passive (peau: the card's own skin, for the whole combat), an effect (peau:
// ultimate, magic, trap) that gives its own fighter a skin for `tours` turns of its own (empty or 0:
// the whole combat; a magic's skin goes with the magic). A skin is not a status: no purification,
// no mist, no molt takes it.

import { LAID_ON_HIT, type Attack, type Strike } from '../combat/attack.ts';
import { emit, id, over, raw, roll, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow, StrikeFlow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import { mergedSource } from '../combat/sources.ts';
import type { EffectData } from '../model/card.ts';
import type { SkinStatus } from '../events.ts';

export const SKIN_STATUSES: readonly SkinStatus[] = [
  'brulure',
  'saignement',
  'gel',
  'poison',
  'malediction',
  'fracture',
  'foudre',
];

// A skin given by an effect; turns: Infinity for the whole combat.
export type Skin = { source: EffectData; status: SkinStatus; turns: number };

// Its part of a card's status (combat/state.ts).
export type SkinState = { skins: Skin[] };
export const skinState = (): SkinState => ({ skins: [] });

export const skinStatusOf = (q: EffectData): SkinStatus =>
  SKIN_STATUSES.includes(q.pstatut as SkinStatus) ? (q.pstatut as SkinStatus) : 'brulure';

// The skins of s, passives first then those given by effects, grouped by status in that order.
function skinGroups(s: Side): EffectData[][] {
  const groups = new Map<SkinStatus, EffectData[]>();
  const add = (q: EffectData) => {
    const k = skinStatusOf(q);
    const g = groups.get(k);
    if (g) g.push(q);
    else groups.set(k, [q]);
  };
  s.passives.forEach((p) => p.type === 'peau' && add(p));
  s.status.skins.forEach((z) => add(z.source));
  return [...groups.values()];
}

// Whether s wears a skin (the overlay's badge).
export const hasSkin = (s: Side): boolean =>
  s.status.skins.length > 0 || s.passives.some((p) => p.type === 'peau');

// The first skin s wears, for the overlay's look.
export const firstSkin = (s: Side): SkinStatus | null => {
  const p = s.passives.find((q) => q.type === 'peau');
  if (p) return skinStatusOf(p);
  const z = s.status.skins[0];
  return z ? z.status : null;
};

const chanceOf = (q: EffectData): number =>
  q.chance == null || q.chance === '' ? 100 : Math.max(0, +raw(q.chance) || 0);

// The status a skin lays, as the attack passive of the same name would (its chance already drawn).
const laidBy = (q: EffectData, status: SkinStatus): EffectData => ({
  type: status,
  chance: 100,
  niveau: q.niveau == null || q.niveau === '' ? 1 : q.niveau,
  tours: Math.max(1, parseInt(String(q.stours), 10) || 2),
});

// A strike that landed on a card with a skin: the attacker touched it.
export function skinContact(c: Combat, { a, d, ia, idd }: Attack, _st: Strike): StrikeFlow {
  if (a.hp <= 0) return undefined;
  for (const g of skinGroups(d)) {
    if (a.hp <= 0 || over(c)) break;
    const first = g[0] as EffectData;
    const q =
      g.length === 1 ? (roll(c, chanceOf(first)) ? first : undefined) : mergedSource(c, g, 100);
    if (!q) continue;
    const status = skinStatusOf(q);
    emit(c, { type: 'skinContact', side: idd, attacker: ia, status });
    const lay = LAID_ON_HIT[status] as (c: Combat, q: EffectData, d: Side) => void;
    lay(c, laidBy(q, status), a);
  }
  return undefined;
}

// End of its turn: the skins given for a few turns count down.
export function skinsEnd(c: Combat, s: Side): Flow {
  s.status.skins = s.status.skins.filter((z) => {
    if (--z.turns > 0) return true;
    emit(c, { type: 'skinEnded', side: id(c, s), status: z.status });
    return false;
  });
  return undefined;
}

// The effect: its own fighter wears the skin for `tours` turns (0 or empty: the whole combat).
export function skinEffect({ c, e, o, onUndo }: EffectContext): void {
  if (o.hp <= 0) return;
  const n = parseInt(String(e.tours), 10);
  const skin: Skin = {
    source: { ...e, type: 'peau' },
    status: skinStatusOf(e),
    turns: n > 0 ? n : Infinity,
  };
  o.status.skins.push(skin);
  emit(c, {
    type: 'skinGained',
    side: id(c, o),
    status: skin.status,
    turns: n > 0 ? n : 0,
    chance: chanceOf(e),
  });
  onUndo(() => {
    if (!o.status.skins.includes(skin)) return;
    o.status.skins = o.status.skins.filter((z) => z !== skin);
    emit(c, { type: 'skinEnded', side: id(c, o), status: skin.status });
  });
}

// Its effects (the registry of effects.ts).
export const effects = {
  peau: { run: skinEffect },
} satisfies EffectRules;
