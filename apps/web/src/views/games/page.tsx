// "Jeux du jour", reimagined: the four games as cards, each showing where the player is today (to
// play, in progress, over and what it gave), the time left until they open again (midnight in
// Paris), and the rules in a dialog opened on the first visit and reopened by "?".
//
// Playing: a move is a database function (daily-games.ts); after it, the games and the gold are
// re-read, and the page shows the new state. Starting a game, cashing in and double or nothing are
// held (HoldButton): what they decide does not come back. The moves inside a game (a mushroom,
// higher or lower, scratching) are plain clicks. The reveals take the legacy page's pauses.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TONES } from '@/lib/tones';
import { ICONS } from '@/lib/icons';
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { Gold } from '@/components/money';
import { PageSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { backKeys, fetchBacks } from '@/data/backs';
import { cardKeys, fetchGameCardsFull } from '@/data/cards';
import {
  cashHigherLower,
  cashTicket,
  countdown,
  type DailyGames,
  dailyGamesKeys,
  doubleMushroom,
  fetchDailyGames,
  type GameCard,
  gameError,
  guessHigherLower,
  higherLowerOdds,
  minutesToMidnight,
  pickMushroom,
  playDuel,
  STREAK_GAINS,
  startHigherLower,
  takeTicket,
  TICKET_CELLS,
} from '@/data/daily-games';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { fetchPlayer, playerKeys } from '@/data/player';
import { useSession } from '@/lib/session';
import { markSeen, SEEN_KEYS } from '@/lib/seen';

const E = {
  mushroom: '\u{1F344}',
  leaf: '\u{1F342}',
  swords: '\u{2694}\u{FE0F}',
  heart: '\u{2764}\u{FE0F}',
  ticket: '\u{1F39F}\u{FE0F}',
  booster: '\u{1F3B4}',
  coin: '\u{1FA99}',
  tree: '\u{1F332}',
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A game's move. Played or refused, the games and the gold are re-read before the move counts as
// done: isPending covers the re-read, so the page never shows the old state after the move.
function useMove<A>(play: (arg: A) => Promise<unknown>) {
  const client = useQueryClient();
  const userId = useSession()?.user.id ?? '';
  return useMutation({
    mutationFn: play,
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: dailyGamesKeys.state }),
        client.invalidateQueries({ queryKey: playerKeys.player(userId) }),
      ]),
  });
}

const Refusal = ({ error }: { error: unknown }) =>
  error ? (
    <p role="alert" className="text-sm text-destructive">
      {gameError(error)}
    </p>
  ) : null;

export function GamesPage() {
  const games = useQuery({ queryKey: dailyGamesKeys.state, queryFn: fetchDailyGames });
  // First visit: the rules open by themselves (once).
  const [rulesOpen, setRulesOpen] = useState(
    () => localStorage.getItem(SEEN_KEYS.gamesRules) === null,
  );
  const closeRules = (open: boolean) => {
    setRulesOpen(open);
    if (!open) markSeen(SEEN_KEYS.gamesRules, '1');
  };

  if (games.error)
    return <p role="alert">Jeux du jour indisponibles pour le moment : {games.error.message}</p>;
  if (!games.data) return <PageSkeleton />;
  const g = games.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">
          Des petits jeux gratuits pour gagner des <Gold /> et des boosters : une partie de chaque
          par jour, remise à zéro à minuit.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Les règles"
            onClick={() => setRulesOpen(true)}
          >
            <ICONS.help />
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Mushrooms state={g.champignons} />
        <Duel state={g.duel} />
        <HigherLower state={g.plusmoins} />
        <Ticket state={g.ticket} />
      </div>
      <Rules open={rulesOpen} onOpenChange={closeRules} />
    </div>
  );
}

// The time left until midnight in Paris, ticking every 30 s.
function useUntilMidnight(): string {
  const [minutes, setMinutes] = useState(() => minutesToMidnight(new Date()));
  useEffect(() => {
    const tick = setInterval(() => setMinutes(minutesToMidnight(new Date())), 30_000);
    return () => clearInterval(tick);
  }, []);
  return countdown(minutes);
}

