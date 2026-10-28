// The statuses a card carries, as the overlay shows them (one badge each, under the card): a key and
// a number. For a status with levels the number is its level (I to III); for the others, what tells
// its strength (curses: how many; blades: how many will strike; shield: its HP left; updraft: its
// stacks; fury: its gains; accumulator: its charges, 0 once charged; target mark: strikes left).
// 0 when there is nothing to count (a stun, a contamination, a weakness, a rooting).
// Read by the view (events.ts, SideView.statuses); keys follow the legacy journal keys.

import type { Side } from './state.ts';

export type BadgeKey =
  | 'poison'
  | 'brulure'
  | 'saignement'
  | 'fatigue'
  | 'fracture'
  | 'glas'
  | 'malediction'
  | 'gel'
  | 'etourdi'
  | 'contamination'
  | 'faiblesse'
  | 'foudre'
  | 'lames'
  | 'enracinement'
  | 'brume'
  | 'courant'
  | 'bouclier'
  | 'embrasement'
  | 'fureur'
  | 'sangsue'
  | 'surcharge'
  | 'charge'
  | 'cible';

export type StatusBadge = { readonly key: BadgeKey; readonly n: number };

const highest = (list: { level: number; turns: number }[]): number =>
  list.reduce((m, x) => (x.turns > 0 && x.level > m ? x.level : m), 0);

export function statusBadges(s: Side): StatusBadge[] {
  const st = s.status;
  const out: StatusBadge[] = [];
  const add = (key: BadgeKey, n: number, on = n > 0) => {
    if (on) out.push({ key, n });
  };
  add('poison', highest(st.dots.filter((d) => d.kind === 'poison')));
  add('brulure', highest(st.dots.filter((d) => d.kind !== 'poison')));
  add('saignement', highest(st.bleeds));
  add('fatigue', highest(st.fatigues));
  add('fracture', highest(st.fractures));
  add('glas', st.knell ? st.knell.level : 0);
  add('malediction', st.curses.filter((k) => k.turns > 0).length);
  add('gel', highest(st.frosts));
  add('etourdi', 0, st.stunTurns > 0);
  add('contamination', 0, !!st.contamination && st.contamination.turns > 0);
  add('faiblesse', 0, !!st.weakness && st.weakness.turns > 0);
  add('foudre', st.lightning ? st.lightning.level : 0);
  const blades = st.blades.reduce((q, p) => q + p.blades, 0);
  const rooted = st.rootings.some((r) => r.turns > 0);
  add('lames', blades);
  add('enracinement', 0, rooted);
  add('brume', st.mist && st.mist.turns > 0 ? st.mist.level : 0);
  add('courant', st.updraft && st.updraft.turns > 0 ? st.updraft.stacks : 0);
  add('bouclier', st.shield);
  add('embrasement', 0, !!st.blaze);
  add('fureur', st.fury);
  add('sangsue', 0, st.leechTurns > 0 || s.passives.some((p) => p.type === 'sangsue_toxique'));
  add('surcharge', 0, !!st.overload);
  add('charge', st.voltCharges, st.voltCharges > 0 || st.charged);
  add('cible', st.targeted ? st.targeted.uses : 0, !!st.targeted);
  return out;
}
