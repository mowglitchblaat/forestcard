// Balance votes (the legacy page's "Patch notes → Votes", here a page of its own): the player's
// cards to pick from, the ballot of the card picked (nerf, up or rework for each of its parts), and
// the results of this week or the last. A player sees only their own cards, in the list and in the
// results, as on the legacy page (the game's other cards stay the admin's).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { TONES } from '@/lib/tones';
import { ICONS } from '@/lib/icons';
import { type ReactNode, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cardKeys, fetchCollection, fetchGameCardsFull, type GameCardFull } from '@/data/cards';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { fetchIsAdmin, playerKeys } from '@/data/player';
import {
  aggregate,
  aspectName,
  aspectsOf,
  type Ballot,
  type Direction,
  DIRECTIONS,
  fetchMyVotes,
  fetchResults,
  MAX_VOTED,
  vote,
  voteKeys,
} from '@/data/votes';
import { useSession } from '@/lib/session';

const route = getRouteApi('/votes');

const DIRECTION_ICONS: Record<Direction, ReactNode> = {
  nerf: <ICONS.down />,
  up: <ICONS.up />,
  rework: <ICONS.rework />,
};

const TYPES = { tout: 'Toutes', combattant: 'Combattants', magie: 'Magies', piege: 'Pièges' };
const ORDER: Record<string, number> = { combattant: 0, magie: 1, piege: 2 };

// The picture of a card: its "Standard" variant, else the first with an image (legacy vImg).
const pictureOf = (c: GameCardFull): string | null =>
  (
    c.variantes_carte.find((v) => v.nom === 'Standard' && v.image_path) ??
    c.variantes_carte.find((v) => v.image_path)
  )?.image_path ?? null;

