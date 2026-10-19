// Solidification: immune to stun for X of the opponent's turns. Not purged; a fracture breaks it. A
// stun already running stays.
//
// Laid by: a passive (a draw at the start of each of its turns, when not solid), an effect
// (solidification).

import { emit, id, opponent, roll, type Combat } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import type { Flow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { Num } from '../model/card.ts';

// Its part of a card's status (combat/state.ts).
export type SolidificationState = {
  solidTurns: number;
};
export const solidificationState = (): SolidificationState => ({ solidTurns: 0 });

export function solidify(c: Combat, s: Side, chance: Num, turnsIn: Num): boolean {
  const turns = Math.max(1, parseInt(String(turnsIn), 10) || 1);
  if (!roll(c, chance)) return false;
  s.status.solidTurns = Math.max(s.status.solidTurns, turns);
  emit(c, { type: 'solidified', side: id(c, s), turns });
  return true;
}

// Start of its turn: the passive draws.
export function solidificationAtStart(c: Combat, s: Side): Flow {
  s.passives.forEach((p) => {
    if (p.type === 'solidification' && !(s.status.solidTurns > 0))
      solidify(c, s, p.chance == null || p.chance === '' ? 100 : +p.chance || 0, p.tours);
  });
  return undefined;
}

// End of a card's turn: the OPPONENT's solidification counts it (it protects during the
// opponent's turns). Then nothing more for a card down.
export function opponentSolidification(c: Combat, s: Side): Flow {
  const x = opponent(c, s);
  if (x.status.solidTurns > 0 && --x.status.solidTurns === 0)
    emit(c, { type: 'statusEnded', side: id(c, x), status: 'solid' });
  if (s.hp <= 0) return 'stop';
  return undefined;
}

export function solidificationEffect({ c, e, o, fromMagic, statusEnds }: EffectContext): void {
  const chance = e.chance == null || e.chance === '' ? 100 : +e.chance || 0;
  if (solidify(c, o, chance, e.tours) && fromMagic)
    o.magicDeltas.push({
      undo: () => {
        if (o.status.solidTurns > 0) {
          o.status.solidTurns = 0;
          statusEnds(o, 'solid');
        }
      },
    });
}

// Its effects (the registry of effects.ts).
export const effects = {
  solidification: { run: solidificationEffect },
} satisfies EffectRules;
