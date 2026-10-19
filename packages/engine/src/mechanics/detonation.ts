// Detonation, and the defenses against breaths and missiles.
//
// Detonation (legacy: detoner): consumes the target's burn, poison and bleed and deals at once all
// the damage they had left (a share `conso`, 100 % by default), plus a bonus (`bonus` %, 50 by
// default), plus raw damage (`val`, never reduced). A solidified target takes half of the status
// part. The detonator takes `recul` % of the damage dealt (blast). A card killed by a detonation
// cannot be revived (c.noRevive). The statuses are always purged.
//
// (Breaths and missiles are defended like an attack: mechanics/dodge.ts, block.ts, reflect.ts.)

import type { Attack } from '../combat/attack.ts';
import { emit, id, over, raw, roll, round, type Combat } from '../combat/combat.ts';
import { damage } from '../combat/damage.ts';
import type { EffectContext, EffectRules } from '../combat/effect-context.ts';
import { applyEffect } from '../combat/effects.ts';
import type { StrikeFlow } from '../combat/flow.ts';
import type { Side } from '../combat/state.ts';
import type { EffectData } from '../model/card.ts';
import { ELEMENTS, elementStatus } from './breath.ts';
import { dodges } from './dodge.ts';
import { reflectTotal } from './reflect.ts';

// Damage taken from a detonation or a missile: a card it kills cannot be revived. The flag is set
// then cleared, not restored, as in the legacy engine.
export function detonationDamage(c: Combat, src: Side, dst: Side, n: number): number {
  c.noRevive = 1;
  try {
    return damage(c, src, dst, n);
  } finally {
    c.noRevive = 0;
  }
}

// silent: nothing to detonate is not announced (attack detonation, missiles); missile: the
// explosion of a missile. Returns the damage dealt, or undefined when nothing exploded.
export function detonate(
  c: Combat,
  o: Side,
  t: Side,
  q: EffectData,
  silent?: boolean,
  missile?: boolean,
): number | undefined {
  if (t.hp <= 0) return undefined;
  const z = t.status;
  const parts: ('brulure' | 'poison' | 'saignement')[] = [];
  let total = 0;
  const consumed = q.conso == null || q.conso === '' ? 100 : Math.max(0, +raw(q.conso) || 0);
  z.dots.forEach((d) => {
    total += (d.amount || 0) * Math.max(0, d.turns);
    parts.push(d.kind === 'poison' ? 'poison' : 'brulure');
  });
  z.bleeds.forEach((b) => {
    total += round((t.maxHp * (b.pct || 0)) / 100) * Math.max(0, b.turns);
    parts.push('saignement');
  });
  if (consumed !== 100) total = round((total * consumed) / 100);
  const bonus = q.bonus == null || q.bonus === '' ? 50 : +raw(q.bonus) || 0;
  const rawDamage = Math.max(0, +raw(q.val) || 0);
  if (!parts.length && !rawDamage) {
    if (!silent) emit(c, { type: 'detonationEmpty', side: id(c, t) });
    return undefined;
  }
  z.dots = [];
  z.bleeds = [];
  emit(c, {
    type: 'detonated',
    side: id(c, t),
    from: id(c, o),
    parts,
    explosion: missile ? 'missile' : 'detonation',
  });
  parts.forEach((status) => emit(c, { type: 'statusExploded', side: id(c, t), status }));
  let n0 = round(total * (1 + bonus / 100));
  if (t.status.solidTurns > 0 && n0 > 0) {
    n0 = round(n0 / 2);
    emit(c, { type: 'detonationDampened', side: id(c, t) });
  }
  n0 += rawDamage;
  const n = detonationDamage(c, o, t, n0);
  emit(c, {
    type: 'damaged',
    side: id(c, t),
    amount: n,
    cause: missile ? 'missile' : 'detonation',
  });
  // Blast: the detonator takes a share of the explosion.
  const blast = Math.max(0, +raw(q.recul) || 0);
  if (blast > 0 && o !== t && o.hp > 0) {
    const b = detonationDamage(c, t, o, round((n * blast) / 100));
    if (b > 0) emit(c, { type: 'damaged', side: id(c, o), amount: b, cause: 'blast' });
  }
  return n;
}