export function VotesPage() {
  const { carte, semaine = 0 } = route.useSearch();
  const navigate = route.useNavigate();
  const userId = useSession()?.user.id ?? '';
  const cards = useQuery({ queryKey: cardKeys.gameCardsFull, queryFn: fetchGameCardsFull });
  const collection = useQuery({
    queryKey: cardKeys.collection(userId),
    queryFn: () => fetchCollection(userId),
    enabled: userId !== '',
  });
  const isAdmin = useQuery({
    queryKey: playerKeys.isAdmin(userId),
    queryFn: fetchIsAdmin,
    enabled: userId !== '',
  });
  const mine = useQuery({ queryKey: voteKeys.mine, queryFn: fetchMyVotes });
  const results = useQuery({
    queryKey: voteKeys.results(semaine),
    queryFn: () => fetchResults(semaine),
  });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const [type, setType] = useState<keyof typeof TYPES>('tout');
  const [query, setQuery] = useState('');

  const error = cards.error ?? collection.error ?? mine.error;
  if (error) return <p role="alert">Votes indisponibles pour le moment : {error.message}</p>;
  if (!cards.data || !collection.data || !mine.data || isAdmin.data === undefined)
    return <PageSkeleton />;

  // The cards the player may vote on: their own, active (every card for the admin).
  const owned = new Set(collection.data.filter((e) => e.quantite > 0).map((e) => e.card.id));
  const votable = cards.data
    .filter((c) => isAdmin.data || owned.has(c.id))
    .sort(
      (a, b) => (ORDER[a.type] ?? 9) - (ORDER[b.type] ?? 9) || a.nom.localeCompare(b.nom, 'fr'),
    );
  const byId = new Map(votable.map((c) => [c.id, c]));
  const needle = query.trim().toLowerCase();
  const shown = votable.filter(
    (c) =>
      (type === 'tout' || c.type === type) && (!needle || c.nom.toLowerCase().includes(needle)),
  );
  const left = Math.max(0, MAX_VOTED - mine.data.size);
  const picked = carte === undefined ? undefined : byId.get(carte);
  const images = mirror.data ?? new Set<string>();
  const select = (id: number) =>
    void navigate({ search: (s) => ({ ...s, carte: id }), replace: true, resetScroll: false });

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground">
        Choisis parmi tes cartes jusqu'à <b>{MAX_VOTED} par semaine</b> et dis ce que tu voudrais
        voir changer : <b>nerf</b> (plus faible), <b>up</b> (plus forte) ou <b>rework</b> (à
        repenser). Les votes repartent à zéro chaque lundi. Il te reste{' '}
        <b>
          {left} carte{left > 1 ? 's' : ''}
        </b>{' '}
        à voter cette semaine.
      </p>

      <div className="grid items-start gap-6 lg:layout-main-aside-24">
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <ICONS.search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher une carte…"
                className="pl-8"
              />
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              value={type}
              onValueChange={(v) => v && setType(v as keyof typeof TYPES)}
            >
              {Object.entries(TYPES).map(([k, label]) => (
                <ToggleGroupItem key={k} value={k}>
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {!votable.length ? (
            <p className="text-sm text-muted-foreground">
              Tu n'as encore aucune carte : ouvre des boosters pour pouvoir voter sur les tiennes.
            </p>
          ) : !shown.length ? (
            <p className="text-sm text-muted-foreground">Aucune carte.</p>
          ) : (
            <div className="grid grid-tiles-sm gap-3">
              {shown.map((c) => {
                const src = imageUrl(pictureOf(c), images);
                const voted = mine.data.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => select(c.id)}
                    className={`relative flex cursor-pointer flex-col gap-1 rounded-lg p-1 text-left text-xs transition hover:-translate-y-0.5 ${
                      c.id === carte ? 'bg-primary/10 ring-2 ring-primary' : ''
                    }`}
                  >
                    {src ? (
                      <img
                        loading="lazy"
                        src={src}
                        alt=""
                        className="aspect-5/7 w-full rounded-md object-cover rarity-ring"
                        style={{ '--rarity': c.raretes.couleur ?? 'var(--muted-foreground)' }}
                      />
                    ) : (
                      <div className="aspect-5/7 w-full rounded-md bg-muted" />
                    )}
                    <span className="line-clamp-1">{c.nom}</span>
                    {voted && (
                      <span
                        className={`absolute top-2 right-2 rounded-full p-0.5 shadow ${TONES.success.badge}`}
                        aria-label="Déjà voté"
                      >
                        <ICONS.done className="size-3.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="lg:sticky lg:top-4">
          {picked ? (
            <BallotCard
              key={`${picked.id}:${JSON.stringify(mine.data.get(picked.id) ?? {})}`}
              card={picked}
              image={imageUrl(pictureOf(picked), images)}
              saved={mine.data.get(picked.id)}
              left={left}
            />
          ) : (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">
              Clique sur une carte pour voter.
            </p>
          )}
        </aside>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Résultats</h2>
          <ToggleGroup
            type="single"
            variant="outline"
            value={String(semaine)}
            onValueChange={(v) =>
              v &&
              void navigate({
                search: (s) => ({ ...s, semaine: v === '1' ? 1 : undefined }),
                replace: true,
                resetScroll: false,
              })
            }
          >
            <ToggleGroupItem value="0">Cette semaine</ToggleGroupItem>
            <ToggleGroupItem value="1">Semaine dernière</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {results.error ? (
          <p role="alert">Résultats indisponibles : {results.error.message}</p>
        ) : !results.data ? (
          <PageSkeleton />
        ) : (
          <Results
            list={aggregate(results.data).filter((r) => byId.has(r.id))}
            byId={byId}
            onPick={select}
          />
        )}
      </section>
    </div>
  );
}

// The ballot of one card: a direction or none for each of its parts. Keyed on the card and its
// saved ballot: saving starts it again from what was saved.
function BallotCard({
  card,
  image,
  saved,
  left,
}: {
  card: GameCardFull;
  image: string | null;
  saved: Ballot | undefined;
  left: number;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<Ballot>(saved ?? {});
  const send = useMutation({
    mutationFn: (ballot: Ballot) => vote(card.id, ballot),
    // Recorded or refused, the player's votes and the results are re-read.
    onSettled: () => client.invalidateQueries({ queryKey: ['votes'] }),
  });
  const aspects = aspectsOf(card);
  const chosen = Object.keys(draft).length;
  const changed = JSON.stringify(sortKeys(draft)) !== JSON.stringify(sortKeys(saved ?? {}));
  // A new card needs a vote left this week; changing a card already voted does not.
  const full = !saved && left === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-base">
          {image && <img src={image} alt="" className="aspect-5/7 w-14 rounded-md object-cover" />}
          <span className="flex flex-col gap-1">
            {card.nom}
            {saved && <Badge variant="secondary">Voté cette semaine</Badge>}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Pour chaque ligne, choisis ce que tu voudrais (ou rien).
        </p>
        {aspects.map((a) => (
          <div key={a.key} className="flex flex-col gap-1.5">
            <span className="text-sm">{a.label}</span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={draft[a.key] ?? ''}
              onValueChange={(v) =>
                setDraft((d) => {
                  const next = { ...d };
                  if (v) next[a.key] = v as Direction;
                  else delete next[a.key];
                  return next;
                })
              }
            >
              {(Object.keys(DIRECTIONS) as Direction[]).map((dir) => (
                <ToggleGroupItem key={dir} value={dir} className="flex-1">
                  {DIRECTION_ICONS[dir]} {DIRECTIONS[dir]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!chosen || !changed || full || send.isPending}
            onClick={() => send.mutate(draft)}
          >
            {send.isPending ? 'Envoi…' : saved ? 'Mettre à jour mon vote' : 'Valider mon vote'}
          </Button>
          {saved && (
            <Button variant="outline" disabled={send.isPending} onClick={() => send.mutate({})}>
              Retirer mon vote
            </Button>
          )}
        </div>
        {full && (
          <p className="text-xs text-muted-foreground">
            Tu as déjà voté pour {MAX_VOTED} cartes cette semaine : retire un vote pour en voter une
            autre.
          </p>
        )}
        {send.error && (
          <p role="alert" className="text-sm text-destructive">
            {send.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const sortKeys = (b: Ballot): [string, Direction][] =>
  Object.entries(b).sort(([x], [y]) => x.localeCompare(y));

// The results by card, the most voters first; in each line, the direction most asked in bold.
function Results({
  list,
  byId,
  onPick,
}: {
  list: ReturnType<typeof aggregate>;
  byId: Map<number, GameCardFull>;
  onPick: (id: number) => void;
}) {
  if (!list.length)
    return <p className="text-sm text-muted-foreground">Aucun vote pour cette semaine.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {list.map((r) => {
        const card = byId.get(r.id);
        const labels = new Map(card ? aspectsOf(card).map((a) => [a.key, a.label]) : []);
        return (
          <div key={r.id} className="flex flex-col gap-2 rounded-xl border p-3">
            <div className="flex items-baseline justify-between gap-2">
              <button
                type="button"
                className="cursor-pointer font-semibold hover:underline"
                onClick={() => onPick(r.id)}
              >
                {r.name}
              </button>
              <small className="text-muted-foreground tabular-nums">
                {r.voters} votant{r.voters > 1 ? 's' : ''}
              </small>
            </div>
            {r.aspects.map((a) => {
              const top = Math.max(a.counts.nerf, a.counts.up, a.counts.rework);
              return (
                <div key={a.aspect} className="flex flex-col gap-1 text-sm">
                  <span className="line-clamp-2 text-muted-foreground">
                    {labels.get(a.aspect) ?? aspectName(a.aspect)}
                  </span>
                  <span className="flex gap-4 tabular-nums">
                    {(Object.keys(DIRECTIONS) as Direction[]).map((dir) => (
                      <span
                        key={dir}
                        className={`flex items-center gap-1 [&_svg]:size-3.5 ${
                          a.counts[dir] === top && top > 0
                            ? 'font-semibold'
                            : 'text-muted-foreground'
                        }`}
                        title={DIRECTIONS[dir]}
                      >
                        {DIRECTION_ICONS[dir]} {a.counts[dir]}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
