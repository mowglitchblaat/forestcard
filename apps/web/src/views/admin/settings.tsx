// Admin · Réglages (the legacy page's aReglages): the game switch (live, paused on the site, closed),
// the belts' bonus lock, the championship tools (vacate a belt, clear warnings), the combats' speed and daily limits, the status levels read by the edge
// function, the combats' gains and the Bounty event, recycling and exchange prices, and the storage
// clean-up. Every value lives in reglages_jeu (key → text), read by swift-responder and the overlay.
//
// Not ported: the one-time WebP conversion of the images already online (« Optimiser les images
// existantes », with its undo kept in that browser's storage). Every image is converted at upload
// since October; the tool stays on the legacy page.

import { DEFAULT_LEVELS } from '@forestcard/engine';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  adminKeys,
  checkTitleLock,
  fetchSettings,
  fetchUnusedImages,
  removeUnusedImages,
  type UnusedImages,
  resetDailyCombats,
  saveSettings,
  setting,
  type Settings,
} from '@/data/admin';
import { ICONS } from '@/lib/icons';
import { ChampionshipAdmin } from './championship';
import { AdminError, AdminSection, Choice, Field, NoticeView, useAction } from './kit';

const clamp = (
  value: FormDataEntryValue | null,
  min: number,
  max: number,
  round = true,
): number => {
  const n = Number(value) || 0;
  return Math.max(min, Math.min(max, round ? Math.round(n) : n));
};

const form = (e: FormEvent<HTMLFormElement>): FormData => {
  e.preventDefault();
  return new FormData(e.currentTarget);
};

// A datetime-local value (local time) from a stored ISO date.
function localInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

