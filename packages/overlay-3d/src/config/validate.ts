// A rarity's configuration coming as JSON (the page's editor, tomorrow the database) is checked here:
// the compiler cannot see it. Every error names its path (`burst[2].count`), so the person editing knows
// what to fix. A parameter is checked against its effect's default: same type, same length for a list.

import { easing, type Easing } from '../engine/time.ts';
import { fxDef, isFxName } from '../fx/registry.ts';
import { isRevealShaderName, revealShaderDef } from '../reveal/registry.ts';
import type { RarityConfig } from './types.ts';

export type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const kindOf = (v: unknown) => (Array.isArray(v) ? `list of ${v.length}` : typeof v);

// value must look like `like` (a default): number, string, boolean, or a list of numbers of the same length
function sameShape(value: unknown, like: unknown): boolean {
  if (Array.isArray(like))
    return Array.isArray(value) && value.length === like.length && value.every(isNum);
  return typeof value === typeof like && (typeof like !== 'number' || isNum(value));
}

function checkEasing(v: unknown, path: string, errors: string[]): void {
  if (v === undefined) return;
  try {
    if (typeof v !== 'string') throw new Error();
    easing(v as Easing);
  } catch {
    errors.push(
      `${path} : courbe inconnue (linear, smooth, in-out-quad, out-cubic, out-back, in-<puissance>)`,
    );
  }
}

function checkParams(
  o: Obj,
  defaults: Readonly<Record<string, unknown>>,
  skip: readonly string[],
  path: string,
  errors: string[],
): void {
  for (const [k, v] of Object.entries(o)) {
    if (skip.includes(k)) continue;
    if (!Object.hasOwn(defaults, k))
      errors.push(
        `${path}.${k} : paramètre inconnu (connus : ${Object.keys(defaults).join(', ')})`,
      );
    else if (!sameShape(v, defaults[k]))
      errors.push(`${path}.${k} : attendu ${kindOf(defaults[k])}, reçu ${kindOf(v)}`);
  }
}

function checkEntries(list: unknown, path: string, errors: string[]): void {
  if (list === undefined) return;
  if (!Array.isArray(list)) {
    errors.push(`${path} : attendu une liste d'effets`);
    return;
  }
  list.forEach((e: unknown, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(e) || typeof e['fx'] !== 'string')
      return void errors.push(`${p} : attendu { fx: "<nom>", … }`);
    if (!isFxName(e['fx'])) return void errors.push(`${p}.fx : effet inconnu "${e['fx']}"`);
    if (e['delay'] !== undefined && !isNum(e['delay']))
      errors.push(`${p}.delay : attendu un nombre (ms)`);
    checkParams(e, fxDef(e['fx']).defaults, ['fx', 'delay'], p, errors);
  });
}

function checkOneReveal(r: unknown, path: string, errors: string[]): void {
  if (!isObj(r)) return void errors.push(`${path} : attendu un objet`);
  if (!isNum(r['duration']) || r['duration'] < 0)
    errors.push(`${path}.duration : attendu un nombre de ms`);
  checkEasing(r['ease'], `${path}.ease`, errors);
  if (r['kind'] === 'flip') {
    for (const k of ['halfTurns', 'lift'] as const)
      if (r[k] !== undefined && !isNum(r[k])) errors.push(`${path}.${k} : attendu un nombre`);
    checkEntries(r['after'], `${path}.after`, errors);
    return;
  }
  if (r['kind'] !== 'shader') return void errors.push(`${path}.kind : "flip" ou "shader"`);
  const shader = r['shader'];
  if (typeof shader !== 'string' || !isRevealShaderName(shader))
    return void errors.push(`${path}.shader : révélation inconnue "${String(shader)}"`);
  const origin = r['origin'];
  if (
    origin !== undefined &&
    origin !== 'random' &&
    origin !== 'edge' &&
    !(Array.isArray(origin) && origin.length === 2 && origin.every(isNum))
  ) {
    errors.push(`${path}.origin : "random", "edge" ou [x, y] entre 0 et 1`);
  }
  if (
    r['burstAt'] !== undefined &&
    !(isNum(r['burstAt']) && r['burstAt'] >= 0 && r['burstAt'] <= 1)
  )
    errors.push(`${path}.burstAt : attendu un nombre entre 0 et 1`);
  const a = r['anticipation'];
  if (
    a !== undefined &&
    !(isObj(a) && isNum(a['duration']) && isNum(a['shake']) && isNum(a['swell']))
  ) {
    errors.push(`${path}.anticipation : attendu { duration, shake, swell }`);
  }
  if (r['params'] !== undefined) {
    if (!isObj(r['params'])) errors.push(`${path}.params : attendu un objet`);
    else checkParams(r['params'], revealShaderDef(shader).defaults, [], `${path}.params`, errors);
  }
}

// One reveal, or a non-empty list of variants (each checked under its index: reveal[1].duration).
function checkReveal(r: unknown, errors: string[]): void {
  if (!Array.isArray(r)) return checkOneReveal(r, 'reveal', errors);
  if (!r.length) return void errors.push('reveal : une liste de variantes ne peut pas être vide');
  r.forEach((v: unknown, i) => checkOneReveal(v, `reveal[${i}]`, errors));
}

export function checkRarity(value: unknown): Checked<RarityConfig> {
  const errors: string[] = [];
  if (!isObj(value)) return { ok: false, errors: ['attendu un objet'] };
  if (typeof value['name'] !== 'string') errors.push('name : attendu un texte');
  if (typeof value['colour'] !== 'string') errors.push('colour : attendu une couleur ("#rrggbb")');
  if (value['rainbow'] !== undefined && typeof value['rainbow'] !== 'boolean')
    errors.push('rainbow : attendu true ou false');
  if (value['ambient'] === undefined)
    errors.push('ambient : attendu une liste (vide si aucun effet)');
  checkEntries(value['ambient'], 'ambient', errors);
  if (value['burst'] === undefined) errors.push('burst : attendu une liste (vide si aucun effet)');
  checkEntries(value['burst'], 'burst', errors);
  checkReveal(value['reveal'], errors);
  for (const k of Object.keys(value))
    if (!['name', 'colour', 'rainbow', 'ambient', 'reveal', 'burst'].includes(k))
      errors.push(`${k} : clé inconnue`);
  return errors.length ? { ok: false, errors } : { ok: true, value: value as RarityConfig };
}
