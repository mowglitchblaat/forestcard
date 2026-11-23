// The modes of an ultimate, a magic and a trap (November 2026; the engine's
// mechanics/ultimate-modes.ts, magic-modes.ts, trap-modes.ts): a second trigger, a gauge, a second
// phase, despair; a magic that waits, pulses, grows, fades, pays, haunts the opponent…; a trap with
// two conditions, a count, a delay, a re-arming, a chain, a hidden condition. Each panel edits a
// plain object of the fields it sets; the card editor merges it into what it saves.

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  type Catalog,
  clean,
  cleanMulti,
  EffectPicker,
  type Fx,
  MultiPicker,
  ULTIMATE_TRIGGERS,
} from './effect-picker';
import { Choice, Field } from './kit';

export type Modes = Record<string, unknown>;

export const ULTIMATE_MODE_KEYS = [
  'udecl2',
  'udx2',
  'ulogique',
  'jauge',
  'jsource',
  'phase2',
  'desespoir',
] as const;
export const MAGIC_MODE_KEYS = [
  'mdecl',
  'mpulse',
  'mcroit',
  'mconsume',
  'mphase2',
  'mphase2tours',
  'msacpv',
  'msacbonus',
  'maura',
  'mrelais',
  'mparasite',
  'mpartage',
  'minstable',
  'mterrain',
  'mterrainbonus',
  'mverrou',
  'mverroumalus',
] as const;
export const TRAP_MODE_KEYS = [
  'condition2',
  'logique',
  'compte',
  'retard',
  'rearme',
  'enchaine',
  'cache',
] as const;

// The modes stored on an effect.
export function pickModes(
  from: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): Modes {
  const out: Modes = {};
  for (const k of keys) if (from && from[k] !== undefined && from[k] !== null) out[k] = from[k];
  return out;
}

// The modes to save: empty values dropped (a mode left blank is no mode).
export function modesToSave(modes: Modes): Modes {
  const out: Modes = {};
  for (const [k, v] of Object.entries(modes)) {
    if (v === '' || v === null || v === undefined || v === false || v === 0) continue;
    out[k] = v;
  }
  return out;
}

const TERRAINS: [string, string][] = [
  ['orage', 'Orage'],
  ['essaim', 'Essaim'],
  ['foret', 'Forêt Enchantée'],
  ['cathedrale', 'Cathédrale de programmation'],
  ['lune', 'Lune de sang'],
  ['sakura', 'Jardin de sakura'],
  ['grimoire', 'Grimoire ouvert'],
  ['theatre', 'Grand Théâtre'],
];

function NumberField({
  label,
  modes,
  k,
  onChange,
}: {
  label: string;
  modes: Modes;
  k: string;
  onChange: (next: Modes) => void;
}) {
  const v = modes[k];
  return (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        value={v === undefined || v === null ? '' : String(v as number)}
        onChange={(e) =>
          onChange({ ...modes, [k]: e.target.value === '' ? '' : Number(e.target.value) })
        }
        className="w-28"
      />
    </Field>
  );
}

function Toggle({
  label,
  modes,
  k,
  onChange,
}: {
  label: string;
  modes: Modes;
  k: string;
  onChange: (next: Modes) => void;
}) {
  return (
    <Choice>
      <Checkbox
        checked={!!modes[k]}
        onChange={(e) => onChange({ ...modes, [k]: e.target.checked })}
      />{' '}
      {label}
    </Choice>
  );
}

