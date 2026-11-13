// Threads and control (fils, contrôle), November 2026.
//
//   - Threads are laid on the opposing fighter: by an effect (fils: ultimate, magic, trap; `nbfils`
//     at once), by a passive (X % of chances on each strike that lands, LAID_ON_HIT) or by the
//     basic attack (atk_fils). Several sources of the attack add their chances up. Threads are
//     marks, not statuses: a purification, a mist or a molt leaves them.
//   - From filsSeuil threads (5), each laying gives one chance to take control of the card: the
//     control chance of the laying (`pctctrl`, 20 when empty), plus filsPas (15) per thread beyond
//     the threshold. No draw while a control is already running, when its player has no fighter
//     left to send (relay: the last one; normal combat: no fighter of its deck not played yet), nor
//     when the puppeteer could not pay its first turn.
//   - The control is taken at the end of the turn under way. The puppet changes sides and fights
//     for the puppeteer, alone: the puppeteer's magic and trap stay in place, idle, and the puppet's
//     own are left behind. The puppeteer leaves the field (its statuses wait), and pays filsCout %
//     (10) of its max HP at the start of each turn of its side. The opponent sends another fighter,
//     at full HP, with a new magic and trap (as a relay entry); in a relay, the puppet does not count
//     among the puppeteer's fighters.
//   - The control ends when the puppet falls (it is broken, lost for its player), when the
//     puppeteer cannot pay (the cost never kills: it plays that turn itself), or with the combat. The
//     puppeteer comes back; the fighter the opponent sent stays. A puppet still standing goes back to
//     its player: in a relay, back to its reserve with the HP it has left; in a normal combat, out of
//     the combat. Its threads are gone.

import { emit, flush, handOver, id, inPlay, roll, round, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Side } from '../combat/state.ts';
import type { ControlEndReason } from '../events.ts';
import type { Card, EffectData, Num } from '../model/card.ts';
import { terrainControl } from './terrain.ts';

// Its part of a card's status (combat/state.ts): the threads it carries, and the control chance of
// the last laying.
export type ThreadsState = { threads: number; threadControl: number };
export const threadsState = (): ThreadsState => ({ threads: 0, threadControl: 20 });

// A running control: the puppeteer off the field, the puppet on its side, and what the puppet had
// of its own (given back when it leaves).
export type Control = {
  side: number; // the puppeteer's side
  from: number; // the puppet's player
  puppeteer: Side;
  puppet: Side;
  own: Pick<Side, 'pseudo' | 'deck' | 'dos' | 'magic' | 'trap' | 'magicActive' | 'trapActive'>;
};

// What the combat (simulate.ts, relay.ts) provides: whether a player can send another fighter, the
// fighter it sends, what follows its entry, and where a puppet still standing goes back.
export type ControlHost = {
  canReplace: (i: number) => boolean;
  replace: (i: number) => Side;
  entered: (i: number, s: Side) => void;
  giveBack: (i: number, puppet: Side) => void;
};

// Threads laid at once (`nbfils`, 1 when empty).
export const threadCount = (v: Num): number => Math.max(1, parseInt(String(v), 10) || 1);
// Control chance at the threshold (`pctctrl`, 20 when empty).
export const controlPct = (v: Num): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(100, n) : 20;
};

// The cost of a turn of control for the puppeteer p.
const costOf = (c: Combat, p: Side): number =>
  Math.max(1, round((p.maxHp * c.levels.filsCout) / 100));

// Whether the opponent of m could take control of it now: its player can send another fighter, and
// the puppeteer can pay at least one turn.
function canControl(c: Combat, m: Side): boolean {
  const host = c.controlHost;
  const from = id(c, m);
  const p = c.sides[1 - from];
  return !!host && !!p && p.hp > costOf(c, p) && host.canReplace(from);
}

// Lays `count` threads on d. From the threshold on, one draw to take control (at the end of the
// turn under way), unless `draw` is false (the grand theatre's threads: they only add up).
export function layThreads(c: Combat, d: Side, count: number, pct: number, draw = true): void {
  if (d.hp <= 0 || count <= 0 || !inPlay(c, d)) return;
  const st = d.status;
  st.threads += count;
  if (draw) st.threadControl = pct;
  const of = c.levels.filsSeuil;
  emit(c, { type: 'threadsLaid', side: id(c, d), count, threads: st.threads, of });
  if (!draw || st.threads < of || c.control || c.pendingControl) return;
  if (!canControl(c, d)) return;
  const chance = Math.min(
    100,
    pct + c.levels.filsPas * (st.threads - of) + terrainControl(c, d), // the grand theatre
  );
  if (roll(c, chance)) c.pendingControl = d;
}

