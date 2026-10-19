// The leaderboard, reimagined: the period (global, month, week) and the sort in the address; the
// top three on a podium; then the table, sorted by clicking a column's header (the legacy page had
// a select); the player's own row highlighted, with their rank above and a link to it. A pseudo opens
// that player's profile.

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ICONS } from '@/lib/icons';
import { CardRowsSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  fetchLeaderboard,
  leaderboardKeys,
  type LeaderboardRow,
  PERIODS,
  type Period,
} from '@/data/leaderboard';
import { useSession } from '@/lib/session';
import { availableSorts, combats, ordinal, rank, winRate } from './model';
import { SORTS, type Sort } from './search';

const route = getRouteApi('/classement');
const MEDALS = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

function subtitle(period: Period, rows: LeaderboardRow[]): string {
  if (period === 'mois')
    return `Combats depuis le 1er ${new Date().toLocaleDateString('fr-FR', { month: 'long' })}, remis à zéro chaque début de mois.`;
  if (period === 'semaine') {
    const start = rows[0]?.debut;
    const day = start
      ? ` ${new Date(start).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
      : '';
    return `Combats depuis lundi${day}, remis à zéro chaque lundi.`;
  }
  return 'Tous les combats depuis le début.';
}

export function LeaderboardPage() {
  const { periode = 'global', tri = 'victoires' } = route.useSearch();
  const navigate = route.useNavigate();
  const me = useSession()?.user.id;
  const rows = useQuery({
    queryKey: leaderboardKeys.of(periode),
    queryFn: () => fetchLeaderboard(periode),
    // Another period keeps the current table on screen while it loads, instead of the skeleton.
    placeholderData: keepPreviousData,
  });
  const set = (patch: { periode?: Period; tri?: Sort }) =>
    void navigate({
      search: (s) => {
        const next = { ...s, ...patch };
        return {
          periode: next.periode === 'global' ? undefined : next.periode,
          tri: next.tri === 'victoires' ? undefined : next.tri,
        };
      },
      replace: true,
      resetScroll: false,
    });

  const periods = (
    <ToggleGroup
      type="single"
      variant="outline"
      value={periode}
      onValueChange={(v) => v && set({ periode: v as Period })}
    >
      {(Object.keys(PERIODS) as Period[]).map((p) => (
        <ToggleGroupItem key={p} value={p}>
          {PERIODS[p]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );

  if (rows.error)
    return (
      <div className="flex flex-col gap-4">
        {periods}
        <p role="alert">Classement indisponible pour le moment : {rows.error.message}</p>
      </div>
    );
  if (!rows.data)
    return (
      <div className="flex flex-col gap-4">
        {periods}
        <CardRowsSkeleton />
      </div>
    );

  const sorts = availableSorts(rows.data);
  const sort = sorts.includes(tri) ? tri : 'victoires';
  const ranked = rank(rows.data, periode, sort);
  const mine = ranked.findIndex((r) => r.joueur_id === me);
  const goToMine = () =>
    document
      .getElementById('classement-moi')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          {periods}
          <p className="text-sm text-muted-foreground">{subtitle(periode, rows.data)}</p>
        </div>
        {mine >= 0 && (
          <Button variant="outline" onClick={goToMine}>
            <ICONS.position /> Tu es {ordinal(mine + 1)}
          </Button>
        )}
      </div>

      {ranked.length === 0 ? (
        <p className="text-muted-foreground">Aucun combat pour l'instant.</p>
      ) : (
        // The previous period's table, dimmed while the new one loads.
        <div
          className={`flex flex-col gap-6 transition-opacity ${rows.isPlaceholderData ? 'opacity-50' : ''}`}
          aria-busy={rows.isPlaceholderData}
        >
          <Podium rows={ranked.slice(0, 3)} me={me} sort={sort} />
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-muted/50">
                <tr>
                  <th className="w-12 px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Joueur</th>
                  {sorts.map((s) => (
                    <th key={s} className="px-3 py-2 text-right font-medium">
                      <button
                        type="button"
                        onClick={() => set({ tri: s })}
                        aria-pressed={s === sort}
                        // Already sorted by this column: clicking it again would do nothing.
                        disabled={s === sort}
                        className={`inline-flex items-center gap-1 hover:text-foreground disabled:cursor-default ${
                          s === sort ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {SORTS[s]}
                        {s === sort && <ICONS.sorted className="size-3.5" />}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <tr
                    key={r.joueur_id}
                    id={r.joueur_id === me ? 'classement-moi' : undefined}
                    className={`border-t ${r.joueur_id === me ? 'bg-primary/10 font-medium' : ''}`}
                  >
                    <td className="px-3 py-2">{MEDALS[i] ?? i + 1}</td>
                    <td className="px-3 py-2">
                      <PlayerLink row={r} me={me} />
                    </td>
                    {sorts.map((s) => (
                      <td
                        key={s}
                        className={`px-3 py-2 text-right ${s === sort ? 'font-semibold' : ''}`}
                      >
                        {cell(r, s)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function cell(r: LeaderboardRow, s: Sort): string | number {
  if (s === 'pct') {
    const rate = winRate(r);
    return rate === null ? '—' : `${rate} %`;
  }
  if (s === 'combats') return combats(r);
  return r[s] ?? '—';
}

function PlayerLink({ row, me }: { row: LeaderboardRow; me: string | undefined }) {
  return (
    <Link
      to="/profil"
      search={row.joueur_id === me ? {} : { joueur: row.joueur_id }}
      className="hover:underline"
    >
      {row.pseudo}
      {row.joueur_id === me && <span className="text-muted-foreground"> (toi)</span>}
    </Link>
  );
}

// The top three, the first in the middle and raised; each with the value of the sort.
function Podium({
  rows,
  me,
  sort,
}: {
  rows: LeaderboardRow[];
  me: string | undefined;
  sort: Sort;
}) {
  const order = [1, 0, 2].filter((i) => rows[i]);
  const height = ['h-28', 'h-20', 'h-14'];
  return (
    <div className="grid grid-cols-3 items-end gap-3">
      {order.map((i) => {
        const r = rows[i];
        if (!r) return null;
        return (
          <div key={r.joueur_id} className="flex flex-col items-center gap-2 text-center">
            <span className="text-3xl">{MEDALS[i]}</span>
            <PlayerLink row={r} me={me} />
            <span className="text-sm text-muted-foreground tabular-nums">
              {cell(r, sort)} {sort === 'victoires' ? `victoire${r.victoires > 1 ? 's' : ''}` : ''}
            </span>
            <div
              className={`w-full rounded-t-lg border border-b-0 bg-muted/60 ${height[i]} ${
                r.joueur_id === me ? 'bg-primary/15' : ''
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
