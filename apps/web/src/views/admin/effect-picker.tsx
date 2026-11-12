// The card editor's effect pickers (the legacy page's mk and mkMulti): an effect chosen in a list
// (passives, ultimates, magics, trap conditions: packages/describe's editor tables), then its values,
// one input per field the entry asks for. The value is the JSON stored on the card: { type, …fields },
// and for several effects { briques: [...] }.

import { EDITOR_FIELDS } from '@forestcard/describe';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { ICONS } from '@/lib/icons';
import { Field } from './kit';

export type Fx = { type: string } & Record<string, unknown>;
// An entry of an editor list: its label, then the fields it asks for.
export type Entry = readonly [string, ...string[]];
export type Catalog = Readonly<Record<string, Entry | undefined>>;

// The words of a choice in a field's list.
const OPTION_LABELS: Record<string, string> = {
  aucun: 'Aucun',
  max: 'PV max de la carte avalée',
  actuels: 'PV actuels de la carte avalée',
  brulure: '🔥 Brûlure',
  gel: '❄️ Gel',
  malediction: '💀 Malédiction',
  poison: '🧪 Poison',
  saignement: '🩸 Saignement',
  fatigue: '💤 Fatigue',
  foudre: '⚡ Foudre (une marque de foudre)',
  aleatoire: '🎲 Aléatoire (un statut au hasard à chaque souffle)',
  pct: '%',
  pts: 'points (unités)',
  aucune: 'Aucune condition : évite la mort une fois',
  pv_max: 'Ses PV max sont au moins égaux au seuil',
  degats_infliges: 'Il a déjà infligé au moins le seuil en dégâts (total)',
};

type FieldSpec = readonly [label: string, input: 'n' | readonly string[]];
const FIELDS = EDITOR_FIELDS as Readonly<Record<string, FieldSpec | undefined>>;

// The beginning of a long label: the list stays as wide as the screen; the whole text shows under it.
function short(text: string): string {
  if (text.length <= 78) return text;
  const cut = text.slice(0, 76);
  const space = cut.lastIndexOf(' ');
  return `${(space > 50 ? cut.slice(0, space) : cut).replace(/[ ,;:(·—-]+$/, '')}…`;
}

// A new effect of a type: its list fields on their first choice, its numbers empty.
function blank(catalog: Catalog, type: string): Fx {
  const fx: Fx = { type };
  for (const key of catalog[type]?.slice(1) ?? []) {
    const input = FIELDS[key]?.[1];
    fx[key] = input && input !== 'n' ? (input[0] ?? '') : null;
  }
  return fx;
}