export function UltimateModes({
  modes,
  onChange,
  ultimates,
}: {
  modes: Modes;
  onChange: (next: Modes) => void;
  ultimates: Catalog;
}) {
  return (
    <details className="flex flex-col gap-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">
        Modes de l'ultime (2e déclencheur, jauge, 2e phase, désespoir)
      </summary>
      <div className="mt-2 flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="2e déclencheur">
            <NativeSelect
              value={String(modes.udecl2 ?? '')}
              onChange={(e) => onChange({ ...modes, udecl2: e.target.value })}
              className="w-80"
            >
              <option value="">— aucun —</option>
              {ULTIMATE_TRIGGERS.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <NumberField label="X du 2e" modes={modes} k="udx2" onChange={onChange} />
          <Field label="Les deux ?">
            <NativeSelect
              value={String(modes.ulogique ?? 'ou')}
              onChange={(e) => onChange({ ...modes, ulogique: e.target.value })}
              className="w-56"
            >
              <option value="ou">L'un ou l'autre</option>
              <option value="et">Les deux (dans n'importe quel ordre)</option>
            </NativeSelect>
          </Field>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <NumberField
            label="Jauge : points pour la remplir (vide = aucune)"
            modes={modes}
            k="jauge"
            onChange={onChange}
          />
          <Field label="Remplie par">
            <NativeSelect
              value={String(modes.jsource ?? 'degats_recus')}
              onChange={(e) => onChange({ ...modes, jsource: e.target.value })}
              className="w-56"
            >
              <option value="degats_recus">Les dégâts subis</option>
              <option value="degats_infliges">Les dégâts infligés</option>
              <option value="coups">Ses attaques (1 par attaque)</option>
              <option value="statuts">Les statuts reçus (1 par statut)</option>
            </NativeSelect>
          </Field>
          <NumberField
            label="Désespoir : jusqu'à X % plus fort (PV perdus)"
            modes={modes}
            k="desespoir"
            onChange={onChange}
          />
        </div>
        <Field label="2e phase : effet joué une utilisation sur deux (vide = aucune)">
          <EffectPicker
            catalog={ultimates}
            value={(modes.phase2 as Fx | null) ?? null}
            onChange={(fx) => onChange({ ...modes, phase2: clean(ultimates, fx) })}
          />
        </Field>
      </div>
    </details>
  );
}

export function MagicModes({
  modes,
  onChange,
  magics,
  conditions,
}: {
  modes: Modes;
  onChange: (next: Modes) => void;
  magics: Catalog;
  conditions: Catalog;
}) {
  return (
    <details className="flex flex-col gap-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">
        Comportement de la magie (attente, pulsation, croissance, sacrifice, aura…)
      </summary>
      <div className="mt-2 flex flex-col gap-3">
        <Field label="Attend une condition avant d'agir (vide = agit tout de suite)">
          <EffectPicker
            catalog={conditions}
            value={(modes.mdecl as Fx | null) ?? null}
            onChange={(fx) => onChange({ ...modes, mdecl: clean(conditions, fx) })}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <NumberField
            label="Aura : n'agit que sous X % de PV"
            modes={modes}
            k="maura"
            onChange={onChange}
          />
          <Field label="N'agit que sur le terrain">
            <NativeSelect
              value={String(modes.mterrain ?? '')}
              onChange={(e) => onChange({ ...modes, mterrain: e.target.value })}
              className="w-56"
            >
              <option value="">— tous —</option>
              {TERRAINS.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <NumberField
            label="Bonus sur ce terrain (% , 30 si vide)"
            modes={modes}
            k="mterrainbonus"
            onChange={onChange}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <NumberField
            label="Pulsée : agit à nouveau tous les X tours"
            modes={modes}
            k="mpulse"
            onChange={onChange}
          />
          <NumberField
            label="Grandit de X % par tour"
            modes={modes}
            k="mcroit"
            onChange={onChange}
          />
          <NumberField
            label="Se consume : +X % au début, −X % par tour"
            modes={modes}
            k="mconsume"
            onChange={onChange}
          />
          <NumberField
            label="Instable : X % par tour de changer d'effet"
            modes={modes}
            k="minstable"
            onChange={onChange}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <NumberField
            label="Sacrifice : coûte X % de ses PV"
            modes={modes}
            k="msacpv"
            onChange={onChange}
          />
          <NumberField
            label="… pour +X % de puissance (50 si vide)"
            modes={modes}
            k="msacbonus"
            onChange={onChange}
          />
          <NumberField
            label="Verrouillée : −X % de puissance (25 si vide)"
            modes={modes}
            k="mverroumalus"
            onChange={onChange}
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <Toggle
            label="Parasite (agit contre l'adversaire)"
            modes={modes}
            k="mparasite"
            onChange={onChange}
          />
          <Toggle
            label="Partagée (agit sur les deux)"
            modes={modes}
            k="mpartage"
            onChange={onChange}
          />
          <Toggle
            label="Verrouillée (ni volée, ni annulée, ni détruite)"
            modes={modes}
            k="mverrou"
            onChange={onChange}
          />
          <Toggle
            label="Suit le relais (championnat)"
            modes={modes}
            k="mrelais"
            onChange={onChange}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <NumberField
            label="2e temps : se transforme après X tours (2 si vide)"
            modes={modes}
            k="mphase2tours"
            onChange={onChange}
          />
        </div>
        <Field label="2e temps : nouvel effet (vide = aucun)">
          <MultiPicker
            catalog={magics}
            value={modes.mphase2 ?? null}
            onChange={(v) => onChange({ ...modes, mphase2: cleanMulti(magics, v) })}
          />
        </Field>
      </div>
    </details>
  );
}

export function TrapModes({
  modes,
  onChange,
  conditions,
}: {
  modes: Modes;
  onChange: (next: Modes) => void;
  conditions: Catalog;
}) {
  return (
    <details className="flex flex-col gap-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">
        Modes du piège (2e condition, compteur, retardement, réarmement, chaîne, caché)
      </summary>
      <div className="mt-2 flex flex-col gap-3">
        <Field label="2e condition (vide = aucune)">
          <EffectPicker
            catalog={conditions}
            value={(modes.condition2 as Fx | null) ?? null}
            onChange={(fx) => onChange({ ...modes, condition2: clean(conditions, fx) })}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Les deux ?">
            <NativeSelect
              value={String(modes.logique ?? 'ou')}
              onChange={(e) => onChange({ ...modes, logique: e.target.value })}
              className="w-56"
            >
              <option value="ou">L'une ou l'autre</option>
              <option value="et">Les deux (dans n'importe quel ordre)</option>
            </NativeSelect>
          </Field>
          <NumberField
            label="Compteur : se déclenche à la X-ième fois"
            modes={modes}
            k="compte"
            onChange={onChange}
          />
          <NumberField
            label="Retardement : X tours après"
            modes={modes}
            k="retard"
            onChange={onChange}
          />
          <NumberField
            label="Se réarme X tours après"
            modes={modes}
            k="rearme"
            onChange={onChange}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="En chaîne : déclenche aussi">
            <NativeSelect
              value={String(modes.enchaine ?? '')}
              onChange={(e) => onChange({ ...modes, enchaine: e.target.value })}
              className="w-56"
            >
              <option value="">— rien —</option>
              <option value="ultime">Son ultime</option>
              <option value="magie">Sa magie</option>
            </NativeSelect>
          </Field>
          <Toggle
            label="Condition cachée (« ? » sur la carte)"
            modes={modes}
            k="cache"
            onChange={onChange}
          />
        </div>
      </div>
    </details>
  );
}
