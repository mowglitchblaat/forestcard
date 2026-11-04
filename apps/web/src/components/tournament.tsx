// What the tournaments show on several pages: a trophy (the tournament's image, else a drawn cup
// or scarf), a place's rewards, the bracket (single elimination; Swiss rounds, their ranking, then
// the winner and loser brackets), and the trophy cabinet of a profile with each trophy's detail.

import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import {
  fetchTournament,
  type Match,
  PLACE_NAMES,
  PLACES,
  type Reward,
  type Tournament,
  type Trophy,
  tournamentKeys,
} from '@/data/tournaments';
import { TONES } from '@/lib/tones';

const useImages = () =>
  useQuery({ queryKey: imageKeys.mirror, queryFn: fetchMirror, staleTime: Infinity }).data ??
  new Set<string>();

const PLACE_TONE = {
  gold: TONES.gold.text,
  silver: 'text-muted-foreground',
  bronze: TONES.warning.text,
  scarf: TONES.info.text,
} as const;

function Cup() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="size-full fill-current">
      <path d="M18 8h28v10c0 9-6 16-14 16S18 27 18 18z" />
      <path
        d="M18 12H9c0 9 4 13 10 13M46 12h9c0 9-4 13-10 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <rect x="28" y="33" width="8" height="10" />
      <rect x="20" y="43" width="24" height="6" rx="1" />
      <rect x="16" y="50" width="32" height="7" rx="2" />
    </svg>
  );
}

function Scarf() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="size-full fill-current">
      <path d="M14 10c10 6 26 6 36 0l2 8c-11 7-29 7-40 0z" />
      <path d="M22 17l-6 37 7-4 4 6 5-36zM42 17l6 37-7-4-4 6-5-36z" opacity=".85" />
    </svg>
  );
}

export function TrophyArt({ image, place }: { image: string | null | undefined; place: number }) {
  const images = useImages();
  const src = image ? imageUrl(image, images) : null;
  const tone = PLACES[place]?.tone ?? 'gold';
  if (src) return <img src={src} alt="" className="size-full object-contain" />;
  return (
    <span className={`block size-full ${PLACE_TONE[tone]}`}>
      {place === 0 ? <Scarf /> : <Cup />}
    </span>
  );
}

export function RewardLine({ reward: r }: { reward: Reward }) {
  const images = useImages();
  const parts: ReactNode[] = [];
  const img = (path: string | null | undefined) => {
    const src = path ? imageUrl(path, images) : null;
    return src ? <img src={src} alt="" className="inline h-8 rounded-sm align-middle" /> : null;
  };
  if ((r.gold ?? 0) > 0)
    parts.push(
      <span key="gold">
        💰 <b>{r.gold}</b> gold
      </span>,
    );
  if (r.booster_id && (r.boosters ?? 0) > 0)
    parts.push(
      <span key="booster">
        {img(r.booster_image) ?? '📦'} {r.boosters}× {r.booster ?? 'booster'}
      </span>,
    );
  if (r.dos_id)
    parts.push(
      <span key="back">
        {img(r.dos_image) ?? '🂠'} dos « {r.dos ?? '?'} »
      </span>,
    );
  if (r.variante_id)
    parts.push(
      <span key="card">
        {img(r.carte_image) ?? '🃏'} carte {r.carte ?? '?'}
        {r.version && r.version !== 'Standard' ? ` (${r.version})` : ''}
      </span>,
    );
  if (!parts.length) return null;
  return <span className="flex flex-wrap items-center gap-x-3 gap-y-1">{parts}</span>;
}

export const hasReward = (r: Reward) =>
  (r.gold ?? 0) > 0 || (!!r.booster_id && (r.boosters ?? 0) > 0) || !!r.dos_id || !!r.variante_id;

// ── The bracket ──