// A played game says when it comes back instead of its rule (the rules stay behind "?").
function Game({
  icon,
  title,
  rule,
  next,
  over,
  bonus,
  children,
}: {
  icon: string;
  title: string;
  rule: ReactNode;
  next: string; // "une nouvelle cueillette": what comes back at midnight
  over: boolean;
  bonus?: boolean;
  children: ReactNode;
}) {
  const left = useUntilMidnight();
  return (
    // Played, the game steps back a little. (Its border-primary/50 when not played showed nothing: the
    // card draws a ring, no border.)
    <div className={over ? 'opacity-90' : ''}>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span aria-hidden>{icon}</span> {title}
            {bonus && <Badge variant="outline">Bonus</Badge>}
            <Badge variant={over ? 'secondary' : 'info'} className="ml-auto">
              {over ? 'Joué' : 'À jouer'}
            </Badge>
          </CardTitle>
          <CardDescription>
            {over ? (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <ICONS.wait className="size-3.5" /> Reviens dans {left} pour {next}.
              </span>
            ) : (
              rule
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">{children}</CardContent>
      </Card>
    </div>
  );
}

// A result line: green for a win, neutral for a loss.
const Result = ({ won, children }: { won: boolean; children: ReactNode }) => (
  <p className={`rounded-lg border p-2 text-sm ${won ? TONES.success.box : 'bg-muted/40'}`}>
    {children}
  </p>
);

const ToPlay = () => <p className="text-sm text-muted-foreground">Pas encore joué aujourd'hui.</p>;

function Mushrooms({ state: s }: { state: DailyGames['champignons'] }) {
  const over = s.joue;
  // The mushroom being picked: it shakes 900 ms at least, as on the legacy page.
  const [picking, setPicking] = useState<number | null>(null);
  const pick = useMove((i: number) => Promise.all([pickMushroom(i), wait(900)]));
  // Double or nothing: the coin spins 1.4 s.
  const double = useMove(() => Promise.all([doubleMushroom(), wait(1400)]));
  // The server refuses the double when the gold no longer covers the gain (spent since: MONNAIE_
  // INSUFFISANTE, 24-jeux-du-jour.sql): said before holding, from the gold the shell keeps fresh.
  const userId = useSession()?.user.id ?? '';
  const gold = useQuery({
    queryKey: playerKeys.player(userId),
    queryFn: () => fetchPlayer(userId),
    enabled: userId !== '',
  }).data?.monnaie;
  const spent = gold !== undefined && s.gain !== undefined && gold < s.gain;
  // The values under the three mushrooms: the others, with the pick put back at its place.
  const values = (() => {
    const v = [...(s.autres ?? [])];
    if (s.choix !== undefined && s.gain !== undefined) v.splice(s.choix, 0, s.gain);
    return v;
  })();
  return (
    <Game
      icon={E.mushroom}
      title="Les champignons de la forêt"
      next="une nouvelle cueillette"
      over={over}
      rule={
        <>
          Choisis un champignon sur trois : les <Gold /> cachés dessous sont pour toi. Puis, si tu
          veux, quitte ou double (une chance sur deux).
        </>
      }
    >
      {!over ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                disabled={pick.isPending}
                onClick={() => {
                  setPicking(i);
                  pick.mutate(i);
                }}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-3 transition hover:-translate-y-0.5 hover:border-primary disabled:cursor-default ${
                  picking === i && pick.isPending ? 'animate-bounce border-primary' : ''
                }`}
              >
                <span className="text-4xl" aria-hidden>
                  {E.mushroom}
                </span>
                <small className="text-muted-foreground">Champignon {i + 1}</small>
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {pick.isPending ? 'Cueillette…' : 'Clique sur un champignon.'}
          </p>
          <Refusal error={pick.error} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {values.map((v, i) => {
              const picked = i === s.choix;
              return (
                <div
                  key={i}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center ${
                    picked ? 'border-success bg-success/10' : 'opacity-60'
                  }`}
                >
                  <span className="text-3xl" aria-hidden>
                    {picked ? E.mushroom : E.leaf}
                  </span>
                  <b className={v >= 100 ? TONES.gold.text : ''}>
                    <Gold n={v} sign />
                  </b>
                  <small className="text-muted-foreground">{picked ? 'ton choix' : 'raté…'}</small>
                </div>
              );
            })}
          </div>
          {double.isPending ? (
            <p className="flex items-center justify-center gap-2 text-sm">
              <span className="inline-block animate-spin text-2xl" aria-hidden>
                {E.coin}
              </span>
              Pile ou face…
            </p>
          ) : s.double_fait ? (
            <Result won={!!s.double_gagne}>
              {s.double_gagne ? (
                <>
                  Quitte ou double gagné : <Gold n={s.gain} sign /> de plus !
                </>
              ) : (
                <>
                  Quitte ou double perdu : les <Gold n={s.gain} /> sont repartis dans la forêt.
                </>
              )}
            </Result>
          ) : (
            <>
              <Result won>
                Tu as gagné <Gold n={s.gain} />. Quitte ou double : une chance sur deux de gagner{' '}
                <Gold n={s.gain} /> de plus, ou de les perdre.
              </Result>
              <HoldButton
                variant="outline"
                disabled={spent || double.isPending}
                onConfirm={() => double.mutate()}
              >
                {double.isPending
                  ? 'Pile ou face…'
                  : `${E.coin} Maintiens pour tenter le quitte ou double`}
              </HoldButton>
              {spent && (
                <p className="text-sm text-muted-foreground">
                  Tu as déjà dépensé ce gain : le quitte ou double n'est plus possible.
                </p>
              )}
            </>
          )}
          <Refusal error={double.error} />
        </>
      )}
    </Game>
  );
}

