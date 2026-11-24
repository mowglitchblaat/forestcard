// Admin · Cadeaux, the mini-vaults (100-inventaire.sql): give mini-vaults (blue, violet, legendary)
// or drills to a player or to every player, and set what a vault holds: its defense (drawn between two
// values when it is given, secret for the players), how many lots its opening draws, the chance of a
// card of its colour (GGEZ: the legendary one only), and the lots it may give with their weight.

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { PageSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { adminKeys, fetchPlayers } from '@/data/admin';
import {
  fetchAdminLoot,
  giveDrills,
  giveMiniVaults,
  inventoryKeys,
  LOOT_OBJECTS,
  type LootLot,
  type LootObject,
  type LootSettings,
  saveAdminLoot,
  TINT_NAMES,
  type Tint,
} from '@/data/inventory';
import { ICONS } from '@/lib/icons';
import { AdminError, AdminSection, Field, NoticeView, useAction } from './kit';

const TINTS: Tint[] = ['bleu', 'violet', 'or'];
const OBJECT_NAMES: Record<LootObject, string> = {
  gold: 'Gold',
  fragments: 'Fragments',
  fragments_epique: 'Fragments épiques',
  fragments_legendaire: 'Fragments légendaires',
  fragments_ggez: 'Fragments GGEZ',
  booster: 'Booster (au hasard en boutique)',
  foreuse: 'Foreuse',
  perce_abime: 'Perce-Abîme',
};
const CARD_OF: Record<Tint, string> = { bleu: 'rare', violet: 'épique', or: 'légendaire' };

const num = (v: string, min = 0) => Math.max(min, Number(v) || 0);

export function MiniVaultsAdmin() {
  const players = useQuery({ queryKey: adminKeys.players, queryFn: fetchPlayers });
  const loot = useQuery({ queryKey: inventoryKeys.admin, queryFn: fetchAdminLoot });
  const give = useAction();
  const drills = useAction();
  const save = useAction();
  const [to, setTo] = useState('');
  const [tint, setTint] = useState<Tint>('bleu');
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [drillTo, setDrillTo] = useState('');
  const [drillKind, setDrillKind] = useState<'foreuse' | 'perce_abime'>('foreuse');
  const [drillCount, setDrillCount] = useState(5);
  const [settings, setSettings] = useState<LootSettings[]>([]);
  const [lots, setLots] = useState<LootLot[]>([]);
  useEffect(() => {
    if (!loot.data) return;
    setSettings(loot.data.reglages);
    setLots(loot.data.lots);
  }, [loot.data]);

  const error = players.error ?? loot.error;
  if (error) return <AdminError error={error} />;
  if (!players.data || !loot.data) return <PageSkeleton />;
  const who = (id: string) =>
    id ? (players.data.find((p) => p.id === id)?.pseudo ?? '?') : 'tous les joueurs';
  const playerOptions = (
    <>
      <option value="">🎁 Tous les joueurs</option>
      {players.data.map((p) => (
        <option key={p.id} value={p.id}>
          {p.pseudo ?? p.id}
        </option>
      ))}
    </>
  );
  const setRule = (t: Tint, patch: Partial<LootSettings>) =>
    setSettings((list) => list.map((r) => (r.teinte === t ? { ...r, ...patch } : r)));
  const setLot = (i: number, patch: Partial<LootLot>) =>
    setLots((list) => list.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  return (
    <>
      <AdminSection
        title="🧰 Offrir des mini-coffres"
        description={`Ils arrivent dans l'inventaire du joueur (onglet Inventaire), fermés : il les perce avec ses foreuses. Leur défense est tirée au moment du don, et reste secrète. ${loot.data.fermes} coffre(s) fermé(s), ${loot.data.ouverts} ouvert(s) en jeu.`}
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="À qui">
            <NativeSelect value={to} onChange={(e) => setTo(e.target.value)} className="w-56">
              {playerOptions}
            </NativeSelect>
          </Field>
          <Field label="Coffre">
            <NativeSelect
              value={tint}
              onChange={(e) => setTint(e.target.value as Tint)}
              className="w-56"
            >
              {TINTS.map((t) => (
                <option key={t} value={t}>
                  {TINT_NAMES[t]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Combien (chacun)">
            <Input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Math.min(50, num(e.target.value, 1)))}
              className="w-20"
            />
          </Field>
          <Field label="Petit mot (facultatif), montré sur le coffre">
            <Input
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-w-64"
            />
          </Field>
          <HoldButton
            disabled={give.pending}
            onConfirm={() =>
              give.run(async () => {
                const n = await giveMiniVaults(to || null, tint, count, note);
                setNote('');
                return `${n} ${TINT_NAMES[tint].toLowerCase()}${n > 1 ? 's' : ''} offert${n > 1 ? 's' : ''} (${who(to)}).`;
              })
            }
          >
            <ICONS.gifts />
            Offrir
          </HoldButton>
        </div>
        <NoticeView notice={give.notice} />
      </AdminSection>

      <AdminSection
        title="⛏️ Offrir des foreuses"
        description="Hors événement, les joueurs ne peuvent pas en acheter : elles vont dans leur inventaire."
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="À qui">
            <NativeSelect
              value={drillTo}
              onChange={(e) => setDrillTo(e.target.value)}
              className="w-56"
            >
              {playerOptions}
            </NativeSelect>
          </Field>
          <Field label="Objet">
            <NativeSelect
              value={drillKind}
              onChange={(e) => setDrillKind(e.target.value as 'foreuse' | 'perce_abime')}
              className="w-56"
            >
              <option value="foreuse">Foreuse</option>
              <option value="perce_abime">Perce-Abîme</option>
            </NativeSelect>
          </Field>
          <Field label="Combien (chacun)">
            <Input
              type="number"
              min={1}
              value={drillCount}
              onChange={(e) => setDrillCount(num(e.target.value, 1))}
              className="w-20"
            />
          </Field>
          <HoldButton
            disabled={drills.pending}
            onConfirm={() =>
              drills.run(async () => {
                const n = await giveDrills(drillTo || null, drillKind, drillCount);
                return `${drillCount} × ${OBJECT_NAMES[drillKind]} pour ${n} joueur${n > 1 ? 's' : ''}.`;
              })
            }
          >
            <ICONS.drill />
            Offrir
          </HoldButton>
        </div>
        <NoticeView notice={drills.notice} />
      </AdminSection>

      <AdminSection
        title="🎲 Contenu des mini-coffres"
        description="Défense : les foreuses qu'il faut, tirées entre les deux valeurs quand le coffre est donné (une Perce-Abîme en compte plusieurs). Tirages : combien de lots l'ouverture donne, chacun tiré selon son poids (un poids 2 sort deux fois plus qu'un poids 1). La carte et la GGEZ sont tentées en plus, à chaque ouverture."
      >
        {TINTS.map((t) => {
          const r = settings.find((x) => x.teinte === t);
          if (!r) return null;
          const mine = lots.map((l, i) => [l, i] as const).filter(([l]) => l.teinte === t);
          const weight = mine.reduce((n, [l]) => n + l.poids, 0);
          return (
            <div key={t} className="flex flex-col gap-3 rounded-lg border p-3">
              <b>{TINT_NAMES[t]}</b>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Défense min">
                  <Input
                    type="number"
                    min={1}
                    value={r.defense_min}
                    onChange={(e) => setRule(t, { defense_min: num(e.target.value, 1) })}
                    className="w-24"
                  />
                </Field>
                <Field label="Défense max">
                  <Input
                    type="number"
                    min={1}
                    value={r.defense_max}
                    onChange={(e) => setRule(t, { defense_max: num(e.target.value, 1) })}
                    className="w-24"
                  />
                </Field>
                <Field label="Tirages">
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={r.tirages}
                    onChange={(e) => setRule(t, { tirages: Math.min(10, num(e.target.value, 1)) })}
                    className="w-20"
                  />
                </Field>
                <Field label={`Chance d'une carte ${CARD_OF[t]} (%)`}>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={r.chance_carte}
                    onChange={(e) => setRule(t, { chance_carte: num(e.target.value) })}
                    className="w-24"
                  />
                </Field>
                {t === 'or' && (
                  <Field label="Chance d'une GGEZ (%)">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={r.chance_ggez}
                      onChange={(e) => setRule(t, { chance_ggez: num(e.target.value) })}
                      className="w-24"
                    />
                  </Field>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {mine.map(([l, i]) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <Field label="Lot">
                      <NativeSelect
                        value={l.objet}
                        onChange={(e) => setLot(i, { objet: e.target.value as LootObject })}
                        className="w-56"
                      >
                        {LOOT_OBJECTS.filter((o) => t === 'or' || o !== 'fragments_ggez').map(
                          (o) => (
                            <option key={o} value={o}>
                              {OBJECT_NAMES[o]}
                            </option>
                          ),
                        )}
                      </NativeSelect>
                    </Field>
                    <Field
                      label={`Poids (${weight ? Math.round((l.poids / weight) * 100) : 0} % par tirage)`}
                    >
                      <Input
                        type="number"
                        min={1}
                        value={l.poids}
                        onChange={(e) => setLot(i, { poids: num(e.target.value, 1) })}
                        className="w-24"
                      />
                    </Field>
                    <Field label="Quantité min">
                      <Input
                        type="number"
                        min={1}
                        value={l.min}
                        onChange={(e) => setLot(i, { min: num(e.target.value, 1) })}
                        className="w-24"
                      />
                    </Field>
                    <Field label="max">
                      <Input
                        type="number"
                        min={1}
                        value={l.max}
                        onChange={(e) => setLot(i, { max: num(e.target.value, 1) })}
                        className="w-24"
                      />
                    </Field>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Retirer ce lot"
                      onClick={() => setLots((list) => list.filter((_, k) => k !== i))}
                    >
                      <ICONS.delete />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    setLots((list) => [...list, { teinte: t, objet: 'gold', poids: 10, min: 100, max: 500 }])
                  }
                >
                  <ICONS.add />
                  Ajouter un lot
                </Button>
              </div>
            </div>
          );
        })}
        <Button
          disabled={save.pending}
          className="self-start"
          onClick={() =>
            save.run(async () => {
              await saveAdminLoot(settings, lots);
              return 'Contenu des mini-coffres enregistré (les coffres déjà donnés gardent leur défense).';
            })
          }
        >
          <ICONS.save />
          Enregistrer
        </Button>
        <NoticeView notice={save.notice} />
      </AdminSection>
    </>
  );
}
