// Parasitic link (lien parasitaire): laid on a card (the carrier) for X of its turns. While it
// holds, the carrier shares its heals: X % of each heal (50 when empty) goes to the opponent
// instead, and the opponent shares its own heals with the carrier the same way. Links are independent: a card can carry several, each with its own share and its own
// turns; together they take the whole heal at most. An effect or a passive can lay X at once
// (`nbliens`).
//
// Laid by: an effect (lien_parasite: ultimate, magic, trap; on the opponent), a passive (X % of
// chances on each hit, LAID_ON_HIT), the insect mutation at level III. A negative status: a mist
// takes it, a molt removes it.

import { emit, id, opponent, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData, Num } from '../model/card.ts';
import { mistTakes } from './mist.ts';

export type Parasite = { to: Side; turns: number; pct: number };

// Its part of a card's status (combat/state.ts): its links, each one independent.
export type ParasiteState = {
  parasites: Parasite[];
};
export const parasiteState = (): ParasiteState => ({ parasites: [] });

export const sharePct = (v: Num): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(100, n) : 50;
};
const turnsOf = (v: Num, d: number): number => Math.max(1, parseInt(String(v), 10) || d);
// How many links an effect or a passive lays at once (`nbliens`, 1 when empty).
export const linkCount = (v: Num): number => Math.max(1, parseInt(String(v), 10) || 1);

// Lays one more link on the carrier: the carrier's heals feed `to`. Returns it (null: not laid).
export function link(
  c: Combat,
  carrier: Side,
  to: Side,
  turns: number,
  pct: number,
): Parasite | null {
  if (carrier.hp <= 0) return null;
  if (mistTakes(c, carrier, 'parasite', (t) => link(c, t, opponent(c, t), turns, pct))) return null;
  const laid: Parasite = { to, turns, pct };
  carrier.status.parasites.push(laid);
  const links = carrier.status.parasites.length;
  emit(c, {
    type: 'parasiteLinked',
    side: id(c, carrier),
    to: id(c, to),
    turns,
    pct,
    links,
    stacked: links > 1,
  });
  return laid;
}

// Lays `count` links, one after the other.
export function links(
  c: Combat,
  carrier: Side,
  to: Side,
  turns: number,
  pct: number,
  count: number,
) {
  const laid: Parasite[] = [];
  for (let k = 0; k < count && carrier.hp > 0; k++) {
    const p = link(c, carrier, to, turns, pct);
    if (p) laid.push(p);
  }
  return laid;
}

// A heal of n on s (after the bleed's reduction): what each link takes, X % of the heal each. A
// link works both ways: the carrier shares its heals with the card that laid it, and that card
// shares its own heals (not those the links bring) with the carrier. All the links together take
// the whole heal at most. The shares are healed on the other card right after (shareHeal), never
// shared again.
export type Share = { to: Side; amount: number; links: number };
let sharing = false;
export function sharedParts(c: Combat, s: Side, n: number): Share[] {
  if (sharing || n <= 0) return [];
  // the links that share s's heals: its own (towards the card that laid them), and those it laid
  // on another card (towards that carrier)
  const ways: { to: Side; pct: number }[] = [
    ...s.status.parasites.map((p) => ({ to: p.to, pct: p.pct })),
    ...c.sides
      .filter((o) => o !== s)
      .flatMap((o) =>
        o.status.parasites.filter((p) => p.to === s).map((p) => ({ to: o, pct: p.pct })),
      ),
  ];
  if (!ways.length) return [];
  const parts = new Map<Side, Share>();
  let left = n;
  for (const w of ways) {
    if (w.to.hp <= 0) continue;
    const a = Math.min(left, round((n * w.pct) / 100));
    if (a <= 0) continue;
    left -= a;
    const part = parts.get(w.to) ?? { to: w.to, amount: 0, links: 0 };
    part.amount += a;
    part.links++;
    parts.set(w.to, part);
  }
  return [...parts.values()];
}
export function shareHeal(
  c: Combat,
  s: Side,
  parts: Share[],
  heal: (c: Combat, s: Side, n: number) => void,
): void {
  for (const { to, amount, links } of parts) {
    emit(c, { type: 'parasiteFed', side: id(c, s), to: id(c, to), amount, links });
    sharing = true;
    try {
      heal(c, to, amount);
    } finally {
      sharing = false;
    }
  }
}

// Removes some links of s (all of them by default), one end event each.
export function unlink(c: Combat, s: Side, which?: Parasite[]): void {
  const gone = which ?? s.status.parasites.slice();
  for (const p of gone) {
    if (!s.status.parasites.includes(p)) continue;
    s.status.parasites = s.status.parasites.filter((z) => z !== p);
    emit(c, { type: 'parasiteEnded', side: id(c, s), links: s.status.parasites.length });
  }
}

export function parasiteEffect({ c, e, o, x, onUndo }: EffectContext): void {
  const laid = links(c, x, o, turnsOf(e.tours, 3), sharePct(e.pctlien), linkCount(e.nbliens));
  onUndo(() => {
    if (laid.length) unlink(c, x, laid);
  });
}

// A strike that landed (passive lien_parasite): X % of chances to lay its links on the target.
export function parasiteOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance))
    links(c, d, opponent(c, d), turnsOf(q.tours, 3), sharePct(q.pctlien), linkCount(q.nbliens));
}

// End of its turn: each link of the carrier counts down on its own.
export function parasiteEnd(c: Combat, s: Side): Flow {
  if (!s.status.parasites.length) return undefined;
  unlink(
    c,
    s,
    s.status.parasites.filter((p) => --p.turns <= 0),
  );
  return undefined;
}

export const parasiteTurns = (v: Num): number => turnsOf(v, 3);

// Its effects (the registry of effects.ts).
export const effects = {
  lien_parasite: { run: parasiteEffect },
} satisfies EffectRules;
