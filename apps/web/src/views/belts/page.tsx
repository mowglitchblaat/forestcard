// Belts (the legacy page's vCeintures): the three belts with their champion, reign, defences,
// refusals, the midnight bonus and the vacancy countdown; the pending challenges (refusing one);
// the Pantheon of the greatest reigns and of the double and triple champions; the story of each
// belt. The championship is played live only: challenges are made and accepted in the chat.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  type Belt,
  beltKeys,
  beltStory,
  type BeltsState,
  duration,
  fetchBelts,
  fetchPantheon,
  fetchTitleLock,
  type GreatReign,
  longDuration,
  type MultiChampion,
  refuseChallenge,
} from '@/data/belts';
import { DIVISIONS, fetchChampionshipDecks, isDivision, tournamentKeys } from '@/data/tournaments';
import { useSession } from '@/lib/session';
import { TONES } from '@/lib/tones';

const day = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
const at = (d: string) => {
  const x = new Date(d);
  return `${x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};
const daysUntil = (d: string | null | undefined) =>
  d ? Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 864e5)) : 0;
const beltImage = (division: string) => `cadres/ceinture-${division}.webp`;
const RANGES: Record<string, string> = {
  rare: 'Cartes communes et rares',
  epique: "Jusqu'aux cartes épiques",
  libre: 'Toutes les raretés',
};

export function BeltsPage() {
  const me = useSession()?.user.id ?? '';
  const state = useQuery({ queryKey: beltKeys.all, queryFn: fetchBelts });
  const lock = useQuery({ queryKey: beltKeys.lock, queryFn: fetchTitleLock });
  const pantheon = useQuery({ queryKey: beltKeys.pantheon, queryFn: fetchPantheon });
  const decks = useQuery({
    queryKey: tournamentKeys.decks(me),
    queryFn: () => fetchChampionshipDecks(me),
    enabled: me !== '',
  });
  if (state.error)
    return <p role="alert">Championnat indisponible pour le moment : {state.error.message}</p>;
  if (!state.data) return <PageSkeleton />;
  const s = state.data;
  const locked = lock.data === true;
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground">
        Trois ceintures, un champion chacune. Le championnat se joue uniquement en live : défie le
        champion dans le chat (!defi) avec ton deck de championnat (page Mes decks : 15 cartes, 5
        combattants, 5 magies, 5 pièges) ; il accepte ou refuse dans le chat (!accepter, !refuser).
        Combat en relais : 3 combattants chacun, un nouveau trio à chaque entrée, jusqu'au KO. Le
        vainqueur gagne 💰 500, le perdant 💰 150. Chaque jour où il fait un combat pour le titre,
        le champion touche une prime à minuit : 90 gold par ceinture, +10 % par jour actif
        consécutif (un jour sans combat pour le titre : pas de prime, la série repart à 90), +15 %
        par ceinture en plus. Un challenger a droit à un combat pour le titre par jour et par
        ceinture (un match nul ne compte pas : il peut redéfier) ; le champion défend sa ceinture
        autant de fois qu'on le défie, et ses défenses ne comptent pas. Le champion perd sa ceinture
        s'il perd, à son 3e refus, ou après 7 jours sans combat pour le titre.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {s.belts.map((b) => (
          <BeltCard
            key={b.division}
            belt={b}
            me={me}
            locked={locked}
            waiting={s.challenges.some((c) => c.division === b.division)}
            deckReady={(decks.data?.get(b.division) ?? []).length === 15}
          />
        ))}
      </div>
      <Challenges state={s} me={me} />
      {pantheon.data && <PantheonView pantheon={pantheon.data} />}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">L'histoire des ceintures</h2>
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {(['rare', 'epique', 'libre'] as const).map((d) => (
            <Story key={d} state={s} division={d} />
          ))}
        </div>
      </section>
      <p className="text-sm text-muted-foreground">
        Dans le chat : <b>!defi rare</b> (ou épique, libre ; ajoute le @ du joueur si la ceinture
        est vacante), <b>!accepter</b>, <b>!refuser</b>, <b>!ceintures</b>.
      </p>
    </div>
  );
}

function BeltCard({
  belt: b,
  me,
  locked,
  waiting,
  deckReady,
}: {
  belt: Belt;
  me: string;
  locked: boolean;
  waiting: boolean;
  deckReady: boolean;
}) {
  const d = isDivision(b.division) ? DIVISIONS[b.division] : null;
  const left = daysUntil(b.vacante_le);
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 text-center">
        <img
          src={beltImage(b.division)}
          alt={b.nom}
          className={`w-full max-w-80 ${b.pseudo ? 'drop-shadow-lg' : 'opacity-50 grayscale'}`}
        />
        <h3 className="font-semibold">{b.nom}</h3>
        <small className="text-muted-foreground">{RANGES[b.division] ?? ''}</small>
        <div className="text-2xl font-black">
          {b.pseudo ? `👑 ${b.pseudo}` : <span className="text-muted-foreground">Vacante</span>}
        </div>
        <small className="text-muted-foreground">
          {b.en_cours ? (
            "⚔️ Combat pour le titre en cours à l'écran… le résultat s'affiche à la fin de l'animation."
          ) : b.pseudo ? (
            <>
              Depuis le {day(b.depuis)} · {b.defenses ?? 0} défense
              {(b.defenses ?? 0) > 1 ? 's' : ''} · refus {b.refus ?? 0}/{b.refus_max ?? 3}
              <br />
              {locked &&
                "🔒 Pas de live aujourd'hui : primes en pause, la série est gardée et la ceinture ne peut pas devenir vacante."}
              {!locked && b.prime !== null && b.prime !== undefined && (
                <>
                  💰 Prime à minuit : <b>{b.prime} gold</b>{' '}
                  {b.defendu
                    ? "(ceinture défendue aujourd'hui ✓)"
                    : "s'il fait un combat pour le titre aujourd'hui"}
                  {b.jours ? ` · série : ${b.jours} jour${b.jours > 1 ? 's' : ''}` : ''}
                  <br />
                </>
              )}
              {!locked &&
                `Sans combat pour le titre, la ceinture redevient vacante dans ${left} jour${left > 1 ? 's' : ''}`}
            </>
          ) : (
            'Le premier qui gagne un combat pour cette ceinture la prend.'
          )}
        </small>
        <div className="text-sm">
          {b.champion === me ? (
            <b>C'est toi !</b>
          ) : waiting ? (
            <small>Un défi est en attente.</small>
          ) : !deckReady ? (
            <Button size="sm" variant="outline" asChild>
              <Link to="/deck" search={{ deck: `ceinture-${b.division}` }}>
                Prépare ton deck {d?.icon ?? ''}
              </Link>
            </Button>
          ) : (
            <small>
              🥊 Défie {b.pseudo ?? 'le joueur de ton choix'} en live dans le chat :{' '}
              <b>
                !defi {b.division === 'epique' ? 'épique' : b.division}
                {b.pseudo ? '' : ' @pseudo'}
              </b>
            </small>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Challenges({ state, me }: { state: BeltsState; me: string }) {
  const client = useQueryClient();
  const refuse = useMutation({
    mutationFn: refuseChallenge,
    onSettled: () => client.invalidateQueries({ queryKey: beltKeys.all }),
  });
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Défis en attente</h2>
      {state.challenges.length ? (
        <ul className="flex flex-col gap-2 text-sm">
          {state.challenges.map((c) => {
            const d = isDivision(c.division) ? DIVISIONS[c.division] : null;
            const mine = c.adversaire === me;
            const champion = state.belts.some(
              (b) => b.division === c.division && b.champion === me,
            );
            return (
              <li
                key={`${c.division}-${c.challenger}`}
                className="flex flex-wrap items-center gap-2"
              >
                <span>
                  {d?.icon} <b>{c.pseudo_challenger}</b> défie <b>{c.pseudo_adversaire}</b> pour la{' '}
                  {d?.name ?? c.division}{' '}
                  <small className="text-muted-foreground">(expire le {at(c.expire_le)})</small>
                </span>
                {mine && (
                  <>
                    <small className="text-muted-foreground">
                      accepte en live dans le chat avec <b>!accepter</b>, ou
                    </small>
                    <HoldButton
                      size="sm"
                      variant="outline"
                      disabled={refuse.isPending}
                      onConfirm={() => refuse.mutate(c.division)}
                    >
                      ❌ Refuser{champion ? ' (au 3e refus, tu perds ta ceinture)' : ''}
                    </HoldButton>
                  </>
                )}
                {c.challenger === me && (
                  <small className="text-muted-foreground">en attente de sa réponse</small>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun défi en attente.</p>
      )}
      {refuse.data && <p className="text-sm">{refuse.data}</p>}
      {refuse.error && (
        <p role="alert" className="text-sm text-destructive">
          {refuse.error.message}
        </p>
      )}
    </section>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];
const medal = (i: number) => MEDALS[i] ?? `${i + 1}.`;
const short = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';

function PantheonRow({ children, first }: { children: ReactNode; first: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${first ? TONES.gold.box : ''}`}
    >
      {children}
    </div>
  );
}