export function EffectPicker({
  catalog,
  value,
  onChange,
}: {
  catalog: Catalog;
  value: Fx | null;
  onChange: (next: Fx | null) => void;
}) {
  const entry = value ? catalog[value.type] : undefined;
  // A type the list does not know (an effect removed from the editor): shown as none, as the
  // legacy page did.
  const type = entry ? (value?.type ?? '') : '';
  return (
    <div className="flex flex-col gap-2">
      <NativeSelect
        value={type}
        onChange={(e) => onChange(e.target.value ? blank(catalog, e.target.value) : null)}
      >
        <option value="">— Aucun —</option>
        {Object.entries(catalog).map(([key, e]) =>
          e ? (
            <option key={key} value={key} title={e[0]}>
              {short(e[0])}
            </option>
          ) : null,
        )}
      </NativeSelect>
      {entry && entry[0].length > 78 && (
        <span className="text-xs text-muted-foreground">{entry[0]}</span>
      )}
      {entry && value && entry.length > 1 && (
        <div className="flex flex-wrap items-end gap-3">
          {entry.slice(1).map((key) => {
            const spec = FIELDS[key];
            const label = spec?.[0] ?? key;
            const input = spec?.[1] ?? 'n';
            const current = value[key];
            return (
              <Field key={key} label={label}>
                {input === 'n' ? (
                  <Input
                    type="number"
                    step="any"
                    value={typeof current === 'number' ? current : ''}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        [key]: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="w-28"
                  />
                ) : (
                  <NativeSelect
                    value={typeof current === 'string' ? current : (input[0] ?? '')}
                    onChange={(e) => onChange({ ...value, [key]: e.target.value })}
                    className="w-56"
                  >
                    {input.map((o) => (
                      <option key={o} value={o}>
                        {OPTION_LABELS[o] ?? o}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Several effects for one card (passives, a magic's or a trap's effects): none, one, or
// { briques: [...] }.
export type Multi = Fx | { briques: Fx[] } | null;

export const bricksOf = (value: unknown): Fx[] => {
  if (!value || typeof value !== 'object') return [];
  const v = value as { briques?: unknown; type?: unknown };
  if (Array.isArray(v.briques))
    return (v.briques as unknown[]).filter(
      (b): b is Fx => !!b && typeof b === 'object' && typeof (b as Fx).type === 'string',
    );
  return typeof v.type === 'string' ? [v as Fx] : [];
};

export const fromBricks = (list: Fx[]): Multi =>
  list.length === 0 ? null : list.length === 1 ? (list[0] ?? null) : { briques: list };

export function MultiPicker({
  catalog,
  value,
  onChange,
  addLabel = '+ Ajouter un effet',
  removeLabel = '✕ Retirer cet effet',
}: {
  catalog: Catalog;
  value: unknown;
  onChange: (next: Multi) => void;
  addLabel?: string;
  removeLabel?: string;
}) {
  // The pickers, an empty one included: kept here, the value only holds the chosen effects. Each
  // has its own id, so removing one keeps the others as they are.
  type Slot = { id: number; fx: Fx | null };
  const [list, setList] = useState<Slot[]>(() => {
    const bricks: (Fx | null)[] = bricksOf(value);
    if (!bricks.length) bricks.push(null);
    return bricks.map((fx, id) => ({ id, fx }));
  });
  const [nextId, setNextId] = useState(list.length);
  const update = (next: Slot[]) => {
    setList(next);
    onChange(fromBricks(next.map((s) => s.fx).filter((b): b is Fx => b !== null)));
  };
  return (
    <div className="flex flex-col gap-3">
      {list.map((slot) => (
        <div key={slot.id} className="flex flex-col gap-2 border-l-2 border-primary/40 pl-3">
          <EffectPicker
            catalog={catalog}
            value={slot.fx}
            onChange={(fx) => update(list.map((s) => (s.id === slot.id ? { ...s, fx } : s)))}
          />
          {list.length > 1 && (
            <div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => update(list.filter((s) => s.id !== slot.id))}
              >
                {removeLabel}
              </Button>
            </div>
          )}
        </div>
      ))}
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            update([...list, { id: nextId, fx: null }]);
            setNextId(nextId + 1);
          }}
        >
          <ICONS.add />
          {addLabel.replace(/^\+ /, '')}
        </Button>
      </div>
    </div>
  );
}

// When an ultimate starts, besides "after N turns" and "when a trap goes off" (udecl, with its X in
// udx): checked at the start of its turn, before its attack.
export const ULTIMATE_TRIGGERS: [string, string][] = [
  ['pv_sous', 'Quand il passe sous X % de ses PV (X = 50 par défaut)'],
  ['adv_pv_sous', "Quand l'adversaire passe sous X % de PV (X = 50 par défaut)"],
  ['coups_recus', "Toutes les X attaques de l'adversaire"],
  ['attaques', "Toutes les X attaques qu'il fait"],
  ['coup_fort', 'Quand il subit au moins X dégâts en un coup'],
  ['statut', 'Quand il reçoit un statut (brûlure, poison, gel, malédiction…)'],
  ['esquive', 'Quand il esquive'],
  ['bloque', 'Quand il bloque une attaque'],
  ['soigne', 'Quand il est soigné'],
  ['son_piege', 'Quand son piège se déclenche'],
  ['piege_adv', 'Quand le piège adverse se déclenche'],
  ['adv_ultime', "Quand l'adversaire lance son ultime"],
  ['adv_soigne', "Quand l'adversaire est soigné"],
  ['adv_statut', "Quand l'adversaire reçoit un statut (brûlure, poison, gel, malédiction…)"],
  ['adv_esquive', "Quand l'adversaire esquive"],
  ['adv_bloque', "Quand l'adversaire bloque une attaque"],
  ['inflige_coup_fort', 'Quand il inflige au moins X dégâts en un coup'],
  ['purifie', 'Quand il est purifié'],
  ['adv_purifie', "Quand l'adversaire est purifié"],
  ['evite_mort', 'Quand il évite la mort'],
  ['adv_evite_mort', "Quand l'adversaire évite la mort"],
  ['reanime', 'Quand il est réanimé'],
  ['adv_reanime', "Quand l'adversaire est réanimé"],
  ['atq_baisse', "Quand son ATQ baisse (malédiction, fatigue, vol d'ATQ…)"],
  ['adv_atq_baisse', "Quand l'ATQ de l'adversaire baisse"],
  ['pvmax_baisse', 'Quand ses PV max baissent (calcination…)'],
];

// An effect with only its type and the fields its entry asks for (what the legacy page read back
// from its form): extra keys left by another type, or set apart (an ultimate's trigger), dropped.
export function clean(catalog: Catalog, fx: Fx | null): Fx | null {
  if (!fx) return null;
  const entry = catalog[fx.type];
  if (!entry) return null;
  const out: Fx = { type: fx.type };
  for (const key of entry.slice(1)) out[key] = fx[key] ?? null;
  return out;
}

export const cleanMulti = (catalog: Catalog, value: unknown): Multi =>
  fromBricks(
    bricksOf(value)
      .map((b) => clean(catalog, b))
      .filter((b): b is Fx => b !== null),
  );