const isoOrEmpty = (value: FormDataEntryValue | null): string | null => {
  if (!value) return '';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const inSixHours = () => new Date(Date.now() + 6 * 3600e3).toISOString();
const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const ended = (iso: string | undefined) => {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d < new Date();
};

function gainsState(v: Settings): string {
  const factor = Number(setting(v, 'multiplicateur_gains', 1)) || 0;
  const end = v.multiplicateur_fin;
  const over = ended(end);
  const gain = (k: string, d: number) =>
    Math.round((Number(setting(v, k, d)) || 0) * (over ? 1 : factor));
  const head =
    factor !== 1 && !over
      ? `🔥 Multiplicateur ×${factor} actif${end ? ` jusqu'au ${when(end)}` : ' (sans heure de fin)'}`
      : 'Gains normaux (×1)';
  return `${head} — en ce moment : victoire ${gain('gain_victoire', 50)}, défaite ${gain('gain_defaite', 10)}, nul ${gain('gain_nul', 20)} gold.`;
}

function bountyState(v: Settings): string {
  const end = v.bounty_fin;
  if (setting(v, 'bounty_actif', 0) !== '1' || ended(end)) return 'Bounty inactif.';
  const share = Number(setting(v, 'bounty_part_gagnant', 70));
  return `🎯 Bounty actif${end ? ` jusqu'au ${when(end)}` : ' (sans heure de fin)'} : prime de ${setting(v, 'bounty_min', 5)} à ${setting(v, 'bounty_max', 90)} gold dans ${setting(v, 'bounty_chance', 30)} % des combats, ${share} % gagnant / ${100 - share} % perdant, et ${setting(v, 'bounty_tout', 10)} % de chances que le gagnant rafle tout.`;
}

// The status levels (reglages_jeu « niveaux_statuts », JSON read by swift-responder): a value per
// level (I, II, III) for the leveled statuses, one value for the others. Empty: the engine's.
const LEVEL_ROWS: [string, string][] = [
  ['poison', 'Poison : dégâts par tour'],
  ['saignement', 'Saignement : % des PV max par tour'],
  ['saignementSoin', 'Saignement : % de soins en moins'],
  ['brulure', 'Brûlure : % des PV max par tour'],
  ['fatigue', "Fatigue : % d'ATQ en moins"],
  ['fractureChance', 'Fracture : % de chances de se blesser'],
  ['fractureAtq', 'Fracture : dégâts, % de sa propre ATQ'],
  ['glas', "Glas : % des PV max par tour (vitesse de l'ombre)"],
  ['sangsue', 'Sangsue toxique : % du tic de poison récupéré'],
];
const SINGLE_LEVELS: [string, string][] = [
  ['calcination', 'Brûlure : % des dégâts retirés aux PV max (calcination)'],
  ['malediction', 'Malédiction : ATQ en moins (sans niveau)'],
  ['faiblesse', 'Faiblesse (vaporisation) : % de dégâts reçus en plus'],
  ['faiblesseTours', 'Faiblesse : nombre de tours'],
  ['critique', "Coup critique : puissance, % de l'ATQ (commune à toutes les cartes)"],
  ['embrasementAtq', "Embrasement : % d'ATQ en plus"],
  ['embrasementCalcination', 'Embrasement : % des PV max calcinés à chacun de ses tours'],
  ['fureurPct', "Fureur incandescente : % d'ATQ par perte de PV"],
  ['fureurMax', "Fureur incandescente : % d'ATQ au plus"],
  ['injection', 'Injection virulente (poison III) : % des dégâts de poison restants'],
  ['surchargeAuto', 'Surcharge : % des PV max (auto-électrocution)'],
  ['surchargeAtq', "Surcharge : % d'ATQ en moins"],
  ['surchargeEnchainement', "Surcharge : % de chances d'enchaîner"],
  ['accumulateurCharges', 'Accumulateur : marques de foudre pour une charge pleine'],
  ['accumulateurBonus', 'Accumulateur : % de dégâts en plus'],
  ['brisure', "Brisure de volonté : × l'ATQ perdue aux malédictions"],
  ['etreinte', 'Étreinte maudite : ATQ en moins par malédiction et par attaque'],
  ['visee', 'Visée maintenue : % de chances de garder le ciblage'],
  ['foudre', 'Marque de foudre niveau I : % de dégâts en plus sur le prochain coup'],
  ['forgeMax', 'Forge : forges max par carte'],
  ['forgeStatMin', 'Forge : ATQ / PV max du combattant, % gagné au minimum'],
  ['forgeStatMax', 'Forge : ATQ / PV max du combattant, % gagné au maximum'],
  ['forgeValeurMin', "Forge : valeur d'un effet, % gagné au minimum"],
  ['forgeValeurMax', "Forge : valeur d'un effet, % gagné au maximum"],
  ['forgeChanceMin', 'Forge : chance, points gagnés au minimum'],
  ['forgeChanceMax', 'Forge : chance, points gagnés au maximum'],
  ['forgePlafondChance', 'Forge : une chance forgée ne dépasse jamais (%)'],
  ['forgeDeclenchement', 'Forge : % de chances de donner un déclenchement à un piège (une fois)'],
  ['filsSeuil', 'Fils : nombre de fils avant de pouvoir prendre le contrôle'],
  ['filsPas', 'Fils : % de chances de contrôle en plus par fil au-delà du seuil'],
  ['filsCout', 'Fils : % des PV max payés par le marionnettiste à chaque tour'],
];
const DEFAULTS = new Map<string, unknown>(Object.entries(DEFAULT_LEVELS));

function readLevels(raw: string | undefined): Record<string, unknown> {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function levelValue(stored: Record<string, unknown>, key: string, level?: number): string {
  const pick = (source: unknown) =>
    level === undefined ? source : Array.isArray(source) ? (source[level] as unknown) : undefined;
  const value = pick(stored[key]);
  const shown =
    value === undefined || value === null || value === '' ? pick(DEFAULTS.get(key)) : value;
  return typeof shown === 'number' || typeof shown === 'string' ? String(shown) : '';
}

const RECYCLING: [string, string, number][] = [
  ['commun', 'Commun', 5],
  ['rare', 'Rare', 10],
  ['epique', 'Épique', 35],
  ['legendaire', 'Légendaire', 80],
  ['ggez', 'GGEZ', 80],
];
const EXCHANGE: [string, string, number, number][] = [
  ['commun', 'Commune', 5, 2],
  ['rare', 'Rare', 10, 4],
  ['epique', 'Épique', 30, 12],
  ['legendaire', 'Légendaire', 60, 25],
  ['ggez', 'GGEZ', 100, 40],
];

const SPEEDS: [string, string][] = [
  ['0.5', '⚡⚡ Très rapide (×2)'],
  ['0.75', '⚡ Rapide'],
  ['1', 'Normal'],
  ['1.3', '🐢 Lent'],
  ['1.6', '🐢🐢 Très lent'],
];

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>;
}

export function SettingsAdmin() {
  const settings = useQuery({ queryKey: adminKeys.settings, queryFn: fetchSettings });
  if (settings.error) return <AdminError error={settings.error} />;
  if (!settings.data) return <PageSkeleton />;
  // Remounted on each reload: the forms start again from the saved values.
  return <SettingsForms key={JSON.stringify(settings.data)} v={settings.data} />;
}

function SettingsForms({ v }: { v: Settings }) {
  const game = useAction();
  const lock = useAction();
  const speed = useAction();
  const limits = useAction();
  const levels = useAction();
  const gains = useAction();
  const bounty = useAction();
  const storm = useAction();
  const recycling = useAction();
  const exchanges = useAction();
  const images = useAction();
  const tests = useAction();
  const [unused, setUnused] = useState<UnusedImages | null>(null);

  const closed = setting(v, 'jeu_ferme', 0) === '1';
  const live = !closed && setting(v, 'jeu_live', 1) !== '0';
  const storedLevels = readLevels(v.niveaux_statuts);
  const speedNow = String(Number(setting(v, 'vitesse_combat', 1)));

  return (
    <div className="flex flex-col gap-6">
      <AdminSection
        title="🎬 Jeu en live"
        description={
          <>
            <b>Fermé</b> : le jeu est coupé partout, en live (!combat, duels, !quotidien, !booster,
            championnat répondent « jeu fermé ») comme sur le site (onglet « Jouer » masqué). Les
            compteurs du championnat sont arrêtés ; collection, deck, boutique et jeux du jour
            restent ouverts. <b>En pause</b> (pour tes let's play) : les commandes du live répondent
            « jeu en pause » et l'onglet « 🎮 Jouer » s'ouvre sur le site : chacun y ouvre ses
            boosters et fait ses combats, avec les mêmes animations et les mêmes limites du jour.
            Pour couper aussi !booster, ferme Streamer.bot.
          </>
        }
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            const f = form(e);
            const mode = String(f.get('mode'));
            const price = clamp(f.get('prix'), 0, 100000);
            game.run(async () => {
              await saveSettings({
                jeu_live: mode === 'live' ? '1' : '0',
                jeu_ferme: mode === 'ferme' ? '1' : '0',
                duel_site_prix: price,
              });
              return mode === 'ferme'
                ? '🔒 Jeu fermé partout : les commandes du live répondent « jeu fermé », !booster est refusé et l’onglet « Jouer » est masqué pour les joueurs.'
                : mode === 'pause'
                  ? '🎬 Jeu en pause : les joueurs jouent sur le site (onglet « 🎮 Jouer »). Pense à fermer Streamer.bot ou à mettre tes récompenses de points de chaîne en pause.'
                  : '🎥 Jeu de nouveau en live : l’onglet « Jouer » est masqué pour les joueurs.';
            });
          }}
        >
          <Row>
            <Choice>
              <Checkbox type="radio" name="mode" value="live" defaultChecked={live} /> 🎥 Jeu en
              live
            </Choice>
            <Choice>
              <Checkbox type="radio" name="mode" value="pause" defaultChecked={!live && !closed} />{' '}
              🎬 En pause : on joue sur le site
            </Choice>
            <Choice>
              <Checkbox type="radio" name="mode" value="ferme" defaultChecked={closed} /> 🔒 Fermé
              partout
            </Choice>
          </Row>
          <Field
            label="Prix d'un duel lancé depuis le site, en gold"
            hint="En live, un duel coûte des points de chaîne."
          >
            <Input
              name="prix"
              type="number"
              min={0}
              max={100000}
              defaultValue={setting(v, 'duel_site_prix', 50)}
              className="w-28"
            />
          </Field>
          <div>
            <Button type="submit" disabled={game.pending}>
              Enregistrer
            </Button>
          </div>
          <NoticeView notice={game.notice} />
        </form>
      </AdminSection>

      <AdminSection
        title="🔒 Primes des ceintures"
        description="À verrouiller les jours où tu ne peux pas faire de live : sans live, pas de combat pour le titre, donc les champions ne doivent pas perdre leur série. Verrouillé : une journée sans combat pour le titre ne paie pas de prime mais garde la série des +10 % (une journée avec un combat pour le titre paie normalement), et les 7 jours d'inactivité et les 24 h des défis sont arrêtés. Une journée compte comme verrouillée si le verrou a été mis à un moment de la journée."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            const on = form(e).get('on') === 'on';
            lock.run(async () => {
              await saveSettings({ titre_primes_verrou: on ? '1' : '0' });
              await checkTitleLock();
              return on
                ? '🔒 Primes des ceintures verrouillées : les champions gardent leur série, les compteurs du championnat sont arrêtés. Pense à déverrouiller à ton retour en live.'
                : '🔓 Primes des ceintures déverrouillées : tout repart normalement.';
            });
          }}
        >
          <Choice>
            <Checkbox name="on" defaultChecked={setting(v, 'titre_primes_verrou', 0) === '1'} /> 🔒
            Primes des ceintures verrouillées
          </Choice>
          <div>
            <Button type="submit" disabled={lock.pending}>
              Enregistrer
            </Button>
          </div>
          <NoticeView notice={lock.notice} />
        </form>
      </AdminSection>

      <ChampionshipAdmin />

      <AdminSection
        title="⏱️ Combats"
        description="La vitesse des animations en live (overlay OBS) compte dès le combat suivant, sans recharger OBS. Les compteurs du jour repartent de zéro à minuit, heure de Paris."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            const f = form(e);
            const select = e.currentTarget.elements.namedItem('vitesse');
            const label =
              select instanceof HTMLSelectElement ? select.selectedOptions[0]?.text : '';
            speed.run(async () => {
              await saveSettings({ vitesse_combat: String(f.get('vitesse')) });
              return `Vitesse des combats enregistrée : ${label ?? ''}.`;
            });
          }}
        >
          <Field label="Vitesse des combats (overlay OBS)">
            <NativeSelect name="vitesse" defaultValue={speedNow} className="w-56">
              {SPEEDS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div>
            <Button type="submit" disabled={speed.pending}>
              Enregistrer la vitesse
            </Button>
          </div>
          <NoticeView notice={speed.notice} />
        </form>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            const f = form(e);
            const free = clamp(f.get('gratuits'), 0, 50);
            const same = clamp(f.get('meme'), 0, 50);
            limits.run(async () => {
              await saveSettings({
                combats_gratuits_par_jour: free,
                combats_meme_adversaire_par_jour: same,
              });
              return `Enregistré : ${free} combat${free > 1 ? 's' : ''} gratuit${free > 1 ? 's' : ''} par jour, ${same ? `${same} au plus contre le même adversaire` : 'pas de limite contre le même adversaire'}.`;
            });
          }}
        >
          <Row>
            <Field label="Combats gratuits par jour (!combat)" hint="0 = désactivés.">
              <Input
                name="gratuits"
                type="number"
                min={0}
                max={50}
                defaultValue={setting(v, 'combats_gratuits_par_jour', 1)}
                className="w-28"
              />
            </Field>
            <Field
              label="Combats contre le même adversaire par jour"
              hint="Anti-farm, !combat et duels, dans les deux sens. 0 = pas de limite."
            >
              <Input
                name="meme"
                type="number"
                min={0}
                max={50}
                defaultValue={setting(v, 'combats_meme_adversaire_par_jour', 3)}
                className="w-28"
              />
            </Field>
          </Row>
          <div>
            <Button type="submit" disabled={limits.pending}>
              Enregistrer les limites
            </Button>
          </div>
          <NoticeView notice={limits.notice} />
        </form>
      </AdminSection>

      <AdminSection
        title="📊 Niveaux des statuts"
        description={`Ce que fait chaque niveau (I, II, III) : la carte ne garde que son niveau, sa durée et sa chance. Posés l'un sur l'autre, les niveaux s'additionnent (I + II = III, III au plus). Pris en compte dès le combat suivant.${v.niveaux_statuts ? '' : ' (Valeurs par défaut du moteur pour l’instant.)'}`}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            const f = form(e);
            const n = (key: string) => clamp(f.get(key), 0, 1000, false);
            const out: Record<string, number | number[]> = {};
            for (const [k] of LEVEL_ROWS) out[k] = [0, 1, 2].map((i) => n(`${k}_${i}`));
            for (const [k] of SINGLE_LEVELS) out[k] = n(k);
            levels.run(async () => {
              await saveSettings({ niveaux_statuts: JSON.stringify(out) });
              return 'Niveaux des statuts enregistrés : ils comptent dès le combat suivant.';
            });
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>I</TableHead>
                <TableHead>II</TableHead>
                <TableHead>III</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LEVEL_ROWS.map(([k, label]) => (
                <TableRow key={k}>
                  <TableCell>{label}</TableCell>
                  {[0, 1, 2].map((i) => (
                    <TableCell key={i}>
                      <Input
                        name={`${k}_${i}`}
                        type="number"
                        min={0}
                        max={1000}
                        step={0.5}
                        defaultValue={levelValue(storedLevels, k, i)}
                        className="w-20"
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SINGLE_LEVELS.map(([k, label]) => (
              <Field key={k} label={label}>
                <Input
                  name={k}
                  type="number"
                  min={0}
                  max={1000}
                  step={0.5}
                  defaultValue={levelValue(storedLevels, k)}
                  className="w-24"
                />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={levels.pending}>
              Enregistrer
            </Button>
            <HoldButton
              type="button"
              variant="outline"
              disabled={levels.pending}
              onConfirm={() =>
                levels.run(async () => {
                  await saveSettings({ niveaux_statuts: '' });
                  return 'Niveaux remis aux valeurs par défaut.';
                })
              }
            >
              ↩ Valeurs par défaut
            </HoldButton>
          </div>
          <NoticeView notice={levels.notice} />
        </form>
      </AdminSection>

      <AdminSection
        title="💰 Gains des combats"
        description="Gold gagné à chaque combat (!combat et duels), pour les deux joueurs. Le multiplicateur sert aux soirées spéciales : ×2 = soirée double gains. Avec une heure de fin, il revient tout seul à ×1 ensuite (vide = jusqu'à ce que tu le changes)."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            const f = form(e);
            const end = isoOrEmpty(f.get('fin'));
            gains.run(async () => {
              if (end === null) throw new Error('Heure de fin invalide.');
              await saveSettings({
                gain_victoire: clamp(f.get('gv'), 0, 10000),
                gain_defaite: clamp(f.get('gd'), 0, 10000),
                gain_nul: clamp(f.get('gn'), 0, 10000),
                multiplicateur_gains: clamp(f.get('mul'), 0, 10, false),
                multiplicateur_fin: end,
              });
              return 'Gains enregistrés.';
            });
          }}
        >
          <Row>
            <Field label="Victoire">
              <Input
                name="gv"
                type="number"
                min={0}
                max={10000}
                defaultValue={setting(v, 'gain_victoire', 50)}
                className="w-24"
              />
            </Field>
            <Field label="Défaite">
              <Input
                name="gd"
                type="number"
                min={0}
                max={10000}
                defaultValue={setting(v, 'gain_defaite', 10)}
                className="w-24"
              />
            </Field>
            <Field label="Match nul">
              <Input
                name="gn"
                type="number"
                min={0}
                max={10000}
                defaultValue={setting(v, 'gain_nul', 20)}
                className="w-24"
              />
            </Field>
            <Field label="Multiplicateur">
              <Input
                name="mul"
                type="number"
                min={0}
                max={10}
                step={0.5}
                defaultValue={setting(v, 'multiplicateur_gains', 1)}
                className="w-24"
              />
            </Field>
            <Field label="Jusqu'à (facultatif)">
              <Input
                name="fin"
                type="datetime-local"
                defaultValue={localInput(v.multiplicateur_fin)}
                className="w-56"
              />
            </Field>
          </Row>
          <p className="text-sm text-muted-foreground">{gainsState(v)}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={gains.pending}>
              Enregistrer
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={gains.pending}
              onClick={() =>
                gains.run(async () => {
                  await saveSettings({ multiplicateur_gains: 2, multiplicateur_fin: inSixHours() });
                  return '🔥 Soirée double gains lancée pour 6 heures !';
                })
              }
            >
              🔥 Soirée ×2 (6 h)
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={gains.pending}
              onClick={() =>
                gains.run(async () => {
                  await saveSettings({ multiplicateur_gains: 1, multiplicateur_fin: '' });
                  return 'Gains remis à la normale (×1).';
                })
              }
            >
              ↩ Revenir à ×1
            </Button>
          </div>
          <NoticeView notice={gains.notice} />
        </form>
      </AdminSection>

      <AdminSection
        title="🎯 Événement Bounty"
        description="De temps en temps, une prime aléatoire apparaît à la fin d'un combat (pluie de pièces sur le stream) et se partage entre les deux joueurs, en plus des gains normaux (match nul : moitié-moitié). Parfois, le gagnant rafle tout. Elle n'est pas multipliée par les soirées ×2. Avec une heure de fin, l'événement s'arrête tout seul."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            const f = form(e);
            const end = isoOrEmpty(f.get('fin'));
            const min = clamp(f.get('bmin'), 0, 100000);
            bounty.run(async () => {
              if (end === null) throw new Error('Heure de fin invalide.');
              await saveSettings({
                bounty_actif: f.get('on') === 'on' ? 1 : 0,
                bounty_min: min,
                bounty_max: Math.max(min, clamp(f.get('bmax'), 0, 100000)),
                bounty_part_gagnant: clamp(f.get('bpart'), 0, 100),
                bounty_chance: clamp(f.get('bch'), 0, 100),
                bounty_tout: clamp(f.get('btout'), 0, 100),
                bounty_fin: end,
              });
              return 'Bounty enregistré.';
            });
          }}
        >
          <Choice>
            <Checkbox name="on" defaultChecked={setting(v, 'bounty_actif', 0) === '1'} /> Actif
          </Choice>
          <Row>
            <Field label="Prime min">
              <Input
                name="bmin"
                type="number"
                min={0}
                max={100000}
                defaultValue={setting(v, 'bounty_min', 5)}
                className="w-24"
              />
            </Field>
            <Field label="Prime max">
              <Input
                name="bmax"
                type="number"
                min={0}
                max={100000}
                defaultValue={setting(v, 'bounty_max', 90)}
                className="w-24"
              />
            </Field>
            <Field label="Part du gagnant %">
              <Input
                name="bpart"
                type="number"
                min={0}
                max={100}
                defaultValue={setting(v, 'bounty_part_gagnant', 70)}
                className="w-24"
              />
            </Field>
            <Field label="Chance qu'une prime apparaisse %">
              <Input
                name="bch"
                type="number"
                min={0}
                max={100}
                defaultValue={setting(v, 'bounty_chance', 30)}
                className="w-24"
              />
            </Field>
            <Field label="Chance « le gagnant rafle tout » %">
              <Input
                name="btout"
                type="number"
                min={0}
                max={100}
                defaultValue={setting(v, 'bounty_tout', 10)}
                className="w-24"
              />
            </Field>
            <Field label="Jusqu'à (facultatif)">
              <Input
                name="fin"
                type="datetime-local"
                defaultValue={localInput(v.bounty_fin)}
                className="w-56"
              />
            </Field>
          </Row>
          <p className="text-sm text-muted-foreground">{bountyState(v)}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={bounty.pending}>
              Enregistrer
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={bounty.pending}
              onClick={() =>
                bounty.run(async () => {
                  await saveSettings({ bounty_actif: 1, bounty_fin: inSixHours() });
                  return '🎯 Bounty lancé pour 6 heures !';
                })
              }
            >
              🎯 Lancer le Bounty (6 h)
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={bounty.pending}
              onClick={() =>
                bounty.run(async () => {
                  await saveSettings({ bounty_actif: 0, bounty_fin: '' });
                  return 'Bounty arrêté.';
                })
              }
            >
              ⏹ Arrêter le Bounty
            </Button>
          </div>
          <NoticeView notice={bounty.notice} />
        </form>
      </AdminSection>

      <AdminSection
        title="⛈️ Événement Orage"
        description="Pendant les combats, au début de chaque tour, un éclair peut tomber sur l'un des deux combattants (au hasard) : il subit des dégâts et reçoit un niveau de marque de foudre. Valable pour tous les combats (du jour, duels, ceintures, tournois) tant qu'il est actif."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            const f = form(e);
            storm.run(async () => {
              await saveSettings({
                orage_actif: f.get('on') === 'on' ? 1 : 0,
                orage_chance: clamp(f.get('och'), 0, 100),
                orage_degats: clamp(f.get('odeg'), 0, 10000),
              });
              return 'Orage enregistré.';
            });
          }}
        >
          <Choice>
            <Checkbox name="on" defaultChecked={setting(v, 'orage_actif', 0) === '1'} /> Actif
          </Choice>
          <Row>
            <Field label="Chance d'un éclair à chaque tour %">
              <Input
                name="och"
                type="number"
                min={0}
                max={100}
                defaultValue={setting(v, 'orage_chance', 10)}
                className="w-24"
              />
            </Field>
            <Field label="Dégâts de l'éclair">
              <Input
                name="odeg"
                type="number"
                min={0}
                max={10000}
                defaultValue={setting(v, 'orage_degats', 18)}
                className="w-24"
              />
            </Field>
          </Row>
          <p className="text-sm text-muted-foreground">
            {setting(v, 'orage_actif', 0) === '1'
              ? '⛈️ Orage actif : les éclairs tombent pendant les combats.'
              : 'Orage inactif.'}
          </p>
          <div>
            <Button type="submit" disabled={storm.pending}>
              Enregistrer
            </Button>
          </div>
          <NoticeView notice={storm.notice} />
        </form>
      </AdminSection>

      <AdminSection
        title="♻️ Recyclage des doublons"
        description="Ce que rapporte chaque exemplaire en trop quand le joueur choisit le gold. La colonne Fragments donne des fragments EN PLUS du gold : laisse-la à 0 (le recyclage en fragments se règle dans « Échanges » ci-dessous)."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            const f = form(e);
            const values: Record<string, number> = {};
            for (const [k] of RECYCLING) {
              values[`recyclage_gold_${k}`] = clamp(f.get(`g_${k}`), 0, 1e9);
              values[`recyclage_fragments_${k}`] = clamp(f.get(`f_${k}`), 0, 1e9);
            }
            recycling.run(async () => {
              await saveSettings(values);
              return 'Prix de recyclage enregistrés.';
            });
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>Gold</TableHead>
                <TableHead>Fragments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RECYCLING.map(([k, label, gold]) => (
                <TableRow key={k}>
                  <TableCell>{label}</TableCell>
                  <TableCell>
                    <Input
                      name={`g_${k}`}
                      type="number"
                      min={0}
                      defaultValue={setting(v, `recyclage_gold_${k}`, gold)}
                      className="w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      name={`f_${k}`}
                      type="number"
                      min={0}
                      defaultValue={setting(v, `recyclage_fragments_${k}`, 0)}
                      className="w-24"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div>
            <Button type="submit" disabled={recycling.pending}>
              Enregistrer le recyclage
            </Button>
          </div>
          <NoticeView notice={recycling.notice} />
        </form>
      </AdminSection>

      <AdminSection
        title="🔄 Échanges"
        description="Chaque carte échangée ajoute son prix au pot ; les joueurs le remplissent à deux. Les fragments s'obtiennent en recyclant les doublons (le joueur choisit gold OU fragments)."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            const f = form(e);
            const values: Record<string, number> = {};
            for (const [k] of EXCHANGE) {
              values[`echange_prix_${k}`] = clamp(f.get(`p_${k}`), 0, 100000);
              values[`fragments_recyclage_${k}`] = clamp(f.get(`f_${k}`), 0, 100000);
            }
            values.echange_par_jour = clamp(f.get('pj'), 0, 20);
            values.echange_age_jours = clamp(f.get('age'), 0, 365);
            values.echange_boosters_min = clamp(f.get('bo'), 0, 10000);
            values.echange_expiration_h = clamp(f.get('exp'), 1, 720);
            values.echange_max_cartes = clamp(f.get('mx'), 1, 20);
            exchanges.run(async () => {
              await saveSettings(values);
              return 'Réglages des échanges enregistrés.';
            });
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>Prix dans le pot 🧩</TableHead>
                <TableHead>Recyclage d'un doublon 🧩</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {EXCHANGE.map(([k, label, price, fragments]) => (
                <TableRow key={k}>
                  <TableCell>{label}</TableCell>
                  <TableCell>
                    <Input
                      name={`p_${k}`}
                      type="number"
                      min={0}
                      defaultValue={setting(v, `echange_prix_${k}`, price)}
                      className="w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      name={`f_${k}`}
                      type="number"
                      min={0}
                      defaultValue={setting(v, `fragments_recyclage_${k}`, fragments)}
                      className="w-24"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Row>
            <Field label="Échanges par jour">
              <Input
                name="pj"
                type="number"
                min={0}
                max={20}
                defaultValue={setting(v, 'echange_par_jour', 1)}
                className="w-24"
              />
            </Field>
            <Field label="Ancienneté min (jours)">
              <Input
                name="age"
                type="number"
                min={0}
                max={365}
                defaultValue={setting(v, 'echange_age_jours', 7)}
                className="w-24"
              />
            </Field>
            <Field label="Boosters ouverts min">
              <Input
                name="bo"
                type="number"
                min={0}
                max={10000}
                defaultValue={setting(v, 'echange_boosters_min', 50)}
                className="w-24"
              />
            </Field>
            <Field label="Expiration d'une offre (h)">
              <Input
                name="exp"
                type="number"
                min={1}
                max={720}
                defaultValue={setting(v, 'echange_expiration_h', 48)}
                className="w-24"
              />
            </Field>
            <Field label="Cartes max par côté">
              <Input
                name="mx"
                type="number"
                min={1}
                max={20}
                defaultValue={setting(v, 'echange_max_cartes', 5)}
                className="w-24"
              />
            </Field>
          </Row>
          <div>
            <Button type="submit" disabled={exchanges.pending}>
              Enregistrer
            </Button>
          </div>
          <NoticeView notice={exchanges.notice} />
        </form>
      </AdminSection>

      <AdminSection
        title="🧹 Images inutilisées"
        description="Fait le ménage dans le stockage Supabase : les images (cartes, propositions des joueurs) que plus rien ne cite dans la base. Tout ce qui sert quelque part (cartes actives ou désactivées, boosters, dos, propositions, tournois, annonces, puzzles, lore, dessins…) est gardé, et une image envoyée il y a moins d'une heure aussi."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={images.pending}
            onClick={() =>
              images.run(async () => {
                const found = await fetchUnusedImages();
                setUnused(found);
                return found.paths.length
                  ? `${found.paths.length} image(s) inutilisée(s), ${(found.bytes / 1048576).toFixed(1)} Mo.`
                  : 'Aucune image inutilisée : rien à supprimer.';
              })
            }
          >
            Chercher les images inutilisées
          </Button>
          {unused && unused.paths.length > 0 && (
            <HoldButton
              variant="destructive"
              disabled={images.pending}
              onConfirm={() =>
                images.run(async () => {
                  const n = await removeUnusedImages(unused);
                  setUnused(null);
                  return `${n} image(s) supprimée(s), ${(unused.bytes / 1048576).toFixed(1)} Mo libérés.`;
                })
              }
            >
              <ICONS.delete /> Supprimer définitivement
            </HoldButton>
          )}
        </div>
        <NoticeView notice={images.notice} />
      </AdminSection>

      <AdminSection title="🧪 Tests">
        <div>
          <HoldButton
            variant="outline"
            disabled={tests.pending}
            onConfirm={() =>
              tests.run(async () => {
                await resetDailyCombats();
                return 'Compteurs remis à zéro.';
              })
            }
          >
            Remettre à zéro les combats gratuits du jour (tous les joueurs)
          </HoldButton>
        </div>
        <NoticeView notice={tests.notice} />
      </AdminSection>
    </div>
  );
}