function GreatList({ title, list, by }: { title: string; list: GreatReign[]; by: 'def' | 'dur' }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold">{title}</h3>
      {list.length ? (
        list.map((x, i) => {
          const n = x.defenses ?? 0;
          const defences = `${n} défense${n > 1 ? 's' : ''}`;
          return (
            <PantheonRow key={`${x.pseudo ?? ''}-${x.debut ?? i}`} first={i === 0}>
              <span className="w-7 text-center text-lg">{medal(i)}</span>
              {x.division && <img src={beltImage(x.division)} alt="" className="w-16 shrink-0" />}
              <div className="flex min-w-0 flex-col">
                <span>
                  <b>{x.pseudo ?? '?'}</b>{' '}
                  <small className="text-muted-foreground">{x.nom ?? ''}</small>
                </span>
                <small className="text-muted-foreground">
                  <b>{by === 'def' ? defences : longDuration(x.secondes)}</b> ·{' '}
                  {by === 'def' ? longDuration(x.secondes) : defences} · {short(x.debut)} →{' '}
                  {x.fin ? short(x.fin) : <b className={TONES.gold.text}>en cours 👑</b>}
                </small>
              </div>
            </PantheonRow>
          );
        })
      ) : (
        <small className="text-muted-foreground">Personne pour l'instant.</small>
      )}
    </div>
  );
}