function CardFace({
  card,
  src,
  value,
  tone,
}: {
  card: GameCard;
  src: string | null;
  value: ReactNode;
  tone?: 'win' | 'lose';
}) {
  return (
    <div
      className={`flex w-24 flex-col items-center gap-1 text-center ${tone === 'lose' ? 'opacity-50' : ''}`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className={`aspect-5/7 w-full rounded-md object-cover ${tone === 'win' ? 'rarity-ring-glow' : 'rarity-ring'}`}
          style={{ '--rarity': card.couleur ?? 'var(--muted-foreground)' }}
        />
      ) : (
        <div className="aspect-5/7 w-full rounded-md bg-muted" />
      )}
      <small className="line-clamp-1">{card.nom}</small>
      <b className="tabular-nums">{value}</b>
    </div>
  );
}

// The images of the cards a game shows, loaded before the game shows them (and its result): until
// then, null. A failed image counts as loaded (its card shows without it).
function useCardImages(cards: GameCard[]): ((card: GameCard) => string | null) | null {
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const urlOf = (card: GameCard) => imageUrl(card.image ?? null, mirror.data ?? new Set());
  const key = mirror.data
    ? cards
        .map(urlOf)
        .filter((u): u is string => !!u)
        .join('|')
    : null;
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (key === null) return;
    const urls = key ? key.split('|') : [];
    let cancelled = false;
    let left = urls.length;
    const done = () => {
      if (!cancelled && --left <= 0) setLoaded(key);
    };
    if (!urls.length) {
      // Nothing to load: settled on the next tick, never inside the effect itself.
      const t = setTimeout(() => !cancelled && setLoaded(key), 0);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
    for (const url of urls) {
      const img = new Image();
      img.onload = done;
      img.onerror = done;
      img.src = url;
    }
    return () => {
      cancelled = true;
    };
  }, [key]);
  return key !== null && loaded === key ? urlOf : null;
}

// What a game shows while its cards load.
const Loading = () => (
  <div className="flex flex-col gap-3">
    <div className="flex justify-center gap-4">
      <Skeleton className="aspect-5/7 w-24 rounded-md" />
      <Skeleton className="aspect-5/7 w-24 rounded-md" />
    </div>
    <Skeleton className="h-10 w-full rounded-lg" />
  </div>
);

