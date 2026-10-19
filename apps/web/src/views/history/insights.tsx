// What the history tells beyond the list: the form, and the results by card played and by opponent.

import { StatsSkeleton } from '@/components/skeletons';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { TONES } from '@/lib/tones';
import { ICONS } from '@/lib/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, Cell, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts';
import { DEFAULT_RULES } from '@forestcard/engine';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import {
  type CombatSummary,
  fetchHistory,
  historyKeys,
  RESULTS,
  type Result,
} from '@/data/history';
import { type Record3, recordsBy, winRate } from './analysis';

// The form as a chart, one column per combat, the oldest on the left, in two bands. Above, the gold
// won: a wave on the gold scale at the left, with the default rewards of the rules as dashed marks
// (a point above its mark had a bonus: a bounty, double gains). Below, the result: a win up, a
// loss down, a draw a short grey mark, all the same height. Two bands, not one: two scales in one
// frame made a loss's 10 gold look level with the loss bars.
// The marks are the engine's defaults (DEFAULT_RULES): a combat run with other rules is not known
// to the history (README, "Plus tard").
const REWARD_MARKS: { gold: number; label: string }[] = [
  { gold: DEFAULT_RULES.gain, label: 'victoire' },
  { gold: DEFAULT_RULES.nul, label: 'nul' },
  { gold: DEFAULT_RULES.perte, label: 'défaite' },
];
const RESULT_BAR: Record<Result, { value: number; colour: string }> = {
  victoire: { value: 1, colour: TONES.success.colour },
  defaite: { value: -1, colour: TONES.danger.colour },
  nul: { value: 0.15, colour: TONES.draw.colour },
};
// Both bands share these, so a combat's column is at the same place in each.
const FORM_MARGIN = { top: 8, right: 56, bottom: 0, left: 0 };
const AXIS_WIDTH = 36;
const FORM_CONFIG = {
  result: { label: 'Résultat' },
  gold: { label: 'Gold gagné', color: 'var(--chart-1)' },
} satisfies ChartConfig;

type FormPoint = {
  index: number;
  result: number;
  gold: number;
  combat: CombatSummary;
};

export function FormStrip({
  combats,
  streak,
}: {
  combats: CombatSummary[];
  streak: { result: Result; length: number } | null;
}) {
  // Kept while the combats are the same: a new array would replay the chart's entry animation
  // whenever the page re-renders (opening a replay changes the address).
  const points = useMemo<FormPoint[]>(
    () =>
      [...combats].reverse().map((c, i) => ({
        index: i + 1,
        result: RESULT_BAR[c.resultat].value,
        gold: c.gain ?? 0,
        combat: c,
      })),
    [combats],
  );
  return (
    <div className="flex flex-col gap-2">
      {/* Two bands, one column per combat (same margins, same left axis width, synced pointer):
          the gold on its own scale above, the results below. One scale per band. */}
      <ChartContainer config={FORM_CONFIG} className="aspect-auto h-32 w-full">
        <ComposedChart data={points} syncId="form" margin={FORM_MARGIN}>
          <XAxis dataKey="index" hide />
          <YAxis
            yAxisId="gold"
            width={AXIS_WIDTH}
            domain={[0, (max: number) => Math.max(max, DEFAULT_RULES.gain) * 1.15]}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          />
          {REWARD_MARKS.map((m) => (
            <ReferenceLine
              key={m.label}
              yAxisId="gold"
              y={m.gold}
              stroke="var(--muted-foreground)"
              strokeDasharray="3 3"
              strokeOpacity={0.6}
              label={{
                value: `${m.label} ${m.gold}`,
                position: 'right',
                fontSize: 10,
                fill: 'var(--muted-foreground)',
              }}
            />
          ))}
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={<FormTip />} />
          {/* Invisible: it gives the band layout, so each point sits over its result bar. */}
          <Bar yAxisId="gold" dataKey="gold" fill="transparent" maxBarSize={28} />
          <Line
            yAxisId="gold"
            dataKey="gold"
            type="monotone"
            stroke="var(--color-gold)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--color-gold)' }}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ChartContainer>
      <ChartContainer config={FORM_CONFIG} className="aspect-auto h-16 w-full">
        <ComposedChart data={points} syncId="form" margin={FORM_MARGIN}>
          <XAxis dataKey="index" hide />
          <YAxis
            yAxisId="result"
            width={AXIS_WIDTH}
            domain={[-1.1, 1.1]}
            tick={false}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine yAxisId="result" y={0} stroke="var(--border)" />
          {/* The tooltip shows above, in the gold band. */}
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={() => null} />
          <Bar yAxisId="result" dataKey="result" radius={3} maxBarSize={28}>
            {points.map((p) => (
              <Cell key={p.index} fill={RESULT_BAR[p.combat.resultat].colour} />
            ))}
          </Bar>
        </ComposedChart>
      </ChartContainer>
      {streak && streak.length > 1 && (
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <ICONS.streak className="size-4" />
          {streak.length}{' '}
          {streak.result === 'victoire'
            ? 'victoires'
            : streak.result === 'defaite'
              ? 'défaites'
              : 'nuls'}{' '}
          d'affilée
        </p>
      )}
    </div>
  );
}

