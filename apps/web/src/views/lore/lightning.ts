// A lightning event (72-evenement-eclair.sql): where it stands, and the faction it sends. Shared by
// the event's scene (./event-scene.tsx), its card (./page.tsx) and the world map (./world-map.tsx).

import type { EventOption, LoreEvent } from '@/data/lore';

// The faction a vote sends: the most voted option, then the best chance, then the first (as
// evenement_option_gagnante does). Known by the server once resolved.
export function sentOption(e: LoreEvent): EventOption | null {
  const known = e.option_envoyee ?? e.option_gagnante;
  if (known !== null) return e.options.find((o) => o.id === known) ?? null;
  return (
    e.options.reduce<EventOption | null>(
      (best, o) =>
        !best ||
        o.voix > best.voix ||
        (o.voix === best.voix && (o.chance ?? 0) > (best.chance ?? 0))
          ? o
          : best,
      null,
    ) ?? null
  );
}

// Where a lightning event stands at `now`: voting, the faction on its way (0 to 1 of its trip), or
// arrived.
export function lightningPhase(
  e: LoreEvent,
  now: number,
): { phase: 'vote' | 'travel' | 'arrived'; progress: number } {
  // At a number of votes: the faction leaves once the round has them (no end date).
  if (e.seuil_votes !== null) {
    if (e.statut !== 'ouvert') return { phase: 'arrived', progress: 1 };
    if (!e.depart || !e.arrivee) return { phase: 'vote', progress: 0 };
    const left = new Date(e.depart).getTime();
    const there = new Date(e.arrivee).getTime();
    return now < there
      ? { phase: 'travel', progress: (now - left) / Math.max(1, there - left) }
      : { phase: 'arrived', progress: 1 };
  }
  const end = new Date(e.fin).getTime();
  const arrival = e.arrivee ? new Date(e.arrivee).getTime() : end;
  if (e.statut === 'ouvert' && now < end) return { phase: 'vote', progress: 0 };
  if (e.statut === 'ouvert' && now < arrival)
    return { phase: 'travel', progress: (now - end) / Math.max(1, arrival - end) };
  return { phase: 'arrived', progress: 1 };
}