function MatchBox({ m, me, quit }: { m: Match; me: string; quit: Set<string> }) {
  const done = !!m.gagnant;
  const mine = m.a === me || m.b === me;
  const side = (id: string | null | undefined, name: string | null | undefined, score: unknown) => {
    const won = done && !!id && m.gagnant === id;
    const lost = done && !!id && m.gagnant !== id;
    const forfeit = !!m.forfait && m.forfait === id;
    return (
      <div
        className={`flex items-center justify-between gap-2 px-2 py-1 ${won ? 'font-semibold' : ''} ${lost ? 'text-muted-foreground line-through decoration-1' : ''}`}
      >
        <span className="truncate">
          {name ?? (m.exempt && !id ? '—' : <span className="opacity-50">?</span>)}
          {id && quit.has(id) && !forfeit ? (
            <small title="A abandonné le tournoi"> 🏳️</small>
          ) : null}
        </span>
        {!m.exempt && (
          <b className="tabular-nums">
            {forfeit ? <span title="Forfait (abandon)">🏳️</span> : String(score ?? '')}
          </b>
        )}
      </div>
    );
  };
  return (
    <div
      className={`overflow-hidden rounded-md border text-sm ${m.a_l_ecran ? 'ring-2 ring-primary' : mine ? `ring-1 ${TONES.me.ring}` : ''}`}
    >
      {side(m.a, m.pseudo_a, m.score_a)}
      <div className="border-t" />
      {m.exempt ? (
        <div className="px-2 py-1 text-xs text-muted-foreground italic">
          {m.phase && m.phase !== 'tableau' ? 'exempt (victoire)' : "qualifié d'office"}
        </div>
      ) : (
        side(m.b, m.pseudo_b, m.score_b)
      )}
    </div>
  );
}

function Column({
  title,
  matches,
  me,
  quit,
}: {
  title: string;
  matches: Match[];
  me: string;
  quit: Set<string>;
}) {
  const format = matches[0]?.format ?? 1;
  return (
    <div className="flex w-52 shrink-0 flex-col gap-2">
      <div className="text-xs font-semibold text-muted-foreground">
        {title}
        {format > 1 ? ` · BO${format}` : ''}
      </div>
      <div className="flex flex-1 flex-col justify-around gap-2">
        {matches.map((m) => (
          <div key={`${m.phase ?? ''}-${m.tour}-${m.position}`} className="flex flex-col gap-1">
            {m.petite && (
              <div className={`text-xs font-semibold ${TONES.warning.text}`}>
                🥉 Petite finale{(m.format ?? 1) > 1 ? ` · BO${m.format}` : ''}
              </div>
            )}
            <MatchBox m={m} me={me} quit={quit} />
          </div>
        ))}
      </div>
    </div>
  );
}

const byRound = (list: Match[]) =>
  [...new Set(list.map((m) => m.tour))]
    .sort((x, y) => x - y)
    .map((t) => list.filter((m) => m.tour === t).sort((x, y) => x.position - y.position));

function Rounds({ matches, me, quit }: { matches: Match[]; me: string; quit: Set<string> }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {byRound(matches).map((round) => (
        <Column
          key={round[0]?.tour}
          title={round[0]?.nom_tour ?? ''}
          matches={round}
          me={me}
          quit={quit}
        />
      ))}
    </div>
  );
}

export function DoubleBrackets({
  matches,
  me,
  quit = new Set(),
}: {
  matches: Match[];
  me: string;
  quit?: Set<string>;
}) {
  const winner = matches.filter((m) => m.phase !== 'loser');
  const loser = matches.filter((m) => m.phase === 'loser');
  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-semibold">🏆 Winner bracket</h4>
      <Rounds matches={winner} me={me} quit={quit} />
      {loser.length > 0 && (
        <>
          <h4 className="font-semibold">💀 Loser bracket</h4>
          <Rounds matches={loser} me={me} quit={quit} />
        </>
      )}
    </div>
  );
}