function Duel({ state: s }: { state: DailyGames['duel'] }) {
  const rounds = s.manches ?? [];
  // A duel played here reveals its rounds one by one (0.6 s, then 1.7 s each, as on the legacy
  // page): how many are shown so far. null: all of them (a duel played before, or fully revealed).
  const [shown, setShown] = useState<number | null>(null);
  const play = useMove(playDuel);
  const revealing = shown !== null && !play.isPending && s.joue;
  useEffect(() => {
    if (!revealing) return;
    const t = setTimeout(
      () => setShown(shown + 1 > rounds.length ? null : shown + 1),
      shown === 0 ? 600 : 1700,
    );
    return () => clearTimeout(t);
  }, [revealing, shown, rounds.length]);
  const visible = shown === null ? rounds : rounds.slice(0, shown);
  const last = visible[visible.length - 1];
  const src = useCardImages(rounds.flatMap((m) => [m.moi, m.bot]));
  const mark = (w: string) => (w === 'moi' ? '\u{2705}' : w === 'bot' ? '\u{274C}' : '\u{1F91D}');
  const done = s.joue && shown === null;
  return (
    <Game
      icon={E.swords}
      title="Duel d'ATQ"
      next="un nouveau duel"
      over={done}
      rule="Tire une carte du jeu, le bot aussi : la plus grosse ATQ gagne la manche. Gagne 2 manches et remporte un booster !"
    >
      {!s.joue && !play.isPending ? (
        <>
          <ToPlay />
          <HoldButton
            onConfirm={() => {
              setShown(0);
              play.mutate(undefined, { onError: () => setShown(null) });
            }}
          >
            {E.swords} Maintiens pour lancer le duel
          </HoldButton>
          <Refusal error={play.error} />
        </>
      ) : !src || play.isPending ? (
        <Loading />
      ) : (
        <>
          {last ? (
            <div className="flex items-center justify-center gap-4">
              <CardFace
                card={last.moi}
                src={src(last.moi)}
                value={`ATQ ${last.moi.atq ?? '?'}`}
                tone={last.gagnant === 'moi' ? 'win' : 'lose'}
              />
              <b className="text-muted-foreground">VS</b>
              <CardFace
                card={last.bot}
                src={src(last.bot)}
                value={`ATQ ${last.bot.atq ?? '?'}`}
                tone={last.gagnant === 'bot' ? 'win' : 'lose'}
              />
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">Les cartes sont tirées…</p>
          )}
          {done && (
            <Result won={!!s.gagne}>
              {s.gagne ? (
                <>
                  Victoire ! Tu gagnes <b>{s.booster?.nom ?? 'un booster'}</b> {E.booster} : il
                  t'attend, ouvre-le en live avec <code>!booster</code>.
                </>
              ) : (
                'Le bot gagne cette fois… revanche demain !'
              )}
            </Result>
          )}
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {visible.map((m, i) => (
              <li key={i} className="tabular-nums">
                Manche {i + 1} · {m.moi.nom} <b>{m.moi.atq}</b> contre <b>{m.bot.atq}</b>{' '}
                {m.bot.nom} {mark(m.gagnant)}
              </li>
            ))}
          </ul>
        </>
      )}
    </Game>
  );
}

// "62 %": a chance, rounded.
const percent = (p: number) => `${Math.round(p * 100)} %`;

