// Forge (November 2026): two effects, each also a passive (every X rounds, `tours`, 2 when empty).
//
//   - Forge (forge): improves one of the forging card's own cards, drawn among those that can still
//     be forged (forgeMax levels per card, 3): its fighter, its magic, its trap. It only raises what
//     is written on the card, never adds an effect:
//       fighter: its ATQ or its max HP (+forgeStatMin to forgeStatMax %, at least 1), or a value of
//         one of its passives;
//       magic: a value of its effect. A magic that already acted only grows its ATQ / max HP
//         changes (the difference plays at once, undone with the magic); a waiting magic grows any
//         value;
//       trap (still armed): a value of its payload, or, at forgeDeclenchement % of chances, one
//         trigger more (once per trap).
//     A value grows by forgeValeurMin to forgeValeurMax % (at least 1, a malus grows as a malus); a
//     chance by forgeChanceMin to forgeChanceMax points (forgePlafondChance at most); a duration by
//     one turn (never a duration 0 = "the whole combat"); a status level by one (III at most).
//     A forged magic or trap keeps its forge when stolen. Revives and avoid-death are never forged.
//   - Living weapon (passive arme_vivante, November 2026): its fighter takes up to
//     LIVING_WEAPON.forgeMax forges (6) instead of forgeMax, and each time it is forged, LIVING_WEAPON.double %
//     (50) of chances to be forged once more (a double forge counts for two). A burn laid on it
//     forges it instead (mechanics/living-weapon.ts).
//   - Creation forge (forge_creation): forges a new magic or a new trap, whose effect is drawn
//     among the game's effects (the pool of the random effect), and puts it in play in its slot. A spent
//     slot (no magic acting or waiting, no armed trap) is filled first; with both or neither spent,
//     magic or trap is drawn. A replaced magic's effects are undone. A forged trap gets a condition
//     drawn from a short list, and one trigger.