// Detonation BEFORE the strike's new statuses: it consumes those already laid.
export function detonationOnHit(c: Combat, { a, d }: Attack): StrikeFlow {
  for (const q of [...a.passives, ...a.status.attackEffects])
    if (
      q.type === 'detonation' &&
      d.hp > 0 &&
      roll(c, q.chance == null || q.chance === '' ? 100 : +q.chance)
    )
      detonate(c, a, d, q, true);
  if (d.hp <= 0 || a.hp <= 0 || over(c)) return 'stop';
  return undefined;
}

// Effect detonation, on its status target.
export function detonationEffect({ c, e, o, statusTarget }: EffectContext): void {
  detonate(c, o, statusTarget(), e);
}

// Effect missiles.
export function missilesEffect({ c, e, o, x, fromMagic, returning }: EffectContext): void {
  missiles(c, e, o, x, fromMagic, returning);
}

// Missiles: N missiles (`frappes`, 3 by default). Each one explodes (a detonation: raw damage `val`
// plus the target's consumed statuses, bonus, blast), then may lay a status (`mstatut`, drawn for
// each missile if `aleatoire`) that the next missile will blow up.
// Dodged, it explodes beside the target: both cards take the blast (`val` x `recul` %). Blocked, it
// does not explode, its status still applies. Reflected, it flies back and explodes on its shooter.
function missiles(
  c: Combat,
  e: EffectData,
  o: Side,
  x: Side,
  fromMagic: boolean | undefined,
  returning: boolean | undefined,
): void {
  const N = Math.max(1, parseInt(String(e.frappes), 10) || 3);
  for (let k = 1; k <= N && x.hp > 0 && o.hp > 0; k++) {
    emit(c, {
      type: 'missileFired',
      side: id(c, x),
      from: id(c, o),
      index: k,
      of: N,
      returned: false,
    });
    if (dodges(c, x)) {
      emit(c, { type: 'missileDodged', side: id(c, x) });
      const blast = round((Math.max(0, +raw(e.val) || 0) * Math.max(0, +raw(e.recul) || 0)) / 100);
      if (blast > 0) {
        emit(c, {
          type: 'detonated',
          side: id(c, x),
          from: id(c, o),
          parts: [],
          explosion: 'missileBeside',
        });
        for (const [s, v] of [
          [o, x],
          [x, o],
        ] as const) {
          if (v.hp <= 0) continue;
          const b = detonationDamage(c, s, v, blast);
          if (b > 0) emit(c, { type: 'damaged', side: id(c, v), amount: b, cause: 'blast' });
        }
      }
      if (over(c)) break;
      continue;
    }
    const blocked = o.status.nextAttackBlocked > 0;
    let n = 0;
    if (blocked) {
      o.status.nextAttackBlocked = 0;
      emit(c, { type: 'missileBlocked', side: id(c, x), by: id(c, o) });
    } else n = detonate(c, o, x, e, true, true) || 0;
    if (n > 0 && o.hp > 0) {
      const back = reflectTotal(x, n);
      if (back > 0) {
        emit(c, {
          type: 'missileFired',
          side: id(c, o),
          from: id(c, x),
          index: k,
          of: N,
          returned: true,
        });
        const b = detonationDamage(c, x, o, back);
        emit(c, {
          type: 'detonated',
          side: id(c, o),
          from: id(c, x),
          parts: [],
          explosion: 'missileReturned',
        });
        if (b > 0)
          emit(c, { type: 'damaged', side: id(c, o), amount: b, cause: 'missileReturned' });
      }
    }
    if (o.hp <= 0 || over(c)) break;
    const element =
      e.mstatut === 'aleatoire'
        ? (ELEMENTS[Math.floor(c.random() * ELEMENTS.length)] as string)
        : ELEMENTS.includes(e.mstatut as string)
          ? (e.mstatut as string)
          : null;
    if (element && x.hp > 0) {
      const chance = e.chance == null || e.chance === '' ? 100 : +e.chance || 0;
      if (roll(c, chance)) applyEffect(c, elementStatus(element, e), o, x, fromMagic, returning);
    }
    if (over(c)) break;
  }
}

// Its effects (the registry of effects.ts).
export const effects = {
  detonation: { run: detonationEffect },
  missiles: { run: missilesEffect },
} satisfies EffectRules;
