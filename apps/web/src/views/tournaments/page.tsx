// Tournaments (the legacy page's vTournois): the current tournament (or one of the past ones), its
// rewards, registering or leaving, giving up once started, the entrants and the format's preview
// during registration, then the bracket; and the list of past tournaments with their winner.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
import { Bracket, DoubleBrackets, hasReward, RewardLine, TrophyArt } from '@/components/tournament';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DIVISIONS,
  fetchChampionshipDecks,
  fetchTournament,
  isDivision,
  leave,
  PLACE_NAMES,
  register,
  swissCounts,
  swissPreview,
  type Tournament,
  tournamentKeys,
} from '@/data/tournaments';
import { useSession } from '@/lib/session';
import { TONES } from '@/lib/tones';

const STATUS = {
  inscriptions: '📝 Inscriptions ouvertes',
  en_cours: '⚔️ En cours',
  termine: '🏁 Terminé',
  annule: 'Annulé',
} as const;

const day = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';

export function TournamentsPage() {
  const me = useSession()?.user.id ?? '';
  const [id, setId] = useState<number | null>(null);
  const state = useQuery({ queryKey: tournamentKeys.one(id), queryFn: () => fetchTournament(id) });
  const decks = useQuery({
    queryKey: tournamentKeys.decks(me),
    queryFn: () => fetchChampionshipDecks(me),
    enabled: me !== '',
  });
  if (state.error)
    return <p role="alert">Tournois indisponibles pour le moment : {state.error.message}</p>;
  if (!state.data) return <PageSkeleton />;
  const t = state.data.tournament;
  const past = state.data.past;
  const swiss = t?.format === 'suisse';

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        {swiss ? (
          <>
            Format <b>rondes suisses + double élimination</b> : des rondes en <b>BO1</b> où chacun
            affronte un joueur au même nombre de victoires (jamais deux fois le même), puis tout le
            monde continue dans un tableau à double élimination en <b>BO3</b> : les premiers du
            classement commencent dans le winner bracket (2 vies), les suivants dans le loser
            bracket (1 vie). Une défaite dans le winner bracket fait descendre dans le loser
            bracket, une défaite dans le loser bracket élimine. Finale du loser et grande finale en{' '}
            <b>BO5</b> ; si le joueur venu du loser gagne la grande finale, une revanche décide.
          </>
        ) : (
          <>
            Des tournois à élimination directe, joués en live combat après combat, sans avoir besoin
            d'être là : inscris-toi avec ton deck de championnat (celui de la ceinture du thème), le
            tableau est tiré au sort au lancement. <b>BO1</b> jusqu'aux quarts, <b>BO3</b> en
            demi-finale, <b>BO5</b> en petite finale et en finale ; un combat nul est rejoué.
          </>
        )}{' '}
        Combats en relais, 3 combattants chacun. Les trois premiers gagnent un trophée et chaque
        participant une écharpe, gardés pour toujours dans l'armoire de leur profil, et les quatre
        premiers les récompenses du tournoi.
      </p>
      {id !== null && t && !['inscriptions', 'en_cours'].includes(t.statut) && (
        <div>
          <Button variant="outline" onClick={() => setId(null)}>
            ← Tournoi actuel
          </Button>
        </div>
      )}
      {t ? (
        <Current tournament={t} me={me} decks={decks.data ?? new Map()} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucun tournoi pour l'instant : le prochain sera annoncé en live.
        </p>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">🏛️ Palmarès</h2>
        {past.length ? (
          <Table>
            <TableBody>
              {past.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {isDivision(p.division) ? DIVISIONS[p.division].icon : ''} <b>{p.nom}</b>
                    <br />
                    <small className="text-muted-foreground">
                      {day(p.fini_le)} · {p.joueurs ?? 0} joueurs
                    </small>
                  </TableCell>
                  <TableCell>👑 {p.pseudo_gagnant ?? '?'}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setId(p.id);
                        window.scrollTo({ top: 0 });
                      }}
                    >
                      Voir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun tournoi terminé pour l'instant.</p>
        )}
      </section>
    </div>
  );
}

