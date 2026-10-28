// Breath (souffle): damage (`val`, reduced like an attack, reflected), then with its chance a status
// (`statut`; `aleatoire`: drawn for each breath). Then, with `rechance` %, another breath, until the
// first failure, `remax` more at most (3 by default). Dodged: neither damage nor status. Blocked
// (blocked attack): no damage, the status still applies.

import { damage } from '../combat/damage.ts';
import { emit, id, over, raw, roll } from '../combat/combat.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import { applyEffect } from '../combat/effects.ts';
import type { EffectData } from '../model/card.ts';
import { blockedShot, reduce, riposte } from './block.ts';
import { dodges } from './dodge.ts';
import { reflect } from './reflect.ts';

// The statuses a breath or a missile can lay, as the effect that lays it.
export const ELEMENTS = ['brulure', 'gel', 'malediction', 'poison', 'saignement', 'fatigue'];
// A leveled status takes the breath's level (`niveau`); a breath saved before the rework gives its
// value (`sval`), read as the old value of that status (model/levels.ts).
export const elementStatus = (element: string, e: EffectData): EffectData => {
  const v = +raw(e.sval) || 0;
  const niveau = e.niveau;
  const turns = Math.max(1, parseInt(String(e.tours), 10) || 2);
  const statuses: Record<string, EffectData> = {
    brulure: { type: 'brulure_effet', ciblem: 'adversaire', niveau, pctpv: v, tours: turns },
    gel: { type: 'gel', ciblem: 'adversaire', annul: v, tours: turns },
    malediction: { type: 'malediction', ciblem: 'adversaire', tours: turns },
    poison: { type: 'poison_effet', ciblem: 'adversaire', niveau, degtour: v, tours: turns },
    saignement: { type: 'saignement', ciblem: 'adversaire', niveau, pctpv: v, tours: turns },
    fatigue: { type: 'fatigue', ciblem: 'adversaire', niveau, fatval: v, fattours: turns },
  };
  return statuses[element] as EffectData;
};

export function breathEffect({ c, e, o, x, fromMagic, returning }: EffectContext): void {
  // One breath; then, with `rechance` %, another, until the first failure, `remax` more at most
  // (3 by default). Status `aleatoire`: drawn again for each breath.
  const breathe = (index: number) => {
    const element =
      e.statut === 'aleatoire'
        ? (ELEMENTS[Math.floor(c.random() * ELEMENTS.length)] as string)
        : ELEMENTS.includes(e.statut as string)
          ? (e.statut as string)
          : 'brulure';
    emit(c, { type: 'breathed', side: id(c, o), target: id(c, x), element, index });
    // Dodged: neither damage nor status.
    if (dodges(c, x)) {
      emit(c, { type: 'breathDodged', side: id(c, x) });
      return;
    }
    // Blocked: no damage, the status still applies.
    const shot = blockedShot(o);
    const blocked = !!shot;
    if (shot) {
      emit(c, { type: 'breathBlocked', side: id(c, x), by: id(c, o) });
      riposte(c, x, o, +raw(e.val) || 0, shot.riposte);
      if (o.hp <= 0) return;
    }
    if (+raw(e.val) > 0 && !blocked) {
      const n = damage(c, o, x, reduce(c, x, +raw(e.val)));
      emit(c, { type: 'damaged', side: id(c, x), amount: n, cause: 'breath' });
      reflect(c, x, o, n); // the reflect only sends back damage
    }
    if (x.hp > 0) {
      const chance = e.chance == null || e.chance === '' ? 100 : +e.chance || 0;
      if (roll(c, chance)) applyEffect(c, elementStatus(element, e), o, x, fromMagic, returning);
      else emit(c, { type: 'breathResisted', side: id(c, x), chance });
    }
  };
  breathe(1);
  const again = +raw(e.rechance) || 0;
  const most =
    e.remax == null || e.remax === '' ? 3 : Math.max(0, parseInt(String(e.remax), 10) || 0);
  if (again > 0)
    for (let k = 2; k <= most + 1 && x.hp > 0 && o.hp > 0 && !over(c); k++) {
      if (!roll(c, again)) break;
      breathe(k);
    }
}

// Its effects (the registry of effects.ts).
export const effects = {
  souffle: { run: breathEffect },
} satisfies EffectRules;
