// Profiles, reimagined: who (Twitch picture and name for one's own), the combats as a win / draw /
// loss bar with the win rate, the records, the two cards that matter (each a link to the
// catalogue), and for one's own profile the collection's progress by rarity.
// A player who never fought gets their empty state instead of a wall of zeros.

import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { TONES } from '@/lib/tones';
import { ICONS, type LucideIcon } from '@/lib/icons';
import type { ReactNode } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cardKeys, fetchCollection, fetchGameCards } from '@/data/cards';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { twitchAvatar, twitchNickname } from '@/data/player';
import { type CardRecord, combatSummary, fetchProfile, profileKeys } from '@/data/profile';
import { useSession } from '@/lib/session';
import { pct, progress } from '@/views/collection/model';

const route = getRouteApi('/profil');

export function ProfilePage() {
  const { joueur } = route.useSearch();
  const session = useSession();
  const me = session?.user.id ?? '';
  const id = joueur ?? me;
  const mine = id === me;
  const profile = useQuery({
    queryKey: profileKeys.of(id),
    queryFn: () => fetchProfile(id),
    enabled: id !== '',
  });

  if (profile.error)
    return <p role="alert">Profil indisponible pour le moment : {profile.error.message}</p>;
  if (profile.data === undefined) return <PageSkeleton />;
  if (profile.data === null) return <p>Profil introuvable.</p>;

  const p = profile.data;
  const c = combatSummary(p.stats);
  const name = (mine && twitchNickname(session?.user.user_metadata)) || p.pseudo;
  const avatar = mine ? twitchAvatar(session?.user.user_metadata) : null;
  const s = p.stats;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex flex-wrap items-center gap-4">
        <Avatar className="size-16">
          {avatar && <AvatarImage src={avatar} alt="" />}
          <AvatarFallback className="text-xl">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <h2 className="text-2xl font-semibold">{name}</h2>
          <span className="text-sm text-muted-foreground">
            {mine ? 'Ton profil, visible par tous les joueurs' : 'Profil public'}
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          {!mine && (
            <Button variant="outline" asChild>
              <Link to="/profil" search={{}}>
                Mon profil
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to="/$view" params={{ view: 'classement' }}>
              <ICONS.leaderboard /> Classement
            </Link>
          </Button>
        </div>
      </header>

      {c.total === 0 ? (
        <p className="rounded-xl border bg-muted/40 p-4 text-muted-foreground">
          {mine
            ? 'Aucun combat pour l’instant : tes statistiques apparaîtront après ton premier combat.'
            : 'Ce joueur n’a pas encore combattu.'}
        </p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <ICONS.combat className="size-4" /> Combats
              </CardDescription>
              <CardTitle className="flex items-baseline gap-3 tabular-nums">
                <span className="text-4xl">{c.winRate} %</span>
                <span className="text-sm font-normal text-muted-foreground">
                  de victoires sur {c.total} combat{c.total > 1 ? 's' : ''}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ResultBar wins={c.wins} draws={c.draws} losses={c.losses} />
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>
                  Meilleure série : <b className="text-foreground">{s?.meilleure_serie ?? 0}</b>
                </span>
                <span>
                  Série en cours : <b className="text-foreground">{s?.serie_actuelle ?? 0}</b>
                </span>
              </div>
            </CardContent>
          </Card>

          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold">Records</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Record
                icon={ICONS.attack}
                label="Plus gros coup"
                value={s?.plus_gros_coup}
                unit="dégâts"
              />
              <Record
                icon={ICONS.fastestWin}
                label="Victoire la plus rapide"
                value={s?.victoire_rapide_tours}
                unit="tours"
              />
              <Record
                icon={ICONS.longestCombat}
                label="Combat le plus long"
                value={s?.combat_long_tours}
                unit="tours"
              />
              <Record
                icon={ICONS.damageDealt}
                label="Dégâts infligés"
                value={s?.degats_totaux}
                unit="au total"
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold">Cartes</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <CardTile label="La plus jouée" card={p.plus_jouee} unit="combats" />
              <CardTile label="La plus victorieuse" card={p.plus_gagnante} unit="victoires" />
            </div>
          </section>
        </>
      )}

      {mine && <MyCollection userId={me} opened={s?.boosters_ouverts ?? 0} />}
    </div>
  );
}

// Wins, draws and losses side by side, in proportion.
function ResultBar({ wins, draws, losses }: { wins: number; draws: number; losses: number }) {
  const total = wins + draws + losses;
  const parts = [
    { n: wins, label: 'victoire', className: TONES.success.fill },
    { n: draws, label: 'nul', className: TONES.draw.fill },
    { n: losses, label: 'défaite', className: TONES.danger.fill },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {parts.map(
          (part) =>
            part.n > 0 && (
              <span
                key={part.label}
                className={`w-(--pct) ${part.className}`}
                style={{ '--pct': `${(100 * part.n) / total}%` }}
              />
            ),
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 text-sm tabular-nums">
        {parts.map((part) => (
          <span key={part.label} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${part.className}`} />
            {part.n} {part.label}
            {part.n > 1 ? 's' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function Record({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: LucideIcon;
  label: string;
  value: number | null | undefined;
  unit: string;
}) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4" /> {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        {value ? (
          <span className="tabular-nums">
            <b className="text-2xl">{value.toLocaleString('fr-FR')}</b>{' '}
            <span className="text-sm text-muted-foreground">{unit}</span>
          </span>
        ) : (
          <span className="text-2xl text-muted-foreground">—</span>
        )}
      </CardContent>
    </Card>
  );
}

// A card record: its image framed in its rarity colour; its name opens it in the catalogue.
function CardTile({ label, card, unit }: { label: string; card: CardRecord; unit: string }) {
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const image = card ? imageUrl(card.image_path ?? null, mirror.data ?? new Set()) : null;
  return (
    <Card className="flex-row items-center gap-4 p-4">
      {/* Wrapped: an img as the card's first child is taken for a cover image (no top padding). */}
      <div className="w-20 shrink-0">
        {image ? (
          <img
            loading="lazy"
            src={image}
            alt=""
            className="aspect-5/7 w-full rounded-md object-cover rarity-ring"
            style={{ '--rarity': card?.couleur ?? undefined }}
          />
        ) : (
          <div className="aspect-5/7 w-full rounded-md bg-muted" />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        {card ? (
          <>
            <Link
              to="/encyclopedie/catalogue"
              search={{ q: card.nom }}
              className="truncate text-lg font-semibold hover:underline"
            >
              {card.nom}
            </Link>
            <span className="text-sm tabular-nums">
              {card.valeur} {unit}
            </span>
          </>
        ) : (
          <span className="text-lg text-muted-foreground">—</span>
        )}
      </div>
    </Card>
  );
}

// One's own collection, from the data "Ma collection" already loads.
function MyCollection({ userId, opened }: { userId: string; opened: number }) {
  const collection = useQuery({
    queryKey: cardKeys.collection(userId),
    queryFn: () => fetchCollection(userId),
  });
  const game = useQuery({ queryKey: cardKeys.gameCards, queryFn: fetchGameCards });
  if (!collection.data || !game.data) return null;
  const owned = new Set(collection.data.map((e) => e.card.id));
  const p = progress(game.data, owned);
  const copies = collection.data.reduce((n, e) => n + e.quantite, 0);
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">
        <Link to="/collection" className="hover:underline">
          Collection
        </Link>
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Cartes différentes">
          {p.mine} <span className="text-base text-muted-foreground">/ {p.total}</span>
        </Figure>
        <Figure label="Cartes au total (doublons compris)">{copies}</Figure>
        <Figure label="Boosters ouverts">{opened}</Figure>
      </div>
      <Card className="py-4">
        <CardContent className="flex flex-col gap-2 px-4">
          {p.byRarity.map((r) => (
            <div key={r.name} className="grid layout-label-bar-value items-center gap-3 text-sm">
              <span>{r.name}</span>
              {/* In the rarity's colour, as the collection's stats band. */}
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full w-(--pct) rounded-full bg-(--colour)"
                  style={{ '--pct': `${pct(r.mine, r.total)}%`, '--colour': r.color ?? undefined }}
                />
              </div>
              <span className="text-right tabular-nums">
                {r.mine} / {r.total}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="px-4 text-2xl font-semibold tabular-nums">{children}</CardContent>
    </Card>
  );
}