function Current({
  tournament: t,
  me,
  decks,
}: {
  tournament: Tournament;
  me: string;
  decks: Map<string, number[]>;
}) {
  const client = useQueryClient();
  const settle = () => client.invalidateQueries({ queryKey: tournamentKeys.all });
  const join = useMutation({ mutationFn: register, onSettled: settle });
  const quit = useMutation({ mutationFn: leave, onSettled: settle });
  const entrants = t.inscrits ?? [];
  const registered = entrants.some((x) => x.id === me);
  const division = isDivision(t.division) ? DIVISIONS[t.division] : null;
  const deckReady = (decks.get(t.division) ?? []).length === 15;
  const onScreen = (t.matchs ?? []).some((m) => m.a_l_ecran);
  const rewards = (t.recompenses ?? []).filter(hasReward);
  const gaveUp = (t.abandons ?? []).some((x) => x.id === me);
  const message = join.data ?? quit.data;
  const error = join.error ?? quit.error;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          <span className="size-24 shrink-0">
            <TrophyArt image={t.trophee} place={1} />
          </span>
          <div className="flex min-w-56 flex-1 flex-col gap-2">
            <span className="text-2xl font-black">{t.nom}</span>
            <span className="text-sm text-muted-foreground">
              {STATUS[t.statut]} · deck de championnat {division?.icon ?? ''} {t.ceinture ?? ''} ·{' '}
              {entrants.length}
              {t.statut === 'inscriptions' ? `/${t.max_joueurs ?? '?'}` : ''} joueur
              {entrants.length > 1 ? 's' : ''}
              {t.statut === 'termine' && t.fini_le ? ` · le ${day(t.fini_le)}` : ''}
            </span>
            {rewards.length > 0 && (
              <div className="flex flex-col gap-1 text-sm">
                <b>🎁 À gagner</b>
                {rewards.map((r) => (
                  <div key={r.place} className="flex flex-wrap items-center gap-2">
                    <small className="text-muted-foreground">{PLACE_NAMES[r.place]}</small>
                    <RewardLine reward={r} />
                  </div>
                ))}
              </div>
            )}
            {t.statut === 'termine' && t.pseudo_gagnant && (
              <span className={`text-xl font-extrabold ${TONES.gold.text}`}>
                👑 {t.pseudo_gagnant} remporte le tournoi !
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {t.statut === 'inscriptions' &&
                (registered ? (
                  <>
                    <Badge variant="success">Tu es inscrit ✓</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={quit.isPending}
                      onClick={() => quit.mutate()}
                    >
                      Se retirer
                    </Button>
                  </>
                ) : !deckReady ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/deck" search={{ deck: `ceinture-${t.division}` }}>
                      Prépare ton deck {division?.icon ?? ''}
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" disabled={join.isPending} onClick={() => join.mutate()}>
                    🎖️ S'inscrire
                  </Button>
                ))}
              {t.statut === 'en_cours' &&
                registered &&
                (gaveUp ? (
                  <span className="text-sm">
                    <Badge variant="danger">🏳️ Abandon confirmé</Badge> Tes matchs restants sont
                    perdus par forfait ; tes résultats d'avant restent dans le tableau.
                  </span>
                ) : (t.en_lice ?? []).includes(me) ? (
                  <>
                    <HoldButton
                      size="sm"
                      variant="destructive"
                      disabled={quit.isPending}
                      onConfirm={() => quit.mutate()}
                    >
                      🏳️ Abandonner le tournoi
                    </HoldButton>
                    <small className="text-muted-foreground">
                      C'est définitif : tes matchs restants sont perdus par forfait, sans trophée de
                      place ni récompense. Ou <b>!tournoi quitter</b> dans le chat.
                    </small>
                  </>
                ) : (
                  <small className="text-muted-foreground">Tu es éliminé du tournoi.</small>
                ))}
            </div>
            {t.statut === 'inscriptions' && (
              <small className="text-muted-foreground">
                Ou dans le chat pendant le live : <b>!tournoi</b> (et <b>!tournoi quitter</b> pour
                te retirer). Ton deck de championnat est figé au moment de l'inscription.
              </small>
            )}
            {message && <p className="text-sm">{message}</p>}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {t.statut === 'inscriptions' ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Inscrits</h2>
          {entrants.length ? (
            <div className="flex flex-wrap gap-2">
              {entrants.map((x) => (
                <Badge key={x.id} variant={x.id === me ? 'info' : 'outline'}>
                  {x.pseudo ?? '?'}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Personne pour l'instant : sois le premier !
            </p>
          )}
          {t.format === 'suisse' && <SwissPreview tournament={t} me={me} />}
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Le tableau</h2>
          {onScreen && (
            <p className="text-sm text-muted-foreground">
              ⚔️ Combat en cours à l'écran… le résultat s'affiche à la fin de l'animation.
            </p>
          )}
          <Bracket tournament={t} me={me} />
        </section>
      )}
    </div>
  );
}

function SwissPreview({ tournament: t, me }: { tournament: Tournament; me: string }) {
  const n = (t.inscrits ?? []).length;
  if (n < 2)
    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">🔮 Le format</h3>
        <p className="text-sm text-muted-foreground">
          Des rondes suisses en BO1, puis tout le monde (ou presque) continue dans un tableau final
          à double élimination. Le détail dépend du nombre d'inscrits et s'affiche ici dès le 2e
          inscrit. Quelques exemples :
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inscrits</TableHead>
              <TableHead>Rondes suisses</TableHead>
              <TableHead>✅ Winner bracket</TableHead>
              <TableHead>💀 Loser bracket</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[4, 6, 8, 10, 12, 16, 20].map((k) => {
              const f = swissCounts(k, t.places_winner, t.places_loser);
              return (
                <TableRow key={k}>
                  <TableCell>{k}</TableCell>
                  <TableCell>{f.rounds}</TableCell>
                  <TableCell>les {f.winner} premiers</TableCell>
                  <TableCell>
                    {f.loser ? `les ${f.loser} suivants` : '—'}
                    {k > f.winner + f.loser ? ` (${k - f.winner - f.loser} éliminés)` : ''}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  const { rounds, winner: w, loser: l } = swissCounts(n, t.places_winner, t.places_loser);
  const s = rounds > 1 ? 's' : '';
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold">
        🔮 Le format, avec {n} inscrit{n > 1 ? 's' : ''}
      </h3>
      <p className="text-sm text-muted-foreground">
        <b>
          {rounds} ronde{s} suisse{s}
        </b>{' '}
        en BO1 (la 1re tirée au sort au lancement, les suivantes entre joueurs au même nombre de
        victoires), puis le tableau final : <b>✅ les {w} premiers</b> en winner bracket (2 vies)
        {l ? (
          <>
            , <b>💀 les {l} suivants</b> en loser bracket (1 vie)
          </>
        ) : null}
        {n > w + l ? `, les ${n - w - l} derniers éliminés` : ''}. Les places se remplissent avec le
        classement à la fin des rondes ; l'aperçu change à chaque inscription.
      </p>
      <DoubleBrackets matches={swissPreview(n, t.places_winner, t.places_loser)} me={me} />
    </div>
  );
}