export function Bracket({ tournament: t, me }: { tournament: Tournament; me: string }) {
  const quit = new Set((t.abandons ?? []).map((x) => x.id));
  const matches = t.matchs ?? [];
  const abandons = (t.abandons ?? []).length ? (
    <p className="text-sm text-muted-foreground">
      🏳️ <b>Abandon</b> : {(t.abandons ?? []).map((x) => x.pseudo ?? '?').join(', ')} (matchs
      restants perdus par forfait, résultats d'avant conservés).
    </p>
  ) : null;
  if (t.format !== 'suisse')
    return (
      <div className="flex flex-col gap-3">
        {abandons}
        <Rounds matches={matches} me={me} quit={quit} />
      </div>
    );
  const swiss = matches.filter((m) => m.phase === 'suisse');
  const brackets = matches.filter(
    (m) => m.phase !== 'suisse' && !(m.phase === 'revanche' && !m.a) && !(m.exempt && !m.a),
  );
  const ranking = t.classement ?? [];
  const round = Math.max(1, ...swiss.map((m) => m.tour));
  const w = t.coupe ?? 4;
  const l = t.coupe_loser ?? (w > 2 ? w : 0);
  return (
    <div className="flex flex-col gap-4">
      {abandons}
      <h4 className="font-semibold">
        📊 Rondes suisses · {Math.min(round, t.rondes ?? round)}/{t.rondes ?? '?'}
      </h4>
      <p className="text-sm text-muted-foreground">
        ✅ les {w} premiers à la fin des rondes commencent dans le winner bracket (2 vies)
        {l ? ` ; 💀 les ${l} suivants commencent dans le loser bracket (1 vie)` : ''}
        {ranking.length > w + l ? ' ; les autres sont éliminés' : ''}.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Joueur</TableHead>
            <TableHead>V-D</TableHead>
            <TableHead title="Force des adversaires : total de leurs victoires">Adv.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranking.map((x) => (
            <TableRow key={x.id}>
              <TableCell>
                {x.abandon ? '' : x.rang <= w ? '✅ ' : x.rang <= w + l ? '💀 ' : ''}
                {x.rang}
              </TableCell>
              <TableCell>
                <span className={x.id === me ? 'font-semibold' : undefined}>{x.pseudo ?? '?'}</span>
                {x.abandon && (
                  <>
                    {' '}
                    <Badge variant="danger">🏳️ Abandon</Badge>
                  </>
                )}
              </TableCell>
              <TableCell>
                {x.victoires}-{x.defaites}
              </TableCell>
              <TableCell>{x.buchholz ?? 0}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {brackets.length ? (
        <DoubleBrackets matches={brackets} me={me} quit={quit} />
      ) : (
        <Rounds matches={swiss.filter((m) => m.tour === round)} me={me} quit={quit} />
      )}
    </div>
  );
}

// ── The trophy cabinet ──

const day = (d: string | null | undefined, month: 'short' | 'long' = 'short') =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month, year: 'numeric' }) : '?';

export function Cabinet({
  trophies,
  mine,
  player,
}: {
  trophies: Trophy[];
  mine: boolean;
  player: string;
}) {
  const [open, setOpen] = useState<Trophy | null>(null);
  const count = (p: number) => trophies.filter((x) => x.place === p).length;
  const cups = trophies.filter((x) => x.place > 0);
  const scarves = trophies.filter((x) => x.place === 0);
  const tile = (x: Trophy) => (
    <button
      key={`${x.tournoi ?? 0}-${x.place}-${x.le}`}
      type="button"
      disabled={!x.tournoi}
      onClick={() => setOpen(x)}
      className="flex w-32 cursor-pointer flex-col items-center gap-1 rounded-xl border p-2 text-center text-xs transition enabled:hover:-translate-y-0.5 disabled:cursor-default"
      title="Voir le détail"
    >
      <span className="size-16">
        <TrophyArt image={x.image} place={x.place} />
      </span>
      <span className="font-semibold">{PLACES[x.place]?.label}</span>
      <span className="line-clamp-2">{x.nom}</span>
      <small className="text-muted-foreground">
        {x.ceinture ?? ''} · {day(x.le)}
      </small>
    </button>
  );
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">🏆 Armoire à trophées</h3>
      {trophies.length ? (
        <>
          <p className="text-sm text-muted-foreground">
            {count(1)} tournoi{count(1) > 1 ? 's' : ''} gagné{count(1) > 1 ? 's' : ''} · {count(2)}{' '}
            fois finaliste · {count(3)} fois 3e · {count(0)} participation
            {count(0) > 1 ? 's' : ''}
          </p>
          {cups.length > 0 && <div className="flex flex-wrap gap-3">{cups.map(tile)}</div>}
          {scarves.length > 0 && <div className="flex flex-wrap gap-3">{scarves.map(tile)}</div>}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {mine
            ? 'Aucun trophée pour l’instant : inscris-toi au prochain tournoi (page Tournois) !'
            : 'Aucun trophée pour l’instant.'}
        </p>
      )}
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        {open && <TrophyDetail trophy={open} player={player} />}
      </Dialog>
    </section>
  );
}

