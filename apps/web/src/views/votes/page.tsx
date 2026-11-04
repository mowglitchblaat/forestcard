// Balance votes (the legacy page's "Patch notes → Votes", here a page of its own): the player's
// cards to propose (a card already proposed this week is locked), the proposal of the card picked
// (nerf, up or rework, on the whole card or a part, with a comment), and the proposals of this week
// or the last, where every player votes yes or no.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { TONES } from '@/lib/tones';
import { ICONS } from '@/lib/icons';
import { type ReactNode, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cardKeys, fetchCollection, fetchGameCardsFull, type GameCardFull } from '@/data/cards';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { fetchIsAdmin, playerKeys } from '@/data/player';
import {
  aspectLabel,
  aspectsOf,
  byVotes,
  type Direction,
  DIRECTIONS,
  fetchProposals,
  MAX_PROPOSED,
  propose,
  type Proposal,
  voteKeys,
  voteOn,
  votesOf,
  withdraw,
  yesShare,
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
  // This week's proposals tell which cards are locked and how many the player has left.
  const thisWeek = useQuery({ queryKey: voteKeys.proposals(0), queryFn: () => fetchProposals(0) });
  const shownWeek = useQuery({
    queryKey: voteKeys.proposals(semaine),
    queryFn: () => fetchProposals(semaine),
  });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const [type, setType] = useState<keyof typeof TYPES>('tout');
  const [query, setQuery] = useState('');

  const error = cards.error ?? collection.error ?? thisWeek.error;
  if (error) return <p role="alert">Votes indisponibles pour le moment : {error.message}</p>;
  if (!cards.data || !collection.data || !thisWeek.data || isAdmin.data === undefined)
    return <PageSkeleton />;

  // The cards the player may propose: their own, active (every card for the admin).
  const owned = new Set(collection.data.filter((e) => e.quantite > 0).map((e) => e.card.id));
  const mine = cards.data
    .filter((c) => isAdmin.data || owned.has(c.id))
    .sort(
      (a, b) => (ORDER[a.type] ?? 9) - (ORDER[b.type] ?? 9) || a.nom.localeCompare(b.nom, 'fr'),
    );
  const byId = new Map(cards.data.map((c) => [c.id, c]));
  const locked = new Set(thisWeek.data.map((p) => p.carte_id));
  const needle = query.trim().toLowerCase();
  const shown = mine.filter(
    (c) =>
      (type === 'tout' || c.type === type) && (!needle || c.nom.toLowerCase().includes(needle)),
  );
  const left = Math.max(0, MAX_PROPOSED - thisWeek.data.filter((p) => p.a_moi).length);
  const picked = carte === undefined || locked.has(carte) ? undefined : byId.get(carte);
  const images = mirror.data ?? new Set<string>();
  const select = (id: number | undefined) =>
    void navigate({ search: (s) => ({ ...s, carte: id }), replace: true, resetScroll: false });

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground">
        Propose une de <b>tes cartes</b> (jusqu'à <b>{MAX_PROPOSED} par semaine</b>) : <b>nerf</b>{' '}
        (plus faible), <b>up</b> (plus forte) ou <b>rework</b> (à repenser), sur toute la carte ou
        une partie précise. Ta proposition est publiée chez tous les joueurs, qui votent <b>oui</b>{' '}
        ou <b>non</b>. Une carte déjà proposée ne peut plus l'être avant lundi : vote sur sa
        proposition. Il te reste{' '}
        <b>
          {left} proposition{left > 1 ? 's' : ''}
        </b>{' '}
        cette semaine.
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
          {!mine.length ? (
            <p className="text-sm text-muted-foreground">
              Tu n'as encore aucune carte : ouvre des boosters pour pouvoir proposer les tiennes (tu
              peux déjà voter sur les propositions des autres).
            </p>
          ) : !shown.length ? (
            <p className="text-sm text-muted-foreground">Aucune carte.</p>
          ) : (
            <div className="grid grid-tiles-sm gap-3">
              {shown.map((c) => {
                const src = imageUrl(pictureOf(c), images);
                const isLocked = locked.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={isLocked}
                    title={isLocked ? 'Déjà proposée cette semaine' : undefined}
                    onClick={() => select(c.id)}
                    className={`relative flex cursor-pointer flex-col gap-1 rounded-lg p-1 text-left text-xs transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                      c.id === picked?.id ? 'bg-primary/10 ring-2 ring-primary' : ''
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
                    {isLocked && (
                      <span
                        className={`absolute top-2 right-2 rounded-full p-0.5 shadow ${TONES.warning.badge}`}
                        aria-label="Déjà proposée cette semaine"
                      >
                        <ICONS.closed className="size-3.5" />
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
            <ProposeCard
              key={picked.id}
              card={picked}
              image={imageUrl(pictureOf(picked), images)}
              left={left}
              onDone={() => {
                select(undefined);
                if (semaine !== 0)
                  void navigate({
                    search: (s) => ({ ...s, semaine: undefined }),
                    replace: true,
                    resetScroll: false,
                  });
              }}
            />
          ) : (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">
              Clique sur une de tes cartes pour la proposer.
            </p>
          )}
        </aside>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Propositions</h2>
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
        {shownWeek.error ? (
          <p role="alert">Propositions indisponibles : {shownWeek.error.message}</p>
        ) : !shownWeek.data ? (
          <PageSkeleton />
        ) : !shownWeek.data.length ? (
          <p className="text-sm text-muted-foreground">
            Aucune proposition{' '}
            {semaine ? 'la semaine dernière.' : 'pour cette semaine : sois le premier !'}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {byVotes(shownWeek.data).map((p) => {
              const card = byId.get(p.carte_id);
              return (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  card={card}
                  image={card ? imageUrl(pictureOf(card), images) : null}
                  over={semaine > 0}
                  isAdmin={isAdmin.data}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// Proposing the card picked: a direction, the whole card or one of its parts, a comment.
function ProposeCard({
  card,
  image,
  left,
  onDone,
}: {
  card: GameCardFull;
  image: string | null;
  left: number;
  onDone: () => void;
}) {
  const client = useQueryClient();
  const [direction, setDirection] = useState<Direction>('nerf');
  const [aspect, setAspect] = useState('');
  const [comment, setComment] = useState('');
  const send = useMutation({
    mutationFn: () => propose(card.id, direction, aspect || null, comment),
    onSuccess: onDone,
    onSettled: () => client.invalidateQueries({ queryKey: voteKeys.all }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-base">
          {image && <img src={image} alt="" className="aspect-5/7 w-14 rounded-md object-cover" />}
          {card.nom}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm">Ce que tu proposes</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={direction}
            onValueChange={(v) => v && setDirection(v as Direction)}
          >
            {(Object.keys(DIRECTIONS) as Direction[]).map((dir) => (
              <ToggleGroupItem key={dir} value={dir} className="flex-1">
                {DIRECTION_ICONS[dir]} {DIRECTIONS[dir]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          Sur quoi
          <NativeSelect value={aspect} onChange={(e) => setAspect(e.target.value)}>
            <option value="">Toute la carte</option>
            {aspectsOf(card).map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Pourquoi ? (facultatif, 200 caractères max)
          <Input
            maxLength={200}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Ex. : son ultime tombe trop tôt"
          />
        </label>
        <div>
          <Button disabled={!left || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? 'Envoi…' : 'Publier la proposition'}
          </Button>
        </div>
        {!left && (
          <p className="text-xs text-muted-foreground">
            Tu as déjà fait {MAX_PROPOSED} propositions cette semaine.
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

function ProposalCard({
  proposal: p,
  card,
  image,
  over,
  isAdmin,
}: {
  proposal: Proposal;
  card: GameCardFull | undefined;
  image: string | null;
  over: boolean;
  isAdmin: boolean;
}) {
  const client = useQueryClient();
  const settle = () => client.invalidateQueries({ queryKey: voteKeys.all });
  const vote = useMutation({
    mutationFn: (yes: boolean | null) => voteOn(p.id, yes),
    onSettled: settle,
  });
  const remove = useMutation({ mutationFn: () => withdraw(p.id), onSettled: settle });
  const busy = vote.isPending || remove.isPending;
  const error = vote.error ?? remove.error;
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex gap-3">
        {image && <img src={image} alt="" className="aspect-5/7 w-14 rounded-md object-cover" />}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-semibold">{p.carte_nom}</span>
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={p.sens === 'up' ? 'success' : p.sens === 'nerf' ? 'danger' : 'info'}>
              {DIRECTION_ICONS[p.sens]} {DIRECTIONS[p.sens]}
            </Badge>
            <span className="line-clamp-2 text-sm text-muted-foreground">
              {aspectLabel(card, p.aspect)}
            </span>
          </span>
          {p.commentaire && <span className="text-sm italic">« {p.commentaire} »</span>}
        </div>
      </div>
      <Progress value={yesShare(p)} />
      <div className="flex flex-wrap items-center gap-4 text-sm tabular-nums">
        <span>
          ✅ Oui <b>{p.oui}</b>
        </span>
        <span>
          ❌ Non <b>{p.non}</b>
        </span>
        <small className="text-muted-foreground">{yesShare(p)} % de oui</small>
      </div>
      {!over &&
        (p.a_moi ? (
          <div className="flex flex-wrap items-center gap-2">
            <small className="text-muted-foreground">
              Ta proposition (ton vote compte pour oui)
            </small>
            {votesOf(p) <= 1 && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => remove.mutate()}>
                Retirer
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={p.mon_avis === true ? 'default' : 'outline'}
              disabled={busy}
              onClick={() => vote.mutate(true)}
            >
              ✅ Oui
            </Button>
            <Button
              size="sm"
              variant={p.mon_avis === false ? 'default' : 'outline'}
              disabled={busy}
              onClick={() => vote.mutate(false)}
            >
              ❌ Non
            </Button>
            {p.mon_avis !== null && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => vote.mutate(null)}>
                Retirer mon vote
              </Button>
            )}
          </div>
        ))}
      {isAdmin && !p.a_moi && (
        <div>
          <HoldButton
            size="sm"
            variant="destructive-ghost"
            disabled={busy}
            onConfirm={() => remove.mutate()}
          >
            <ICONS.delete />
            Supprimer (admin)
          </HoldButton>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
    </div>
  );
}