import { emit, id, opponent, raw, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import { applyEffect } from '../combat/effects.ts';
import type { Side } from '../combat/state.ts';
import type { ForgeField, ForgeSlot, RandomEffectKey } from '../events.ts';
import type { Card, EffectData, TrapCondition } from '../model/card.ts';
import { MAX_LEVEL } from '../model/levels.ts';
import { randomEffectPool } from './random.ts';
import { undoMagic } from './theft.ts';

// Living weapon (passive arme_vivante): forges its fighter can take, % of chances of a double forge.
export const LIVING_WEAPON = { forgeMax: 6, double: 50 } as const;
export const isLivingWeapon = (s: Side): boolean =>
  s.passives.some((p) => p.type === 'arme_vivante');
const fighterMax = (c: Combat, s: Side): number =>
  isLivingWeapon(s) ? LIVING_WEAPON.forgeMax : c.levels.forgeMax;

// Its part of a card's status (combat/state.ts): the forge level of its fighter.
export type ForgeState = { forgeLevel: number };
export const forgeState = (): ForgeState => ({ forgeLevel: 0 });

// Values a forge can raise by a %: amounts written on the card.
const AMOUNT_FIELDS = [
  'val',
  'pctatq',
  'pctcrit',
  'pctlien',
  'pctriposte',
  'bonus',
  'ragev',
  'eclat',
  'matq',
  'mpv',
  'sval',
] as const satisfies readonly (keyof EffectData)[];

// Passives whose `tours` is a period (every X rounds): a longer one would be weaker.
const PERIOD_TYPES = new Set(['atq_tours', 'pv_tours', 'forge', 'forge_creation']);
// Never forged: their identity is how the engine knows they were used (revives), or they only set
// a protection (avoid-death), or they hold other effects (programming).
const UNFORGEABLE = new Set(['reanimation', 'evite_mort', 'mort_evitee', 'programmation']);
// The stat changes a magic that already acted can still grow (the difference plays at once).
const STAT_TYPES = new Set(['atq_mod', 'pv_mod']);

const num = (v: unknown): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
const ri = (c: Combat, a: number, b: number): number => {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo + Math.floor(c.random() * (hi - lo + 1));
};
const clone = (e: EffectData): EffectData => JSON.parse(JSON.stringify(e)) as EffectData;

// One way to forge a card: what grows, and the change it makes (drawn when it is chosen).
// `then`: what plays after the forge is announced (a grown magic's change, given at once).
type Change = [from: number, to: number, then?: () => void];
type Option = { field: ForgeField; effectType: string | undefined; apply: () => Change };

// The bricks of an effect: itself, or its briques; a trap's payload holds its effect in `effet`.
function bricksOf(e: EffectData | null | undefined): EffectData[] {
  if (!e) return [];
  if (e.briques) return (e.briques.filter((b) => b && b.type) as EffectData[]).flatMap(bricksOf);
  return e.type ? [e] : [];
}

// The values of a brick a forge can raise (statOnly: only a magic's stat change).
function brickOptions(c: Combat, b: EffectData, period: boolean, statOnly: boolean): Option[] {
  if (!b.type || UNFORGEABLE.has(b.type)) return [];
  if (statOnly && !STAT_TYPES.has(b.type)) return [];
  const L = c.levels;
  const out: Option[] = [];
  for (const f of statOnly ? (['val'] as const) : AMOUNT_FIELDS) {
    const v = num(b[f]);
    if (v === 0) continue;
    out.push({
      field: f,
      effectType: b.type,
      apply: () => {
        const pct = ri(c, L.forgeValeurMin, L.forgeValeurMax);
        const grow = Math.max(1, round((Math.abs(v) * pct) / 100));
        const to = v + (v < 0 ? -grow : grow);
        b[f] = to;
        return [v, to];
      },
    });
  }
  if (statOnly) return out;
  const ch = num(b.chance);
  if (ch > 0 && ch < L.forgePlafondChance)
    out.push({
      field: 'chance',
      effectType: b.type,
      apply: () => {
        const to = Math.min(L.forgePlafondChance, ch + ri(c, L.forgeChanceMin, L.forgeChanceMax));
        b.chance = to;
        return [ch, to];
      },
    });
  const t = parseInt(String(b.tours), 10) || 0;
  if (t > 0 && !(period && PERIOD_TYPES.has(b.type)))
    out.push({
      field: 'tours',
      effectType: b.type,
      apply: () => {
        b.tours = t + 1;
        return [t, t + 1];
      },
    });
  const lv = parseInt(String(b.niveau), 10) || 0;
  if (lv >= 1 && lv < MAX_LEVEL)
    out.push({
      field: 'niveau',
      effectType: b.type,
      apply: () => {
        b.niveau = lv + 1;
        return [lv, lv + 1];
      },
    });
  return out;
}

// What a forge can do on each of its card's cards; null: that card cannot be forged now.
type Target = {
  slot: ForgeSlot;
  card: Card;
  max: number;
  options: () => Option[];
  done: () => number;
};

function fighterTarget(c: Combat, o: Side): Target | null {
  const max = fighterMax(c, o);
  if (o.hp <= 0 || o.status.forgeLevel >= max) return null;
  const L = c.levels;
  const grow = (base: number) =>
    Math.max(1, round((base * ri(c, L.forgeStatMin, L.forgeStatMax)) / 100));
  return {
    slot: 'fighter',
    card: o.fighter,
    max,
    options: () => {
      const out: Option[] = [
        {
          field: 'atq',
          effectType: undefined,
          apply: () => {
            const from = o.atq;
            o.atq += grow(raw(o.fighter.atq) || o.atq);
            return [from, o.atq];
          },
        },
        {
          field: 'maxHp',
          effectType: undefined,
          apply: () => {
            const from = o.maxHp;
            const d = grow(raw(o.fighter.pv) || o.maxHp);
            o.maxHp += d;
            o.hp += d;
            return [from, o.maxHp];
          },
        },
      ];
      // A passive's values: the side's own copy is forged (card data is shared between combats).
      o.passives.forEach((p, i) => {
        if (!p || !p.type || UNFORGEABLE.has(p.type)) return;
        const probe = brickOptions(c, p, true, false);
        probe.forEach((q) =>
          out.push({
            field: q.field,
            effectType: q.effectType,
            apply: () => {
              const copy = { ...o.passives[i] } as EffectData;
              o.passives[i] = copy;
              const again = brickOptions(c, copy, true, false).find((z) => z.field === q.field);
              return again ? again.apply() : ([0, 0] as Change);
            },
          }),
        );
      });
      return out;
    },
    done: () => ++o.status.forgeLevel,
  };
}

// A forged magic or trap: its improved effect, made once per combat from the card's.
function forgedOf(c: Combat, card: Card) {
  let f = c.forged.get(card);
  if (!f) {
    f = { effet: clone(card.effet as EffectData), level: 0, extraTrigger: 0 };
    c.forged.set(card, f);
  }
  return f;
}
const levelOf = (c: Combat, card: Card) => c.forged.get(card)?.level ?? 0;
const payloadOf = (c: Combat, card: Card) => c.forged.get(card)?.effet ?? card.effet;

function magicTarget(c: Combat, o: Side): Target | null {
  const card = o.magic;
  if (card.vide || !card.effet || !o.magicActive || o.magicStolen) return null;
  if (levelOf(c, card) >= c.levels.forgeMax) return null;
  // Waiting (it acts later): anything grows; already acted: only its stat changes.
  const waiting = o.magicStartTurn > 0;
  const preview = bricksOf(payloadOf(c, card)).flatMap((b) => brickOptions(c, b, false, !waiting));
  if (!preview.length) return null;
  return {
    slot: 'magic',
    card,
    max: c.levels.forgeMax,
    options: () => {
      const f = forgedOf(c, card);
      return bricksOf(f.effet).flatMap((b) => {
        const opts = brickOptions(c, b, false, !waiting);
        if (waiting) return opts;
        // Already acted: the difference plays now, as part of the magic (undone with it).
        return opts.map((q) => ({
          ...q,
          apply: (): Change => {
            const [from, to] = q.apply();
            const give = () => applyEffect(c, { ...b, val: to - from }, o, opponent(c, o), true);
            return [from, to, give];
          },
        }));
      });
    },
    done: () => ++forgedOf(c, card).level,
  };
}

function trapTarget(c: Combat, o: Side): Target | null {
  const card = o.trap;
  const payload = payloadOf(c, card);
  if (card.vide || !payload || !o.trapActive) return null;
  if (o.trapTriggers >= (payload.declenchements || 1)) return null;
  if (levelOf(c, card) >= c.levels.forgeMax) return null;
  const canTrigger = !c.forged.get(card)?.extraTrigger;
  const preview = bricksOf(payload.effet).flatMap((b) => brickOptions(c, b, false, false));
  if (!preview.length && !canTrigger) return null;
  return {
    slot: 'trap',
    card,
    max: c.levels.forgeMax,
    options: () => {
      const f = forgedOf(c, card);
      const values = bricksOf(f.effet.effet).flatMap((b) => brickOptions(c, b, false, false));
      const trigger: Option = {
        field: 'declenchements',
        effectType: undefined,
        apply: () => {
          const from = parseInt(String(f.effet.declenchements), 10) || 1;
          f.effet.declenchements = from + 1;
          f.extraTrigger = 1;
          return [from, from + 1];
        },
      };
      // One trigger more is rare: drawn first, at forgeDeclenchement % (always, with nothing else).
      if (canTrigger && (!values.length || c.random() * 100 < c.levels.forgeDeclenchement))
        return [trigger];
      return values;
    },
    done: () => ++forgedOf(c, card).level,
  };
}

// One forge on target t of card o (double: the second forge of a living weapon). False: nothing to
// forge in it.
function forgeOnce(c: Combat, o: Side, t: Target, double: boolean): boolean {
  const options = t.options();
  const pick = options[Math.floor(c.random() * options.length)];
  if (!pick) return false;
  const level = t.done();
  const [from, to, then] = pick.apply();
  emit(c, {
    type: 'forged',
    side: id(c, o),
    slot: t.slot,
    card: t.card,
    level,
    max: t.max,
    field: pick.field,
    effectType: pick.effectType,
    from,
    to,
    ...(double ? { double: true as const } : {}),
  });
  if (then) then();
  return true;
}

// A forge on target t; a living weapon's fighter may be forged once more.
function forgeTarget(c: Combat, o: Side, t: Target): void {
  if (!forgeOnce(c, o, t, false)) {
    emit(c, { type: 'forgeIdle', side: id(c, o) });
    return;
  }
  if (t.slot !== 'fighter' || !isLivingWeapon(o) || !roll(c, LIVING_WEAPON.double)) return;
  const again = fighterTarget(c, o);
  if (again) forgeOnce(c, o, again, true);
}

// One forge by card o: a card drawn among those it can forge, then one of its values.
export function forge(c: Combat, o: Side): void {
  if (o.hp <= 0) return;
  const targets = [fighterTarget(c, o), magicTarget(c, o), trapTarget(c, o)].filter(
    (t): t is Target => !!t,
  );
  if (!targets.length) {
    emit(c, { type: 'forgeIdle', side: id(c, o) });
    return;
  }
  forgeTarget(c, o, targets[Math.floor(c.random() * targets.length)] as Target);
}

// A forge of o's own fighter only (a living weapon set on fire). False: it cannot be forged now.
export function forgeFighter(c: Combat, o: Side): boolean {
  const t = fighterTarget(c, o);
  if (!t) return false;
  forgeTarget(c, o, t);
  return true;
}

// ── Creation ──

// The conditions a forged trap can get.
function trapCondition(c: Combat): TrapCondition {
  const pool: (() => TrapCondition)[] = [
    () => ({ type: 'adv_attaque', coups: ri(c, 1, 2) }),
    () => ({ type: 'adv_ultime' }),
    () => ({ type: 'proprio_pv_sous', seuilpv: ri(c, 30, 50) }),
    () => ({ type: 'adv_soigne' }),
    () => ({ type: 'proprio_statut' }),
  ];
  return (pool[Math.floor(c.random() * pool.length)] as () => TrapCondition)();
}

const magicSpent = (s: Side) => s.magic.vide || !s.magicActive || s.magicStolen > 0;
const trapSpent = (s: Side, c: Combat) => {
  const p = payloadOf(c, s.trap);
  return s.trap.vide || !s.trapActive || !p || s.trapTriggers >= (p.declenchements || 1);
};

export function forgeCreation(c: Combat, o: Side): void {
  if (o.hp <= 0) return;
  const x = opponent(c, o);
  const m = magicSpent(o);
  const t = trapSpent(o, c);
  const kind: 'magie' | 'piege' =
    m !== t ? (m ? 'magie' : 'piege') : c.random() < 0.5 ? 'magie' : 'piege';
  const pool = randomEffectPool(c, o, x);
  const [key, make] = pool[Math.floor(c.random() * pool.length)] as [
    RandomEffectKey,
    () => EffectData,
  ];
  const effect = make();
  const replaced = kind === 'magie' ? !m : !t;
  if (kind === 'magie') {
    if (o.magicActive && !o.magicStolen && !o.magic.vide) undoMagic(o);
    const card: Card = {
      type: 'magie',
      nom: 'Magie forgée',
      effet: effect,
      image: null,
      rar: null,
    };
    o.magic = card;
    o.magicActive = 1;
    o.magicStolen = 0;
    o.magicCancelStage = 0;
    o.magicCancelTurns = 0;
    o.magicStartTurn = 0;
    o.magicTurnsLeft = 0;
    emit(c, { type: 'forgeCreated', side: id(c, o), kind, card, effect: key, replaced });
    applyEffect(c, effect, o, x, true);
  } else {
    const condition = trapCondition(c);
    const card: Card = {
      type: 'piege',
      nom: 'Piège forgé',
      effet: { condition, effet: effect, declenchements: 1 },
      image: null,
      rar: null,
    };
    o.trap = card;
    o.trapActive = 1;
    o.trapTriggers = 0;
    o.trapBlocked = 0;
    emit(c, {
      type: 'forgeCreated',
      side: id(c, o),
      kind,
      card,
      effect: key,
      replaced,
      condition: condition.type,
    });
  }
  c.sides.forEach((s) => (s.cardActivated = 1));
}

// "Every turn" passives: every X rounds (`tours`, 2 when empty).
const every = (p: EffectData) => Math.max(1, parseInt(String(p.tours), 10) || 2);
export function forgeEveryTurn(c: Combat, s: Side, p: EffectData): void {
  if (c.round % every(p) !== 0) return;
  const previousSource = c.source;
  c.source = 'passif';
  forge(c, s);
  c.source = previousSource;
}
export function forgeCreationEveryTurn(c: Combat, s: Side, p: EffectData): void {
  if (c.round % every(p) !== 0) return;
  const previousSource = c.source;
  c.source = 'passif';
  forgeCreation(c, s);
  c.source = previousSource;
}

// Its effects (the registry of effects.ts). A forge is not undone with the magic that played it.
export const effects = {
  forge: { run: ({ c, o }: EffectContext) => forge(c, o) },
  forge_creation: { run: ({ c, o }: EffectContext) => forgeCreation(c, o), once: true },
} satisfies EffectRules;
