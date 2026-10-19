// The history, reimagined: the last combats with a summary (wins, losses, gold earned), each one
// replayable beside the list (HP chart and turn-by-turn story); and the last opened boosters.

import { CardRowsSkeleton, CombatsSkeleton, ReplaySkeleton } from '@/components/skeletons';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { ICONS } from '@/lib/icons';
import type { ReactNode } from 'react';
import { Gold } from '@/components/money';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  type CombatSummary,
  fetchHistory,
  fetchOpenedBoosters,
  fetchReplay,
  historyKeys,
  RESULTS,
  type Result,
} from '@/data/history';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { fetchPlayer, playerKeys } from '@/data/player';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useSession } from '@/lib/session';
import { form } from './analysis';
import { FormStrip, StatsTab } from './insights';
import { Replay } from './replay';
import type { HistorySearch } from './search';

const route = getRouteApi('/historique');

const RESULT_BADGE = {
  victoire: 'success',
  defaite: 'danger',
  nul: 'draw',
} as const satisfies Record<Result, string>;

const date = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

// A trio without the "Aucun…" placeholders the server writes for an empty slot.
const trio = (...names: (string | null)[]) =>
  names.filter((n): n is string => !!n && !n.startsWith('Aucun')).join(' · ') || '—';

export function HistoryPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  // Updating the address must not scroll the page back to the top (the router's default).
  const set = (patch: Partial<HistorySearch>) =>
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true, resetScroll: false });

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        value={search.tab ?? 'combats'}
        onValueChange={(v) => set({ tab: v === 'boosters' || v === 'stats' ? v : undefined })}
      >
        <TabsList>
          <TabsTrigger value="combats">
            <ICONS.combat /> Combats
          </TabsTrigger>
          <TabsTrigger value="stats">
            <ICONS.stats /> Statistiques
          </TabsTrigger>
          <TabsTrigger value="boosters">
            <ICONS.booster /> Boosters ouverts
          </TabsTrigger>
        </TabsList>
        <TabsContent value="combats" className="mt-4">
          <Combats selected={search.combat} onSelect={(combat) => set({ combat })} />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <StatsTab />
        </TabsContent>
        <TabsContent value="boosters" className="mt-4">
          <Boosters />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Combats({
  selected,
  onSelect,
}: {
  selected: number | undefined;
  onSelect: (id: number | undefined) => void;
}) {
  const combats = useQuery({ queryKey: historyKeys.combats(), queryFn: () => fetchHistory() });
  const wide = useMediaQuery('(min-width: 1024px)');

  if (combats.error) return <p role="alert">Erreur : {combats.error.message}</p>;
  if (!combats.data) return <CombatsSkeleton />;
  const list = combats.data;
  if (!list.length)
    return (
      <p className="text-muted-foreground">
        Aucun combat enregistré pour l'instant : tes prochains combats apparaîtront ici avec leur
        déroulé.
      </p>
    );

  const count = (r: Result) => list.filter((c) => c.resultat === r).length;
  const earned = list.reduce((sum, c) => sum + (c.gain ?? 0), 0);
  const current = list.find((c) => c.id === selected);
  const replay = current && <CombatReplay combat={current} />;

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-4">
        <CardDescription>Ta forme</CardDescription>
        <FormStrip combats={list} streak={form(list).streak} />
      </Card>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Victoires" value={count('victoire')} />
        <Stat label="Défaites" value={count('defaite')} />
        <Stat label="Nuls" value={count('nul')} />
        <Stat label="Gagné" value={<Gold n={earned} />} />
      </div>
      <p className="text-sm text-muted-foreground">
        Tes {list.length} derniers combats. Choisis-en un pour revoir son déroulé.
      </p>
      <div className="grid items-start gap-6 lg:layout-halves-wide-right">
        <ul className="flex flex-col gap-2">
          {list.map((c) => (
            <li key={c.id}>
              <CombatRow combat={c} selected={c.id === selected} onSelect={() => onSelect(c.id)} />
            </li>
          ))}
        </ul>
        {wide ? (
          <aside className="sticky top-4 max-h-viewport-inset overflow-y-auto rounded-xl border bg-card p-4 text-card-foreground">
            {replay ?? (
              <p className="text-sm text-muted-foreground">Choisis un combat pour le revoir.</p>
            )}
          </aside>
        ) : (
          <Sheet open={!!current} onOpenChange={(o) => !o && onSelect(undefined)}>
            <SheetContent className="overflow-y-auto sm:max-w-xl">
              <SheetTitle className="sr-only">Déroulé du combat</SheetTitle>
              <SheetDescription className="sr-only">Le combat tour par tour</SheetDescription>
              <div className="p-4">{replay}</div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function CombatRow({
  combat: c,
  selected,
  onSelect,
}: {
  combat: CombatSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full flex-col gap-1 rounded-xl border bg-card p-3 text-left text-card-foreground transition hover:bg-accent ${selected ? 'ring-2 ring-ring' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={RESULT_BADGE[c.resultat]}>{RESULTS[c.resultat]}</Badge>
        <span>
          contre <b>{c.adversaire}</b>
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{date(c.cree_le)}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {c.mode === 'payant' ? 'Duel' : 'Combat du jour'}
        {c.tours != null && ` · ${c.tours} tour${c.tours > 1 ? 's' : ''}`} ·{' '}
        <Gold n={c.gain ?? 0} sign />
      </div>
      <div className="text-sm">
        <div>Toi : {trio(c.ma_carte, c.ma_magie, c.mon_piege)}</div>
        <div className="text-muted-foreground">
          Lui : {trio(c.sa_carte, c.sa_magie, c.son_piege)}
        </div>
      </div>
    </button>
  );
}

function CombatReplay({ combat }: { combat: CombatSummary }) {
  const session = useSession();
  const userId = session?.user.id ?? '';
  const player = useQuery({
    queryKey: playerKeys.player(userId),
    queryFn: () => fetchPlayer(userId),
    enabled: userId !== '',
  });
  const replay = useQuery({
    queryKey: historyKeys.replay(combat.id),
    queryFn: () => fetchReplay(combat.id),
    staleTime: Infinity,
  });

  if (replay.error) return <p role="alert">Déroulé indisponible : {replay.error.message}</p>;
  if (!replay.data) return <ReplaySkeleton />;

  // Which side is the player: the start line names both players.
  const players = replay.data.find((l) => l.t === 'debut')?.joueurs ?? [];
  const names: [string, string] = [
    players[0]?.pseudo ?? 'Joueur 1',
    players[1]?.pseudo ?? 'Joueur 2',
  ];
  const me: 0 | 1 = player.data && names[1] === player.data.pseudo ? 1 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={RESULT_BADGE[combat.resultat]}>{RESULTS[combat.resultat]}</Badge>
        <h2 className="text-lg font-semibold">contre {combat.adversaire}</h2>
        {combat.tours != null && (
          <span className="text-sm text-muted-foreground">
            en {combat.tours} tour{combat.tours > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <Replay lines={replay.data} me={me} names={names} />
    </div>
  );
}

function Boosters() {
  const boosters = useQuery({ queryKey: historyKeys.boosters, queryFn: fetchOpenedBoosters });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  if (boosters.error) return <p role="alert">Erreur : {boosters.error.message}</p>;
  if (!boosters.data) return <CardRowsSkeleton />;
  if (!boosters.data.length)
    return (
      <p className="text-muted-foreground">
        Aucun booster ouvert pour l'instant : tes 5 prochaines ouvertures apparaîtront ici.
      </p>
    );
  const images = mirror.data ?? new Set<string>();

  return (
    <div className="flex flex-col gap-4">
      {boosters.data.map((b, i) => {
        const cards = b.cartes ?? [];
        return (
          <Card key={i} className="p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <b className="flex items-center gap-2">
                <ICONS.booster className="size-4" /> {b.booster ?? 'Booster'}
              </b>
              <span className="text-xs text-muted-foreground">
                {date(b.cree_le)} · {cards.length} carte{cards.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-tiles-sm gap-3">
              {cards.map((c, j) => {
                const name = c.carte ?? c.nom ?? '';
                const src = imageUrl(c.image ?? null, images);
                return (
                  <figure key={j} className="flex flex-col gap-1">
                    {src ? (
                      <img
                        loading="lazy"
                        src={src}
                        alt={name}
                        className={`aspect-5/7 w-full rounded-md object-cover ${c.couleur ? 'rarity-ring' : 'shadow-sm'}`}
                        style={{ '--rarity': c.couleur ?? undefined }}
                      />
                    ) : (
                      <div className="aspect-5/7 w-full rounded-md bg-muted" />
                    )}
                    <figcaption className="truncate text-center text-xs">{name}</figcaption>
                  </figure>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
