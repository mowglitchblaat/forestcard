// Admin · Tournois (aTournois): creating a tournament (name, format, Swiss places, theme deck, max
// players, cups and scarf, automatic chaining); the open one (entrants to remove, format, places,
// chaining, images, the draw, cancelling) with its bracket; and every past tournament.
// Admin · Récompenses (aRecompenses): what the four first places of the open tournament win.

import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
import { Bracket, RewardLine } from '@/components/tournament';
import { Badge } from '@/components/ui/badge';
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
  fetchBacksAdmin,
  fetchBoosterNames,
  fetchVariants,
  uploadImage,
  variantLabel,
} from '@/data/admin';
import {
  cancel,
  createTournament,
  DIVISIONS,
  fetchAdminTournaments,
  fetchTournament,
  isDivision,
  launch,
  PLACE_NAMES,
  removeEntrant,
  setAuto,
  setFormat,
  setPlaces,
  setReward,
  setTrophy,
  type Tournament,
  tournamentKeys,
} from '@/data/tournaments';
import { useSession } from '@/lib/session';
import { AdminError, AdminSection, Choice, Field, NoticeView, useAction } from './kit';

const STATUS: Record<string, string> = {
  inscriptions: '📝 Inscriptions',
  en_cours: '⚔️ En cours',
  termine: '🏁 Terminé',
  annule: '❌ Annulé',
};
const FORMATS = {
  elimination: 'Élimination directe',
  suisse: 'Rondes suisses + double élimination',
} as const;
const IMAGES: [number, string][] = [
  [1, '🥇 Trophée'],
  [2, '🥈 Trophée'],
  [3, '🥉 Trophée'],
  [0, '🎗️ Écharpe'],
];
const optionalInt = (v: string) => (v === '' ? null : Number.parseInt(v, 10));

