// A combat's replay from its stored journal: a chart of both sides' HP over the combat, then the
// story turn by turn, each line styled by its kind.

import { TONES } from '@/lib/tones';
import { ICONS, type LucideIcon } from '@/lib/icons';
import type { ReplayLine } from '@/data/history';
import { highlights } from './analysis';

// Lines worth a mark in the story, by kind.
const MARKS: Record<string, { icon: LucideIcon; label: string }> = {
  piege: { icon: ICONS.trap, label: 'Piège' },
  ultime: { icon: ICONS.ultimate, label: 'Ultime' },
};

// The kind of a journal line (its `t`) decides its colour.
const TONE: Record<string, string> = {
  degats: TONES.damage.text,
  attaque: TONES.damage.text,
  frappe: TONES.damage.text,
  soin: TONES.healing.text,
  reanim: TONES.healing.text,
  protege: TONES.healing.text,
  statut: TONES.status.text,
  finstatut: `${TONES.status.text} opacity-70`,
  magie: TONES.magic.text,
  piege: TONES.trap.text,
  ultime: TONES.ultimate.text,
  vol: TONES.theft.text,
  souffle: TONES.breath.text,
  esquive: TONES.defence.text,
  bloque: TONES.defence.text,
  fin: 'font-semibold',
  prolongation: 'font-semibold',
  debut: 'font-semibold',
};

// Lines grouped by turn: a `tour` line opens a group ("Tour 3 : …"), lines before the first one
// (the start of the combat) form a group without a title.
// Each line keeps its index in the journal, so highlights can point at it; `turn` counts the turns
// (0 for the start).
type Group = { title: string | null; turn: number; lines: { line: ReplayLine; index: number }[] };

export function byTurn(lines: ReplayLine[]): Group[] {
  const groups: Group[] = [{ title: null, turn: 0, lines: [] }];
  lines.forEach((line, index) => {
    if (line.t === 'tour') groups.push({ title: line.txt, turn: groups.length, lines: [] });
    else groups.at(-1)?.lines.push({ line, index });
  });
  return groups.filter((g) => g.title !== null || g.lines.length);
}

// HP of each side as a share of its max HP, after every line that carries them.
export function hpSeries(lines: ReplayLine[]): [number, number][] {
  const points: [number, number][] = [];
  for (const { pv, max } of lines) {
    if (!pv || !max || pv.length < 2 || max.length < 2) continue;
    const share = (i: number) => Math.max(0, Math.min(1, (pv[i] ?? 0) / (max[i] || 1)));
    points.push([share(0), share(1)]);
  }
  return points;
}

export function Replay({
  lines,
  me,
  names,
}: {
  lines: ReplayLine[];
  me: 0 | 1;
  names: [string, string];
}) {
  const series = hpSeries(lines);
  const { biggestHit, comebackTurn } = highlights(lines);
  return (
    <div className="flex flex-col gap-4">
      {series.length > 1 && <HpChart series={series} me={me} names={names} />}
      <ol className="flex flex-col gap-3 text-sm">
        {byTurn(lines).map((group, i) => (
          <li key={i}>
            {group.title && (
              <h4 className="mb-1 flex items-center gap-2 font-semibold">
                {group.title}
                {group.turn === comebackTurn && (
                  <Mark
                    icon={ICONS.reversal}
                    label="Renversement : le gagnant passe devant en PV"
                  />
                )}
              </h4>
            )}
            <ul className="flex flex-col gap-0.5 border-l pl-3">
              {group.lines.map(({ line, index }) => {
                const mark =
                  index === biggestHit
                    ? { icon: ICONS.attack, label: 'Plus gros coup' }
                    : MARKS[line.t];
                return (
                  <li
                    key={index}
                    className={`${TONE[line.t] ?? 'text-muted-foreground'} ${mark ? 'flex flex-wrap items-center gap-2 font-medium' : ''}`}
                  >
                    {line.txt}
                    {mark && <Mark {...mark} />}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Mark({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
      <Icon className="size-3" /> {label}
    </span>
  );
}

const W = 600;
const H = 120;

function HpChart({
  series,
  me,
  names,
}: {
  series: [number, number][];
  me: 0 | 1;
  names: [string, string];
}) {
  const path = (side: 0 | 1) =>
    series
      .map(([a, b], i) => {
        const x = (i / (series.length - 1)) * W;
        const y = (1 - (side === 0 ? a : b)) * (H - 8) + 4;
        return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  const other = me === 0 ? 1 : 0;
  return (
    <figure className="rounded-lg border p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-28 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="PV des deux combattants au fil du combat"
      >
        <path
          d={path(other)}
          fill="none"
          stroke={TONES.opponent.colour}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path(me)}
          fill="none"
          stroke={TONES.me.colour}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className={`inline-block h-0.5 w-4 ${TONES.me.fill}`} /> {names[me]} (toi)
        </span>
        <span>PV au fil du combat</span>
        <span className="flex items-center gap-1">
          <span className={`inline-block h-0.5 w-4 ${TONES.opponent.fill}`} /> {names[other]}
        </span>
      </figcaption>
    </figure>
  );
}