// The default reward of a result.
const base = (r: Result): number =>
  r === 'victoire' ? DEFAULT_RULES.gain : r === 'defaite' ? DEFAULT_RULES.perte : DEFAULT_RULES.nul;

// A combat under the pointer: who, how it ended, how long, what it paid.
function FormTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: FormPoint }[];
}) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  const c = p.combat;
  return (
    <div className="grid gap-0.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <b>
        {RESULTS[c.resultat]} contre {c.adversaire}
      </b>
      {c.tours !== null && <span className="text-muted-foreground">{c.tours} tours</span>}
      <span className="text-muted-foreground">
        {p.gold} gold
        {p.gold > base(c.resultat) && ` (dont ${p.gold - base(c.resultat)} de bonus)`}
      </span>
    </div>
  );
}

// Turn 0 is before the first turn: the start of the combat (magics, early traps).
// More combats than the list when the server gives them: the results by card get more meaningful.
// If the larger request fails, the 10 of the list are used.
const STATS_LIMIT = 50;

export function StatsTab() {
  const many = useQuery({
    queryKey: historyKeys.combats(STATS_LIMIT),
    queryFn: () => fetchHistory(STATS_LIMIT),
    retry: false,
  });
  const few = useQuery({
    queryKey: historyKeys.combats(),
    queryFn: () => fetchHistory(),
    enabled: many.isError,
  });
  const combats = many.data ?? few.data;
  if (few.error) return <p role="alert">Erreur : {few.error.message}</p>;
  if (!combats) return <StatsSkeleton />;
  if (!combats.length)
    return <p className="text-muted-foreground">Pas encore de combat à analyser.</p>;

  const groups: { title: string; key: (c: CombatSummary) => string | null }[] = [
    { title: 'Tes combattants', key: (c) => c.ma_carte },
    { title: 'Tes magies', key: (c) => c.ma_magie },
    { title: 'Tes pièges', key: (c) => c.mon_piege },
    { title: 'Face à face', key: (c) => c.adversaire },
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Sur tes {combats.length} derniers combats.
        {combats.length < 20 && ' Peu de combats : les pourcentages bougeront beaucoup.'}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.title}>
            <CardHeader>
              <CardTitle className="text-base">{g.title}</CardTitle>
              <CardDescription>Victoires · défaites · nuls, et % de victoires</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {recordsBy(combats, g.key).map(({ name, record }) => (
                <RecordRow key={name} name={name} record={record} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function RecordRow({ name, record }: { name: string; record: Record3 }) {
  const rate = winRate(record);
  return (
    <div className="grid layout-record-row items-center gap-2 text-sm">
      <span className="truncate">{name}</span>
      <span className="text-right text-xs tabular-nums text-muted-foreground">
        {record.victoire} · {record.defaite} · {record.nul}
      </span>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full w-(--pct) rounded-full ${TONES.success.fill}`}
            style={{ '--pct': `${rate}%` }}
          />
        </div>
        <span className="w-9 text-right text-xs tabular-nums">{rate} %</span>
      </div>
    </div>
  );
}