export function TournamentsAdmin() {
  const current = useQuery({
    queryKey: tournamentKeys.one(null),
    queryFn: () => fetchTournament(null),
  });
  const list = useQuery({ queryKey: tournamentKeys.admin, queryFn: fetchAdminTournaments });
  const error = current.error ?? list.error;
  if (error) return <AdminError error={error} />;
  if (!current.data || !list.data) return <PageSkeleton />;
  const t = current.data.tournament;
  const open = t && (t.statut === 'inscriptions' || t.statut === 'en_cours');
  return (
    <div className="flex flex-col gap-6">
      {open ? <OpenTournament key={JSON.stringify(t)} tournament={t} /> : <NewTournament />}
      <AdminSection title="Tous les tournois">
        {list.data.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tournoi</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Joueurs</TableHead>
                <TableHead>Vainqueur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((x) => (
                <TableRow key={x.id}>
                  <TableCell>
                    <b>{x.nom}</b>
                    <br />
                    <small className="text-muted-foreground">
                      {isDivision(x.division) ? DIVISIONS[x.division].icon : ''}{' '}
                      {new Date(x.cree_le).toLocaleDateString('fr-FR')}
                    </small>
                  </TableCell>
                  <TableCell>{STATUS[x.statut] ?? x.statut}</TableCell>
                  <TableCell>
                    {x.joueurs ?? 0}
                    {x.abandons ? (
                      <small title="Joueurs qui ont abandonné"> · 🏳️ {x.abandons}</small>
                    ) : null}
                  </TableCell>
                  <TableCell>{x.pseudo_gagnant ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun tournoi pour l'instant.</p>
        )}
      </AdminSection>
    </div>
  );
}

function NewTournament() {
  const action = useAction();
  const files = useRef<(HTMLInputElement | null)[]>([]);
  const [name, setName] = useState('');
  const [format, setFormatState] = useState<keyof typeof FORMATS>('suisse');
  const [winners, setWinners] = useState('');
  const [losers, setLosers] = useState('');
  const [division, setDivision] = useState('libre');
  const [max, setMax] = useState('');
  const [auto, setAutoState] = useState(true);
  return (
    <AdminSection
      title="Nouveau tournoi"
      description="BO1 jusqu'aux quarts, BO3 en demi-finale, BO5 en petite finale et en finale (réglages tournoi_format_*). Un seul tournoi ouvert à la fois. Les récompenses reprennent celles du tournoi précédent : à retoucher dans Récompenses."
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Nom">
          <Input
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Coupe du Cerf"
            className="w-64"
          />
        </Field>
        <Field label="Format">
          <NativeSelect
            value={format}
            onChange={(e) =>
              setFormatState(e.target.value === 'elimination' ? 'elimination' : 'suisse')
            }
            className="w-96"
          >
            <option value="suisse">
              Rondes suisses (BO1) puis double élimination (BO3, finales BO5)
            </option>
            <option value="elimination">Élimination directe (BO1, demi BO3, finales BO5)</option>
          </NativeSelect>
        </Field>
        <Field label="Thème : le deck de championnat utilisé">
          <NativeSelect
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            className="w-80"
          >
            <option value="libre">🥇 Ceinture Libre (toutes raretés)</option>
            <option value="epique">🥈 Ceinture Épique (jusqu'à épique)</option>
            <option value="rare">🥉 Ceinture Rare (communes et rares)</option>
          </NativeSelect>
        </Field>
        <Field label="Joueurs max (vide : 32)">
          <Input
            type="number"
            min={2}
            max={64}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="w-24"
          />
        </Field>
      </div>
      {format === 'suisse' && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="🏆 Winner bracket après les rondes" hint="Vide : 60 % des inscrits.">
            <Input
              type="number"
              min={2}
              max={64}
              value={winners}
              onChange={(e) => setWinners(e.target.value)}
              placeholder="auto"
              className="w-24"
            />
          </Field>
          <Field
            label="💀 Loser bracket"
            hint="Vide : tous les autres ; moins, et les derniers du classement sont éliminés."
          >
            <Input
              type="number"
              min={0}
              max={64}
              value={losers}
              onChange={(e) => setLosers(e.target.value)}
              placeholder="tous"
              className="w-24"
            />
          </Field>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">
          Images, une par place (facultatives : une place sans image prend celle du vainqueur ; sans
          aucune image, une coupe or, argent ou bronze) et l'écharpe offerte à chaque participant
          (sinon une écharpe dessinée).
        </span>
        <div className="flex flex-wrap gap-3">
          {IMAGES.map(([place, label]) => (
            <Field key={place} label={label}>
              <Input
                ref={(el) => {
                  files.current[place] = el;
                }}
                type="file"
                accept="image/*"
                className="w-56"
              />
            </Field>
          ))}
        </div>
      </div>
      <Choice>
        <Checkbox checked={auto} onChange={(e) => setAutoState(e.target.checked)} /> Enchaîner
        automatiquement les combats en live
      </Choice>
      <div>
        <Button
          disabled={action.pending || !name.trim()}
          onClick={() =>
            action.run(async () => {
              const images: (string | null)[] = [];
              for (const place of [0, 1, 2, 3]) {
                const f = files.current[place]?.files?.[0];
                images[place] = f ? await uploadImage(f) : null;
              }
              await createTournament({
                nom: name.trim(),
                division,
                max: optionalInt(max),
                auto,
                swiss: format === 'suisse',
                winners: optionalInt(winners),
                losers: optionalInt(losers),
                images,
              });
              return '🎖️ Tournoi créé : les inscriptions sont ouvertes (!tournoi dans le chat, ou la page Tournois du site). Règle ses récompenses dans Récompenses.';
            })
          }
        >
          Créer le tournoi et ouvrir les inscriptions
        </Button>
      </div>
      <NoticeView notice={action.notice} />
    </AdminSection>
  );
}

function OpenTournament({ tournament: t }: { tournament: Tournament }) {
  const me = useSession()?.user.id ?? '';
  const action = useAction();
  const entrants = t.inscrits ?? [];
  const registering = t.statut === 'inscriptions';
  const [winners, setWinners] = useState(
    t.places_winner === null || t.places_winner === undefined ? '' : String(t.places_winner),
  );
  const [losers, setLosers] = useState(
    t.places_loser === null || t.places_loser === undefined ? '' : String(t.places_loser),
  );
  return (
    <AdminSection
      title={t.nom}
      description={`${STATUS[t.statut] ?? t.statut} · deck ${t.ceinture ?? ''} · ${entrants.length} inscrit${entrants.length > 1 ? 's' : ''}${registering ? ` / ${t.max_joueurs ?? '?'}` : ''}`}
    >
      {registering ? (
        entrants.length ? (
          <div className="flex flex-wrap gap-2">
            {entrants.map((x) => (
              <Badge key={x.id} variant="outline">
                {x.pseudo ?? '?'}
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Retirer ${x.pseudo ?? '?'}`}
                  disabled={action.pending}
                  onClick={() =>
                    action.run(async () => {
                      await removeEntrant(t.id, x.id);
                    })
                  }
                >
                  ✕
                </Button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun inscrit pour l'instant.</p>
        )
      ) : (
        <Bracket tournament={t} me={me} />
      )}
      <div className="flex flex-wrap items-end gap-3">
        {registering ? (
          <Field label="Format">
            <NativeSelect
              defaultValue={t.format === 'suisse' ? 'suisse' : 'elimination'}
              disabled={action.pending}
              onChange={(e) => {
                const value = e.target.value;
                action.run(async () => {
                  await setFormat(t.id, value);
                  return 'Format du tournoi mis à jour.';
                });
              }}
              className="w-80"
            >
              {Object.entries(FORMATS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <small className="text-muted-foreground">
            {t.format === 'suisse' ? FORMATS.suisse : FORMATS.elimination}
          </small>
        )}
        {registering && t.format === 'suisse' && (
          <>
            <Field label="🏆 Winner (vide : 60 %)">
              <Input
                type="number"
                min={2}
                max={64}
                value={winners}
                onChange={(e) => setWinners(e.target.value)}
                placeholder="auto"
                className="w-24"
              />
            </Field>
            <Field label="💀 Loser (vide : tous)">
              <Input
                type="number"
                min={0}
                max={64}
                value={losers}
                onChange={(e) => setLosers(e.target.value)}
                placeholder="tous"
                className="w-24"
              />
            </Field>
            <Button
              variant="outline"
              disabled={action.pending}
              onClick={() =>
                action.run(async () => {
                  await setPlaces(t.id, optionalInt(winners), optionalInt(losers));
                  return 'Places du tableau final mises à jour.';
                })
              }
            >
              Enregistrer les places
            </Button>
          </>
        )}
        <Choice>
          <Checkbox
            defaultChecked={t.auto === true}
            disabled={action.pending}
            onChange={(e) => {
              const on = e.target.checked;
              action.run(async () => {
                await setAuto(t.id, on);
                return on
                  ? 'Les combats s’enchaînent tout seuls.'
                  : 'Enchaînement automatique coupé.';
              });
            }}
          />{' '}
          Enchaîner automatiquement les combats
        </Choice>
      </div>
      <div className="flex flex-wrap gap-3">
        {IMAGES.map(([place, label]) => (
          <Field key={place} label={`${label} : changer l'image`}>
            <Input
              type="file"
              accept="image/*"
              disabled={action.pending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                action.run(async () => {
                  await setTrophy(t.id, place, await uploadImage(f));
                  return place
                    ? `${label} de la ${place === 1 ? '1re' : `${place}e`} place mis à jour.`
                    : '🎗️ Écharpe de participation mise à jour.';
                });
              }}
              className="w-56"
            />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {registering && (
          <HoldButton
            disabled={action.pending || entrants.length < 2}
            onConfirm={() =>
              action.run(async () => {
                await launch(t.id);
                return 'Inscriptions fermées, tableau tiré : le tournoi est lancé.';
              })
            }
          >
            🎲 Tirer le tableau et lancer
          </HoldButton>
        )}
        <HoldButton
          variant="destructive"
          disabled={action.pending}
          onConfirm={() =>
            action.run(async () => {
              await cancel(t.id);
              return `Tournoi « ${t.nom} » annulé : personne ne reçoit de trophée.`;
            })
          }
        >
          🛑 Annuler le tournoi
        </HoldButton>
      </div>
      <small className="text-muted-foreground">
        {registering
          ? 'Le tirage peut aussi se faire en live : la première commande « Tournoi - Suivant » tire le tableau et lance le premier combat.'
          : 'Le combat suivant se lance avec l’action « Tournoi - Suivant » (ou tout seul, si l’enchaînement est coché).'}
      </small>
      <NoticeView notice={action.notice} />
    </AdminSection>
  );
}

// ── Rewards ──

type RewardForm = { gold: number; booster: string; boosters: number; dos: string; variant: string };

export function RewardsAdmin() {
  const current = useQuery({
    queryKey: tournamentKeys.one(null),
    queryFn: () => fetchTournament(null),
  });
  const boosters = useQuery({ queryKey: adminKeys.boosters, queryFn: fetchBoosterNames });
  const backs = useQuery({ queryKey: adminKeys.backs, queryFn: fetchBacksAdmin });
  const variants = useQuery({ queryKey: adminKeys.variants, queryFn: fetchVariants });
  const error = current.error ?? boosters.error ?? backs.error ?? variants.error;
  if (error) return <AdminError error={error} />;
  if (!current.data || !boosters.data || !backs.data || !variants.data) return <PageSkeleton />;
  const t = current.data.tournament;
  if (!t || !(t.statut === 'inscriptions' || t.statut === 'en_cours'))
    return (
      <p className="text-muted-foreground">
        Aucun tournoi ouvert : crée d'abord le tournoi dans Tournois, puis règle ses récompenses
        ici.
      </p>
    );
  return (
    <RewardsForm
      key={JSON.stringify(t.recompenses ?? [])}
      tournament={t}
      boosters={boosters.data}
      backs={backs.data.backs}
      variants={variants.data}
    />
  );
}

function RewardsForm({
  tournament: t,
  boosters,
  backs,
  variants,
}: {
  tournament: Tournament;
  boosters: Awaited<ReturnType<typeof fetchBoosterNames>>;
  backs: Awaited<ReturnType<typeof fetchBacksAdmin>>['backs'];
  variants: Awaited<ReturnType<typeof fetchVariants>>;
}) {
  const action = useAction();
  const saved = new Map((t.recompenses ?? []).map((r) => [r.place, r]));
  const [forms, setForms] = useState<Record<number, RewardForm>>(() =>
    Object.fromEntries(
      [1, 2, 3, 4].map((p) => {
        const r = saved.get(p);
        return [
          p,
          {
            gold: r?.gold ?? 0,
            booster: r?.booster_id ? String(r.booster_id) : '',
            boosters: r?.boosters ?? 1,
            dos: r?.dos_id ? String(r.dos_id) : '',
            variant: r?.variante_id ? String(r.variante_id) : '',
          },
        ];
      }),
    ),
  );
  const set = (p: number, patch: Partial<RewardForm>) =>
    setForms((f) => ({ ...f, [p]: { ...(f[p] as RewardForm), ...patch } }));
  return (
    <AdminSection
      title={`Récompenses du tournoi « ${t.nom} »`}
      description="Données à la fin du tournoi (1re à 3e place : aussi un trophée). Un dos de carte déjà possédé n'est pas redonné. Les joueurs voient ces récompenses sur la page Tournois."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {[1, 2, 3, 4].map((p) => {
          const f = forms[p] as RewardForm;
          const r = saved.get(p);
          return (
            <div key={p} className="flex flex-col gap-3 rounded-xl border p-3">
              <b>
                {PLACE_NAMES[p]}
                {p === 4 && (
                  <small className="font-normal text-muted-foreground">
                    {' '}
                    (perdant de la petite finale, sans trophée)
                  </small>
                )}
              </b>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="💰 Gold">
                  <Input
                    type="number"
                    min={0}
                    value={f.gold}
                    onChange={(e) => set(p, { gold: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-28"
                  />
                </Field>
                <Field label="📦 Booster">
                  <NativeSelect
                    value={f.booster}
                    onChange={(e) => set(p, { booster: e.target.value })}
                    className="w-48"
                  >
                    <option value="">— Aucun —</option>
                    {boosters.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nom}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Nombre">
                  <Input
                    type="number"
                    min={0}
                    value={f.boosters}
                    onChange={(e) => set(p, { boosters: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-20"
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="🂠 Dos de carte">
                  <NativeSelect
                    value={f.dos}
                    onChange={(e) => set(p, { dos: e.target.value })}
                    className="w-48"
                  >
                    <option value="">— Aucun —</option>
                    {backs.map((b) => (
                      <option key={String(b.id)} value={String(b.id)}>
                        {b.nom || 'Dos'}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="🃏 Carte (la version précise)">
                  <NativeSelect
                    value={f.variant}
                    onChange={(e) => set(p, { variant: e.target.value })}
                    className="w-72"
                  >
                    <option value="">— Aucune —</option>
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {variantLabel(v)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <small className="text-muted-foreground">
                {r ? <RewardLine reward={r} /> : null}
                {!r ? 'Rien pour l’instant.' : null}
              </small>
            </div>
          );
        })}
      </div>
      <div>
        <Button
          disabled={action.pending}
          onClick={() =>
            action.run(async () => {
              for (const p of [1, 2, 3, 4]) {
                const f = forms[p] as RewardForm;
                await setReward(t.id, p, {
                  gold: f.gold,
                  booster: f.booster ? Number(f.booster) : null,
                  boosters: f.boosters,
                  dos: f.dos || null,
                  variant: f.variant ? Number(f.variant) : null,
                });
              }
              return '🎁 Récompenses enregistrées.';
            })
          }
        >
          Enregistrer les récompenses
        </Button>
      </div>
      <NoticeView notice={action.notice} />
    </AdminSection>
  );
}