function MultiList({
  title,
  list,
  belts,
  empty,
}: {
  title: string;
  list: MultiChampion[];
  belts: string[];
  empty: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold">{title}</h3>
      {list.length ? (
        list.map((x, i) => {
          const times = x.fois ?? 0;
          return (
            <PantheonRow key={`${x.pseudo ?? ''}-${i}`} first={i === 0}>
              <span className="w-7 text-center text-lg">{medal(i)}</span>
              <span className="flex w-16 shrink-0 flex-col gap-0.5">
                {belts.map((d) => (
                  <img key={d} src={beltImage(d)} alt="" className="w-16" />
                ))}
              </span>
              <div className="flex min-w-0 flex-col">
                <span>
                  <b>{x.pseudo ?? '?'}</b>
                  {x.en_cours && <small className={TONES.gold.text}> en cours 👑</small>}
                </span>
                <small className="text-muted-foreground">
                  <b>{longDuration(x.secondes)}</b> au total · {times} fois
                  {times > 1 && x.record ? ` · plus longue : ${longDuration(x.record)}` : ''}
                </small>
              </div>
            </PantheonRow>
          );
        })
      ) : (
        <small className="text-muted-foreground">{empty}</small>
      )}
    </div>
  );
}

function PantheonView({
  pantheon: p,
}: {
  pantheon: NonNullable<Awaited<ReturnType<typeof fetchPantheon>>>;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">🏛️ Panthéon</h2>
      <p className="text-sm text-muted-foreground">
        Les plus grands règnes du championnat, toutes ceintures confondues, gardés pour toujours.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <GreatList title="🛡️ Le plus de défenses" list={p.defenses ?? []} by="def" />
        <GreatList title="⏳ Les plus longs règnes" list={p.duree ?? []} by="dur" />
        <MultiList
          title="👑👑 Doubles champions"
          list={p.doubles ?? []}
          belts={['libre', 'epique']}
          empty="Personne n'a encore détenu deux ceintures en même temps."
        />
        <MultiList
          title="👑👑👑 Triples champions"
          list={p.triples ?? []}
          belts={['libre', 'epique', 'rare']}
          empty="Personne n'a encore détenu les trois ceintures en même temps."
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Double champion : au moins deux ceintures en même temps (le temps passé triple compte
        aussi). Chaque période sans interruption compte pour une fois.
      </p>
    </section>
  );
}

function Story({ state, division }: { state: BeltsState; division: 'rare' | 'epique' | 'libre' }) {
  const d = DIVISIONS[division];
  const blocks = beltStory(state, division);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 text-sm">
        <h3 className="flex items-center gap-2 font-semibold">
          <img src={beltImage(division)} alt="" className="w-20" />
          {d.icon} {d.name}
        </h3>
        {blocks.map((b, i) =>
          b.kind === 'reign' ? (
            <div
              key={`r-${b.reign.debut}`}
              className={`flex flex-col gap-1 border-l-2 pl-3 ${b.reign.fin ? 'border-border' : TONES.gold.border}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-base">
                  👑 <b>{b.reign.pseudo ?? '?'}</b>
                </span>
                <small className="text-muted-foreground">
                  {b.reign.fin
                    ? `a régné ${duration(new Date(b.reign.fin).getTime() - new Date(b.reign.debut).getTime())}`
                    : `en cours depuis ${duration(Date.now() - new Date(b.reign.debut).getTime())}`}{' '}
                  · {b.reign.defenses ?? 0} défense{(b.reign.defenses ?? 0) > 1 ? 's' : ''}
                  {b.reign.primes ? ` · 💰 ${b.reign.primes} gold de primes` : ''}
                </small>
              </div>
              {b.lines.map((l) => (
                <div key={`${l.icon}-${l.at ?? ''}-${l.text}`} className="flex gap-2">
                  <span>{l.icon}</span>
                  <span className="flex-1">{l.text}</span>
                  <small className="whitespace-nowrap text-muted-foreground">
                    {l.at ? at(l.at) : ''}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <div key={`v-${b.since ?? 'start'}-${i}`} className="pl-3 text-muted-foreground">
              🏳️{' '}
              {b.fromStart
                ? 'Vacante depuis le lancement'
                : b.until && b.since
                  ? `Vacante pendant ${duration(new Date(b.until).getTime() - new Date(b.since).getTime())}`
                  : `Vacante depuis ${duration(Date.now() - new Date(b.since ?? Date.now()).getTime())}`}
              {b.draws.map((c) => (
                <div key={c.fini_le}>
                  <small>
                    🤝 {c.pseudo_challenger} et {c.pseudo_adversaire} font match nul (
                    {at(c.fini_le)})
                  </small>
                </div>
              ))}
            </div>
          ),
        )}
      </CardContent>
    </Card>
  );
}