function HigherLower({ state: s }: { state: DailyGames['plusmoins'] }) {
  const streak = s.serie ?? 0;
  const over = !!s.fini;
  const playing = s.joue && !over;
  const last = s.coups?.[s.coups.length - 1];
  // Over with nothing won: the step it was going for is the one lost.
  const lost = over && (s.gain ?? 0) === 0;
  const src = useCardImages([...(last ? [last.avant] : []), ...(s.carte ? [s.carte] : [])]);
  // The chance of each choice: the HP of every active fighter, against the cards seen.
  const cards = useQuery({
    queryKey: cardKeys.gameCardsFull,
    queryFn: fetchGameCardsFull,
    enabled: playing,
  });
  const fighters = new Map(
    (cards.data ?? [])
      .filter((c) => c.type === 'combattant' && c.pv !== null && !Number.isNaN(Number(c.pv)))
      .map((c) => [c.id, Number(c.pv)]),
  );
  const odds = playing ? higherLowerOdds(fighters, s) : null;
  const start = useMove(startHigherLower);
  const guess = useMove(guessHigherLower);
  const cash = useMove(cashHigherLower);
  const busy = start.isPending || guess.isPending || cash.isPending;
  return (
    <Game
      icon={E.heart}
      title="Plus ou moins"
      next="une nouvelle partie"
      over={over}
      rule={
        <>
          La carte suivante aura-t-elle plus ou moins de PV ? Enchaîne les bonnes réponses, encaisse
          quand tu veux… une erreur et tout est perdu !
        </>
      }
    >
      <div className="flex gap-1" aria-label={`Série : ${streak} sur ${STREAK_GAINS.length}`}>
        {STREAK_GAINS.map((gain, i) => (
          <span
            key={gain}
            className={`flex-1 rounded-md border px-1 py-1 text-center text-xs tabular-nums ${
              i < streak
                ? 'border-success bg-success/20'
                : i === streak && lost
                  ? 'border-danger bg-danger/20 text-danger-ink'
                  : i === streak && !over && s.joue
                    ? 'border-primary'
                    : 'opacity-60'
            }`}
          >
            {gain}
          </span>
        ))}
      </div>
      {!s.joue ? (
        <>
          <ToPlay />
          <HoldButton disabled={busy} onConfirm={() => start.mutate()}>
            {E.heart} Maintiens pour commencer
          </HoldButton>
        </>
      ) : !src ? (
        <Loading />
      ) : (
        <>
          {s.carte && (
            <div className="flex items-center justify-center gap-4">
              {last && (
                <CardFace
                  card={last.avant}
                  src={src(last.avant)}
                  value={`PV ${last.avant.pv ?? '?'}`}
                  tone="lose"
                />
              )}
              {last && <span aria-hidden>{last.ok ? '\u{2705}' : '\u{274C}'}</span>}
              <CardFace
                card={s.carte}
                src={src(s.carte)}
                value={`PV ${s.carte.pv ?? '?'}`}
                tone={last ? (last.ok ? 'win' : 'lose') : undefined}
              />
            </div>
          )}
          {over ? (
            <Result won={(s.gain ?? 0) > 0}>
              {(s.gain ?? 0) > 0 ? (
                <>
                  {streak >= STREAK_GAINS.length ? 'Série parfaite ! ' : ''}Tu encaisses{' '}
                  <Gold n={s.gain} /> !
                </>
              ) : (
                "Raté ! La série s'arrête là, rien n'est gagné cette fois."
              )}
            </Result>
          ) : (
            <>
              <p className="text-center text-sm">
                La prochaine carte a-t-elle plus ou moins que <b>{s.carte?.pv ?? '?'} PV</b> ?
                <br />
                <span className="text-muted-foreground">
                  Bonne réponse : <Gold n={s.gain_suivant} /> à encaisser.
                </span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['plus', 'moins'] as const).map((c) => (
                  <Button
                    key={c}
                    variant="outline"
                    size="stacked"
                    disabled={busy}
                    onClick={() => guess.mutate(c)}
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      {c === 'plus' ? <ICONS.up /> : <ICONS.down />}
                      {guess.isPending && guess.variables === c
                        ? 'Révélation…'
                        : c === 'plus'
                          ? 'Plus'
                          : 'Moins'}
                    </span>
                    <small className="text-muted-foreground tabular-nums">
                      {odds ? `${percent(odds[c])} de chances` : '\u{2026}'}
                    </small>
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Les chances comptent les combattants pas encore vus dans la partie ; une égalité de
                PV gagne dans les deux sens.
              </p>
              {streak > 0 && (
                <HoldButton variant="secondary" disabled={busy} onConfirm={() => cash.mutate()}>
                  Maintiens pour encaisser <Gold n={s.gain_actuel} />
                </HoldButton>
              )}
            </>
          )}
        </>
      )}
      <Refusal error={start.error ?? guess.error ?? cash.error} />
    </Game>
  );
}

function Ticket({ state: s }: { state: DailyGames['ticket'] }) {
  const over = !!s.encaisse;
  const take = useMove(takeTicket);
  // The cells scratched off. Not kept: a reload covers them again, as on the legacy page.
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  // Every cell seen: the ticket pays, its winning trio glowing 0.9 s first.
  const cash = useMove(() => Promise.all([cashTicket(), wait(900)]));
  const grid = s.grille ?? [];
  const reveal = (cells: number[]) => {
    const next = new Set([...revealed, ...cells]);
    setRevealed(next);
    if (next.size === grid.length && revealed.size < grid.length) cash.mutate();
  };
  const backs = useQuery({
    queryKey: backKeys.mine,
    queryFn: fetchBacks,
    enabled: s.joue && !over,
  });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const backImage = imageUrl(
    backs.data?.find((b) => b.actif)?.image ?? null,
    mirror.data ?? new Set(),
  );
  const allSeen = over || (grid.length > 0 && revealed.size === grid.length);
  // One gesture for the whole ticket: pressed in a cell, it keeps scratching in the next ones.
  const pressing = useRef(false);
  useEffect(() => {
    const release = () => (pressing.current = false);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, []);
  return (
    <Game
      icon={E.ticket}
      title="Ticket à gratter"
      next="un nouveau ticket"
      bonus
      over={over}
      rule={
        <>
          Gratte les 6 cartes : trouve 3 fois la même rareté pour gagner des <Gold />, ou 3 boosters{' '}
          {E.booster} pour remporter un booster !
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5 text-xs">
        {Object.entries(TICKET_CELLS).map(([k, c]) => (
          <span
            key={k}
            className="rounded-full border border-(--cell) px-2 py-0.5"
            style={{ '--cell': c.colour }}
          >
            {k === 'booster' ? (
              `3 ${E.booster} = 1 booster`
            ) : (
              <>
                3 {c.label} = <Gold n={c.gold} />
              </>
            )}
          </span>
        ))}
      </div>
      {!s.joue ? (
        <>
          <ToPlay />
          <HoldButton disabled={take.isPending} onConfirm={() => take.mutate()}>
            {E.ticket} Maintiens pour prendre ton ticket
          </HoldButton>
          <Refusal error={take.error} />
        </>
      ) : (
        <>
          <div className="mx-auto grid w-full max-w-60 grid-cols-3 gap-2">
            {grid.map((k, i) => {
              const c = TICKET_CELLS[k] ?? { label: k, colour: 'var(--muted-foreground)', gold: 0 };
              const won = allSeen && k === s.gagnant;
              return (
                <div
                  key={i}
                  className={`relative flex aspect-5/7 flex-col items-center justify-center gap-1 overflow-hidden rounded-md border-2 cell-tint text-xs font-semibold ${
                    allSeen && !won ? 'opacity-70' : ''
                  } ${won ? 'cell-glow' : ''}`}
                  style={{ '--cell': c.colour }}
                >
                  <span className="text-xl text-(--cell)" aria-hidden>
                    {k === 'booster' ? E.booster : '\u{25C6}'}
                  </span>
                  {c.label}
                  {!over && !revealed.has(i) && (
                    <Scratch back={backImage} pressing={pressing} onRevealed={() => reveal([i])} />
                  )}
                </div>
              );
            })}
          </div>
          {over ? (
            <Result won={!!s.gagnant}>
              {s.gagnant === 'booster' ? (
                <>
                  3 boosters ! Tu gagnes <b>{s.booster?.nom ?? 'un booster'}</b> {E.booster} : il
                  t'attend, ouvre-le en live avec <code>!booster</code>.
                </>
              ) : s.gagnant ? (
                <>
                  3 × {TICKET_CELLS[s.gagnant]?.label ?? s.gagnant} ! Tu gagnes <Gold n={s.gain} />.
                </>
              ) : (
                'Pas de trio cette fois… nouveau ticket demain !'
              )}
            </Result>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <small className="text-muted-foreground">
                {cash.isPending ? 'Encaissement…' : 'Gratte au doigt ou à la souris.'}
              </small>
              <Button
                variant="outline"
                size="sm"
                disabled={allSeen}
                onClick={() => reveal(grid.map((_, i) => i))}
              >
                <ICONS.scratchAll /> Tout gratter
              </Button>
            </div>
          )}
          <Refusal error={cash.error} />
        </>
      )}
    </Game>
  );
}

// The scratch layer over a ticket cell: the player's back (or a green forest pattern) with
// "GRATTE", erased under the pointer. Seen once more than half of an 8 x 11 grid of points has been
// scratched, as on the legacy page. pressing: the ticket's gesture, shared by its cells, so a stroke
// goes on from one cell to the next.
function Scratch({
  back,
  pressing,
  onRevealed,
}: {
  back: string | null;
  pressing: RefObject<boolean>;
  onRevealed: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reported = useRef(false);
  const revealed = useRef(onRevealed);
  useEffect(() => {
    revealed.current = onRevealed;
  });
  useEffect(() => {
    const cv = canvas.current;
    const x = cv?.getContext('2d');
    if (!cv || !x) return;
    const W = (cv.width = cv.clientWidth * 2);
    const H = (cv.height = cv.clientHeight * 2);
    const N = 8;
    const M = 11;
    const touched = new Set<number>();
    let previous: [number, number] | null = null;
    let cancelled = false;
    const paint = (image: HTMLImageElement | null) => {
      x.globalCompositeOperation = 'source-over';
      const g = x.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#1f3a26');
      g.addColorStop(1, '#0f1f15');
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
      if (image) x.drawImage(image, 0, 0, W, H);
      else {
        x.fillStyle = 'rgba(255,255,255,.06)';
        for (let k = -H; k < W; k += 18) x.fillRect(k, 0, 8, H * 2);
        x.font = `${W * 0.36}px serif`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(E.tree, W / 2, H / 2);
      }
      x.fillStyle = 'rgba(0,0,0,.45)';
      x.fillRect(0, H - W * 0.2, W, W * 0.2);
      x.fillStyle = '#fde68a';
      x.font = `700 ${W * 0.11}px system-ui`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('GRATTE', W / 2, H - W * 0.1);
      x.globalCompositeOperation = 'destination-out';
      previous = null;
    };
    paint(null);
    if (back) {
      // The back replaces the pattern only if nothing has been scratched yet.
      const image = new Image();
      image.onload = () => {
        if (!cancelled && touched.size === 0) paint(image);
      };
      image.src = back;
    }
    const scratch = (e: PointerEvent) => {
      const b = cv.getBoundingClientRect();
      const px = ((e.clientX - b.left) / b.width) * W;
      const py = ((e.clientY - b.top) / b.height) * H;
      const r = W * 0.16;
      x.lineWidth = r * 2;
      x.lineCap = 'round';
      x.beginPath();
      if (previous) {
        x.moveTo(previous[0], previous[1]);
        x.lineTo(px, py);
        x.stroke();
      }
      x.arc(px, py, r, 0, 7);
      x.fill();
      previous = [px, py];
      for (let i = 0; i < N; i++)
        for (let j = 0; j < M; j++)
          if (Math.hypot(((i + 0.5) * W) / N - px, ((j + 0.5) * H) / M - py) < r * 1.1)
            touched.add(i * M + j);
      if (touched.size > N * M * 0.5 && !reported.current) {
        reported.current = true;
        revealed.current();
      }
    };
    const onDown = (e: PointerEvent) => {
      pressing.current = true;
      previous = null;
      // A touch captures the pointer to this cell on its own: released, the next cell gets the moves.
      if (cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
      scratch(e);
    };
    const onMove = (e: PointerEvent) => {
      if (pressing.current) scratch(e);
    };
    // Entering or leaving a cell starts a new stroke: no line drawn from where the last one ended.
    const restart = () => (previous = null);
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerenter', restart);
    cv.addEventListener('pointerleave', restart);
    return () => {
      cancelled = true;
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerenter', restart);
      cv.removeEventListener('pointerleave', restart);
    };
  }, [back, pressing]);
  return <canvas ref={canvas} className="absolute inset-0 size-full cursor-pointer touch-none" />;
}

// The rules of the four games: opened on the first visit, reopened by "?".
function Rules({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-dialog overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Les jeux du jour</DialogTitle>
          <DialogDescription>
            Une partie de chaque par jour, gratuite. Tout se remet à zéro à minuit (heure de Paris).
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm">
          <p>
            <b>{E.mushroom} Les champignons</b> : choisis 1 champignon sur 3 et gagne les <Gold />{' '}
            cachés dessous (de <Gold n={10} /> à <Gold n={250} />
            ). Puis tente un quitte ou double… si tu l'oses.
          </p>
          <p>
            <b>{E.swords} Duel d'ATQ</b> : toi contre le bot au meilleur des 3 manches, chacun tire
            une carte du jeu, la plus grosse ATQ gagne. La victoire rapporte un booster.
          </p>
          <p>
            <b>{E.heart} Plus ou moins</b> : la carte suivante a-t-elle plus ou moins de PV ?
            Enchaîne les bonnes réponses jusqu'à <Gold n={200} />, encaisse quand tu veux : une
            erreur et tout est perdu.
          </p>
          <p>
            <b>{E.ticket} Ticket à gratter (bonus)</b> : gratte 6 cartes ; 3 fois la même rareté
            rapporte de <Gold n={15} /> à <Gold n={300} />, et 3 boosters {E.booster} font gagner un
            booster.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