function TrophyDetail({ trophy: x, player }: { trophy: Trophy; player: string }) {
  const id = x.tournoi ?? 0;
  const state = useQuery({ queryKey: tournamentKeys.one(id), queryFn: () => fetchTournament(id) });
  const t = state.data?.tournament;
  const path = (t?.matchs ?? []).filter(
    (m) =>
      (m.a === player || m.b === player) &&
      !(m.exempt && !m.b && m.phase !== 'winner' && m.phase !== 'tableau'),
  );
  const ranked = (t?.classement ?? []).find((c) => c.id === player);
  const reward = x.place > 0 ? (t?.recompenses ?? []).find((r) => r.place === x.place) : undefined;
  const podium = [1, 2, 3]
    .map((p) => {
      const e = (t?.places ?? []).find((q) => q.place === p);
      return e ? `${PLACE_NAMES[p]} : ${e.pseudo ?? '?'}` : '';
    })
    .filter(Boolean)
    .join(' · ');
  return (
    <DialogContent className="max-h-dialog">
      <DialogHeader>
        <div className="flex items-center gap-4">
          <span className="size-20 shrink-0">
            <TrophyArt image={x.image} place={x.place} />
          </span>
          <div className="flex flex-col gap-1">
            <DialogTitle>{t?.nom ?? x.nom}</DialogTitle>
            <Badge variant="warning">{PLACES[x.place]?.label}</Badge>
            {t && (
              <DialogDescription>
                {t.ceinture ?? ''} ·{' '}
                {t.format === 'suisse'
                  ? 'rondes suisses + double élimination'
                  : 'élimination directe'}{' '}
                · {(t.inscrits ?? []).length} participants ·{' '}
                {t.lance_le && t.fini_le && day(t.lance_le, 'long') !== day(t.fini_le, 'long')
                  ? `du ${day(t.lance_le, 'long')} au ${day(t.fini_le, 'long')}`
                  : `le ${day(t.fini_le ?? t.lance_le, 'long')}`}
              </DialogDescription>
            )}
          </div>
        </div>
      </DialogHeader>
      {state.error && <p role="alert">Détail du tournoi indisponible : {state.error.message}</p>}
      {podium && <p className="text-sm">{podium}</p>}
      {ranked && (
        <p className="text-sm">
          📊 Rondes suisses :{' '}
          <b>
            {ranked.victoires}-{ranked.defaites}
          </b>
          , {ranked.rang}
          {ranked.rang === 1 ? 'er' : 'e'} du classement
        </p>
      )}
      {path.length > 0 && (
        <>
          <h3 className="font-semibold">Parcours</h3>
          <Table>
            <TableBody>
              {path.map((m) => {
                const isA = m.a === player;
                const won = m.gagnant === player;
                return (
                  <TableRow key={`${m.phase ?? ''}-${m.tour}-${m.position}`}>
                    <TableCell>{m.nom_tour}</TableCell>
                    <TableCell>
                      {m.exempt ? (
                        <i>qualifié d'office</i>
                      ) : (
                        <>
                          contre <b>{(isA ? m.pseudo_b : m.pseudo_a) ?? '?'}</b>
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="block text-right whitespace-nowrap">
                        {m.exempt
                          ? ''
                          : m.gagnant
                            ? `${won ? '✅' : '❌'} ${String((isA ? m.score_a : m.score_b) ?? '')}-${String((isA ? m.score_b : m.score_a) ?? '')}`
                            : 'à jouer'}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
      {reward && hasReward(reward) && (
        <>
          <h3 className="font-semibold">Récompense</h3>
          <RewardLine reward={reward} />
        </>
      )}
    </DialogContent>
  );
}