// Effect fils: lays its threads on the opponent.
export function threadsEffect({ c, e, x }: EffectContext): void {
  layThreads(c, x, threadCount(e.nbfils), controlPct(e.pctctrl));
}

// A strike that landed (passive fils, or atk_fils): X % of chances to lay its threads on the target.
export function threadsOnHit(c: Combat, q: EffectData, d: Side): void {
  if (roll(c, q.chance)) layThreads(c, d, threadCount(q.nbfils), controlPct(q.pctctrl));
}

// End of a turn (simulate.ts, relay.ts): a control drawn during the turn is taken now, if its card
// is still up and its player can still send a fighter. Returns whether it was taken.
export function takeControl(c: Combat): boolean {
  const m = c.pendingControl;
  c.pendingControl = null;
  const host = c.controlHost;
  if (!m || !host || c.control || m.hp <= 0 || !inPlay(c, m) || !canControl(c, m)) return false;
  const from = id(c, m);
  const side = 1 - from;
  const p = c.sides[side] as Side;
  const threads = m.status.threads;
  const own = {
    pseudo: m.pseudo,
    deck: m.deck,
    dos: m.dos,
    magic: m.magic,
    trap: m.trap,
    magicActive: m.magicActive,
    trapActive: m.trapActive,
  };
  const r = host.replace(from);
  // the puppet fights alone, under the puppeteer's name; the puppeteer's magic and trap stay in
  // place, idle until it is back
  m.pseudo = p.pseudo;
  m.deck = p.deck;
  m.dos = p.dos;
  m.magic = p.magic;
  m.trap = p.trap;
  m.magicActive = 0;
  m.trapActive = 0;
  m.status.threads = 0;
  c.control = { side, from, puppeteer: p, puppet: m, own };
  c.sides[side] = m;
  c.sides[from] = r;
  handOver(c, m, [p]);
  emit(c, { type: 'controlTaken', side, from, puppet: m.fighter, threads });
  host.entered(from, r);
  return true;
}

// Start of a turn of the puppeteer's side: it pays the threads, or lets go (and plays that turn).
export function payControl(c: Combat, i: number): void {
  const k = c.control;
  if (!k || k.side !== i) return;
  const p = k.puppeteer;
  const amount = costOf(c, p);
  if (p.hp <= amount) {
    endControl(c, 'unpaid');
    return;
  }
  p.hp -= amount;
  emit(c, {
    type: 'puppeteerPaid',
    side: i,
    puppeteer: p.fighter,
    amount,
    hp: p.hp,
    maxHp: p.maxHp,
  });
}

// Ends the running control: the puppeteer is back on its side.
export function endControl(c: Combat, reason: ControlEndReason): Side | null {
  const k = c.control;
  if (!k) return null;
  c.control = null;
  const { side, from, puppeteer: p, puppet: m, own } = k;
  Object.assign(m, own);
  m.status.threads = 0;
  c.sides[side] = p;
  handOver(c, p, [m]);
  const r = c.sides[from] as Side;
  if (r.hp > 0) handOver(c, r, [m]);
  emit(c, { type: 'controlEnded', side, from, puppet: m.fighter as Card, reason });
  if (reason !== 'defeated' && m.hp > 0) c.controlHost?.giveBack(from, m);
  return p;
}

// A fallen puppet (combat.ts: standIn, over): what was pending first (a revive), then, if it is
// still down, the control ends and the puppeteer takes its place. Returns who is on its side now.
export function puppetFell(c: Combat, s: Side): Side {
  if (!c.control || c.control.puppet !== s || s.hp > 0) return s;
  flush(c);
  if (s.hp > 0 || !c.control || c.control.puppet !== s) return s;
  return endControl(c, 'defeated') ?? s;
}

// Its effects (the registry of effects.ts).
export const effects = {
  fils: { run: threadsEffect },
} satisfies EffectRules;
