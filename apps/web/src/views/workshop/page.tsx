// L'atelier. Part 1: TAC-001, the slot machine of the Mécanique et Technologie collection, turns the
// fragments of recycling into rarity fragments. The player picks a tier (Épique, Légendaire, GGEZ,
// each with its rate), stakes what they want (at least the minimum) and pulls the lever: the three
// reels on TAC-001's belly spin and stop, one after the other, each on its own case (a skull ×0,5,
// cherries ×1,2, a bell ×2, 7 ×3), and the pull is worth their product (three 7: ×27, the jackpot).
// The draw is the database's (atelier_tac): the reels only show it. Part 2, the forge, comes later: a card says so.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { Fragments } from '@/components/money';
import { PageSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { playerKeys } from '@/data/player';
import {
  conversion,
  fetchWorkshop,
  multLabel,
  reelTarget,
  type Spin,
  spinTac,
  type Tier,
  type Workshop,
  workshopError,
  workshopKeys,
} from '@/data/workshop';
import { ICONS } from '@/lib/icons';
import { useSession } from '@/lib/session';
import { TONES } from '@/lib/tones';

// The machine's own colours: an illustration (brass, bulbs), not meanings.
const BRASS = {
  frame: '#2a1a0e',
  bulb: '#ffd35a',
  bulbOff: '#6b4a1e',
  light: '#e7b552',
  mid: '#b07a2a',
  dark: '#5e3a12',
  copper: '#b5582e',
  copperDark: '#6e2f14',
  iron: '#3a3632',
  ironLight: '#6d665e',
  glass: '#140d08',
  ember: '#ff4b2b',
  emberGlow: '#ffb199',
  plate: '#1c120a',
  steam: '#e9e6e1',
  gear: '#8a7f72',
  gearDark: '#4f4840',
};

// The reels' symbols, by case of the wheel (a loss, a little gain, double, the jackpot).
const SYMBOLS = ['\u{1F480}', '\u{1F352}', '\u{1F514}', '7'];
// Where the reels sit in TAC-001's belly: its window in the drawing (viewBox 400 × 320), as shares.
const REELS_AT = {
  '--reels-x': `${(108 / 400) * 100}%`,
  '--reels-y': `${(150 / 320) * 100}%`,
  '--reels-w': `${(184 / 400) * 100}%`,
  '--reels-h': `${(86 / 320) * 100}%`,
};
// Each reel stops a little after the previous one, after more turns.
const REEL_STOPS = [
  { ms: 1700, turns: 6 },
  { ms: 2400, turns: 8 },
  { ms: 3100, turns: 10 },
];
const SPIN_MS = (REEL_STOPS.at(-1)?.ms ?? 3000) + 250;
const STRIP = 4 * 40; // cells on a reel's strip: enough for one pull (it rewinds before each)

export function WorkshopPage() {
  const state = useQuery({ queryKey: workshopKeys.state, queryFn: fetchWorkshop });
  if (state.error)
    return <p role="alert">L'atelier est fermé pour le moment : {state.error.message}</p>;
  if (!state.data) return <PageSkeleton />;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">
        Dans l'atelier, tes fragments deviennent des fragments de rareté. Glisse-les dans TAC-001,
        tire le levier… et croise les doigts. Bientôt, ils te serviront à forger des cartes.
      </p>
      <Tac w={state.data} />
      <Forge />
    </div>
  );
}

// One reel: a strip of the cases' symbols, standing on cell `at` (moving there in `ms`, or at once).
function Reel({ cases, at, ms }: { cases: number; at: number; ms: number }) {
  return (
    <div className="relative h-full flex-1 overflow-hidden rounded-md bg-background/85 ring-1 ring-border">
      <div
        className="flex h-full translate-y-(--y) flex-col transition-transform duration-(--ms) ease-wheel"
        style={{ '--y': `${-at * 100}%`, '--ms': `${ms}ms` }}
      >
        {Array.from({ length: STRIP }, (_, i) => (
          <div key={i} className="flex h-full shrink-0 items-center justify-center">
            <span
              className={`text-3xl leading-none font-black ${i % cases === 3 ? TONES.danger.text : ''}`}
            >
              {SYMBOLS[i % cases] ?? '?'}
            </span>
          </div>
        ))}
      </div>
      {/* The glass over the reel. */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-foreground/30 via-transparent to-foreground/30" />
    </div>
  );
}

// A gear's outline: `teeth` teeth around a circle of radius r.
function gearPath(cx: number, cy: number, r: number, teeth: number): string {
  const points: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    for (const [da, rr] of [
      [0, r * 0.8],
      [step * 0.18, r],
      [step * 0.5, r],
      [step * 0.68, r * 0.8],
    ] as const)
      points.push(
        `${(cx + Math.cos(a + da) * rr).toFixed(1)},${(cy + Math.sin(a + da) * rr).toFixed(1)}`,
      );
  }
  return `M${points.join('L')}Z`;
}

function Gear({ teeth, motion }: { teeth: number; motion: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`size-full ${motion}`} aria-hidden>
      <path
        d={gearPath(50, 50, 48, teeth)}
        fill={BRASS.gear}
        stroke={BRASS.gearDark}
        strokeWidth="3"
      />
      <circle cx="50" cy="50" r="17" fill={BRASS.gearDark} />
      <circle cx="50" cy="50" r="7" fill={BRASS.light} />
    </svg>
  );
}

// TAC-001, drawn: a brass slot machine with a copper chimney, two ember eyes, its name plate, the
// three reels in its belly and its lever on the left. Its gears turn (fast while it works), steam
// puffs from the chimney, the bulbs of its arch blink, the lever comes down when pulled; it shakes
// while the reels spin, flashes on the jackpot.
function Machine({
  w,
  reels,
  moving,
  pulled,
  working,
  jackpot,
}: {
  w: Workshop;
  reels: number[];
  moving: boolean;
  pulled: boolean;
  working: boolean;
  jackpot: boolean;
}) {
  const lit = working || jackpot;
  const arch = Array.from({ length: 11 }, (_, i) => i);
  const rivets = [
    [92, 110],
    [308, 110],
    [92, 262],
    [308, 262],
    [200, 262],
  ];
  return (
    <div
      className={`relative mx-auto w-full max-w-md ${working ? 'animate-tac-shake' : ''} ${
        jackpot ? 'animate-jackpot' : ''
      }`}
    >
      <svg viewBox="0 0 400 320" className="w-full" role="img" aria-label={w.tac?.nom ?? 'TAC-001'}>
        <defs>
          <linearGradient id="tac-brass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={BRASS.light} />
            <stop offset="55%" stopColor={BRASS.mid} />
            <stop offset="100%" stopColor={BRASS.dark} />
          </linearGradient>
          <linearGradient id="tac-copper" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={BRASS.copperDark} />
            <stop offset="50%" stopColor={BRASS.copper} />
            <stop offset="100%" stopColor={BRASS.copperDark} />
          </linearGradient>
          <radialGradient id="tac-ember" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={BRASS.emberGlow} />
            <stop offset="60%" stopColor={BRASS.ember} />
            <stop offset="100%" stopColor={BRASS.copperDark} />
          </radialGradient>
        </defs>
        {/* The chimney, its pipe into the machine. */}
        <rect x="300" y="18" width="28" height="70" rx="4" fill="url(#tac-copper)" />
        <rect x="294" y="12" width="40" height="12" rx="3" fill={BRASS.copperDark} />
        <path
          d="M314 88 L314 104 L290 104"
          stroke="url(#tac-copper)"
          strokeWidth="12"
          fill="none"
        />
        {/* The arch over the machine, with its bulbs. */}
        <path
          d="M78 112 Q200 18 322 112 Z"
          fill="url(#tac-brass)"
          stroke={BRASS.frame}
          strokeWidth="4"
        />
        {arch.map((i) => {
          const t = i / (arch.length - 1);
          const x = 90 + t * 220;
          const y = 108 - Math.sin(t * Math.PI) * 74;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="5"
              fill={lit || i % 3 === 0 ? BRASS.bulb : BRASS.bulbOff}
              className={lit && i % 2 === 0 ? 'animate-pulse' : ''}
            />
          );
        })}
        {/* Its eyes and its name. */}
        <circle cx="168" cy="76" r="11" fill={BRASS.iron} />
        <circle cx="232" cy="76" r="11" fill={BRASS.iron} />
        <circle
          cx="168"
          cy="76"
          r="7"
          fill="url(#tac-ember)"
          className={lit ? 'animate-pulse' : ''}
        />
        <circle
          cx="232"
          cy="76"
          r="7"
          fill="url(#tac-ember)"
          className={lit ? 'animate-pulse' : ''}
        />
        <rect
          x="160"
          y="92"
          width="80"
          height="18"
          rx="3"
          fill={BRASS.plate}
          stroke={BRASS.light}
        />
        <text
          x="200"
          y="105"
          textAnchor="middle"
          fontSize="12"
          fontWeight="800"
          letterSpacing="2"
          fill={BRASS.bulb}
        >
          {w.tac?.nom ?? 'TAC-001'}
        </text>
        {/* The body. */}
        <rect
          x="78"
          y="112"
          width="244"
          height="168"
          rx="14"
          fill="url(#tac-brass)"
          stroke={BRASS.frame}
          strokeWidth="4"
        />
        {/* The belly's window, around the reels. */}
        <rect
          x="100"
          y="142"
          width="200"
          height="102"
          rx="10"
          fill={BRASS.iron}
          stroke={BRASS.frame}
          strokeWidth="3"
        />
        <rect x="106" y="148" width="188" height="90" rx="6" fill={BRASS.glass} />
        {/* The coin tray. */}
        <rect
          x="150"
          y="252"
          width="100"
          height="16"
          rx="5"
          fill={BRASS.iron}
          stroke={BRASS.frame}
          strokeWidth="2"
        />
        <rect x="170" y="257" width="60" height="5" rx="2" fill={BRASS.glass} />
        {rivets.map(([x, y]) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r="4"
            fill={BRASS.dark}
            stroke={BRASS.light}
            strokeWidth="1"
          />
        ))}
        {/* The feet. */}
        <rect x="96" y="278" width="40" height="18" rx="4" fill={BRASS.iron} />
        <rect x="264" y="278" width="40" height="18" rx="4" fill={BRASS.iron} />
        {/* The lever's mount, then the lever: it comes down when pulled. */}
        <rect
          x="56"
          y="186"
          width="26"
          height="34"
          rx="6"
          fill={BRASS.iron}
          stroke={BRASS.frame}
          strokeWidth="2"
        />
        <g
          className={`origin-bottom transition-transform duration-300 transform-fill ${
            pulled ? '-rotate-75' : 'rotate-0'
          }`}
        >
          <rect
            x="64"
            y="100"
            width="10"
            height="104"
            rx="5"
            fill={BRASS.ironLight}
            stroke={BRASS.frame}
            strokeWidth="2"
          />
          <circle
            cx="69"
            cy="98"
            r="15"
            fill="url(#tac-ember)"
            stroke={BRASS.copperDark}
            strokeWidth="2"
          />
        </g>
      </svg>
      {/* The reels, in the belly's window. */}
      <div
        className="absolute top-(--reels-y) left-(--reels-x) flex h-(--reels-h) w-(--reels-w) gap-1"
        style={REELS_AT}
      >
        {reels.map((at, i) => (
          <Reel
            key={i}
            cases={w.roue.length || 4}
            at={at}
            ms={moving ? (REEL_STOPS[i]?.ms ?? 0) : 0}
          />
        ))}
      </div>
      {/* Gears on its flanks. */}
      <div className="absolute top-1/2 -left-1 size-14">
        <Gear teeth={12} motion={working ? 'animate-gear-fast' : 'animate-gear'} />
      </div>
      <div className="absolute right-0 bottom-6 size-12">
        <Gear teeth={9} motion={working ? 'animate-gear-fast' : 'animate-gear-back'} />
      </div>
      {/* Steam from the chimney. */}
      <div className="absolute top-0 right-1/5" aria-hidden>
        {[0, 800, 1600].map((d) => (
          <svg
            key={d}
            viewBox="0 0 20 20"
            className="absolute size-7 animate-steam opacity-0"
            style={{ '--delay': `${working ? d / 3 : d}ms` }}
          >
            <circle cx="10" cy="10" r="8" fill={BRASS.steam} />
          </svg>
        ))}
      </div>
    </div>
  );
}

function TierTile({ tier, chosen, onPick }: { tier: Tier; chosen: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={chosen}
      className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-3 text-center transition hover:-translate-y-0.5 ${
        chosen ? 'border-primary bg-primary/10' : ''
      }`}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <span
          className="size-3 rounded-full bg-(--rarity) ring-1 ring-border"
          style={{ '--rarity': tier.couleur ?? 'var(--muted-foreground)' }}
        />
        {tier.nom}
      </span>
      <small className="text-muted-foreground">
        {tier.taux === 1 ? '1 pour 1' : `${tier.taux} fragments pour 1`}
      </small>
      <small className="tabular-nums">Tu en as {tier.solde}</small>
    </button>
  );
}

function Tac({ w }: { w: Workshop }) {
  const client = useQueryClient();
  const userId = useSession()?.user.id ?? '';
  const [tierKey, setTierKey] = useState<Tier['cle']>('epique');
  const [stakeText, setStakeText] = useState(String(w.mise_min));
  const [reels, setReels] = useState([0, 0, 0]);
  const [moving, setMoving] = useState(false);
  const [pulled, setPulled] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle');
  const [result, setResult] = useState<Spin | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );
  const spin = useMutation({ mutationFn: spinTac });
  const tier = w.paliers.find((t) => t.cle === tierKey) ?? w.paliers[0];
  const stake = Math.floor(Number(stakeText));
  const stakeOk = Number.isFinite(stake) && stake >= w.mise_min && stake <= w.fragments;
  const busy = phase === 'spinning' || spin.isPending;
  const cases = w.roue.length || 4;
  const later = (fn: () => void, delay: number) => {
    timers.current.push(setTimeout(fn, delay));
  };

  const pull = () => {
    if (!tier || !stakeOk) return;
    setResult(null);
    setPhase('spinning');
    setPulled(true);
    later(() => setPulled(false), 450);
    spin.mutate(
      { tier: tier.cle, stake },
      {
        onSuccess: (r) => {
          // Rewind the strips at once (each still shows the same symbol), then run them to the case.
          setMoving(false);
          setReels((now) => now.map((at) => at % cases));
          later(() => {
            setMoving(true);
            setReels((now) =>
              now.map((at, i) => reelTarget(at, r.cases[i] ?? 0, cases, REEL_STOPS[i]?.turns ?? 6)),
            );
          }, 40);
          later(() => {
            setResult(r);
            setPhase('done');
            void Promise.all([
              client.invalidateQueries({ queryKey: workshopKeys.state }),
              client.invalidateQueries({ queryKey: playerKeys.player(userId) }),
            ]);
          }, SPIN_MS + 40);
        },
        onError: () => setPhase('idle'),
      },
    );
  };

  const tierName = (cle: string) => w.paliers.find((t) => t.cle === cle)?.nom ?? cle;
  const jackpot =
    phase === 'done' &&
    !!result &&
    result.cases.length > 0 &&
    result.cases.every((k) => k === cases - 1);
  const caseMult = (k: number) => w.roue[k]?.mult ?? 1;
  const extremes = w.roue.length
    ? [Math.min(...w.roue.map((c) => c.mult)), Math.max(...w.roue.map((c) => c.mult))]
    : [1, 1];
  const quick = [...new Set([w.mise_min, 100, 250, 500])].filter(
    (n) => n >= w.mise_min && n <= w.fragments,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ICONS.workshop className="size-4" /> TAC-001, la machine à fragments
          <Badge variant="outline" className="ml-auto">
            Mécanique et Technologie
          </Badge>
        </CardTitle>
        <CardDescription>
          Mise tes fragments (au moins {w.mise_min}) et choisis ce que TAC-001 te rend : des
          fragments Épiques, Légendaires ou GGEZ, multipliés par ce qui tombe sur ses rouleaux.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Machine
          w={w}
          reels={reels}
          moving={moving}
          pulled={pulled}
          working={busy}
          jackpot={jackpot}
        />
        {phase === 'done' && result && (
          <p
            className={`rounded-lg border p-3 text-center text-sm ${
              result.mult >= 1 ? TONES.success.box : 'bg-muted/40'
            }`}
          >
            {jackpot && <b className={`block text-lg ${TONES.gold.text}`}>JACKPOT !</b>}
            {result.cases.map((k) => multLabel(caseMult(k))).join(' × ')} ={' '}
            <b>{multLabel(result.mult)}</b> : tes {result.mise} fragments deviennent{' '}
            <b>{result.gain}</b> fragments {tierName(result.palier)}.
            {result.mult < 1 && ' TAC-001 a des ratés… retente ta chance !'}
          </p>
        )}
        <p className="text-center text-sm">
          Tes fragments :{' '}
          <b>
            <Fragments n={w.fragments} />
          </b>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {w.paliers.map((t) => (
            <TierTile
              key={t.cle}
              tier={t}
              chosen={t.cle === tierKey}
              onPick={() => !busy && setTierKey(t.cle)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="tac-stake" className="text-sm">
            Mise
          </label>
          <Input
            id="tac-stake"
            type="number"
            inputMode="numeric"
            min={w.mise_min}
            max={w.fragments}
            value={stakeText}
            disabled={busy}
            onChange={(e) => setStakeText(e.target.value)}
            className="w-28"
          />
          {quick.map((n) => (
            <Button
              key={n}
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setStakeText(String(n))}
            >
              {n}
            </Button>
          ))}
          {w.fragments >= w.mise_min && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setStakeText(String(w.fragments))}
            >
              Tout
            </Button>
          )}
        </div>
        {tier && stakeOk && (
          <p className="text-center text-xs text-muted-foreground tabular-nums">
            Les trois rouleaux se multiplient : à ×1, {conversion(stake, 1, tier.taux)} fragments{' '}
            {tier.nom} ; de {conversion(stake, (extremes[0] ?? 1) ** 3, tier.taux)} (trois{' '}
            {SYMBOLS[0]}) à {conversion(stake, (extremes[1] ?? 1) ** 3, tier.taux)} (trois{' '}
            {SYMBOLS[cases - 1] ?? '7'}, le jackpot).
          </p>
        )}
        <HoldButton disabled={busy || !stakeOk} onConfirm={pull}>
          {busy
            ? 'Les rouleaux tournent…'
            : stakeOk
              ? `Maintiens pour tirer le levier (${stake} fragments, ${tier?.nom ?? ''})`
              : w.fragments < w.mise_min
                ? `Il te faut au moins ${w.mise_min} fragments : recycle des cartes`
                : `Mise entre ${w.mise_min} et ${w.fragments} fragments`}
        </HoldButton>
        {spin.error && (
          <p role="alert" className="text-sm text-destructive">
            {workshopError(spin.error)}
          </p>
        )}
        <WheelOdds w={w} />
        {w.derniers.length > 0 && (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <b>Tes derniers tours</b>
            {w.derniers.map((d) => (
              <span key={d.le} className="tabular-nums">
                {d.mise} fragments · {multLabel(d.mult)} · +{d.gain} {tierName(d.palier)}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// The chances of each reel's cases, said plainly.
function WheelOdds({ w }: { w: Workshop }) {
  const total = w.roue.reduce((s, c) => s + c.poids, 0) || 1;
  return (
    <p className="text-center text-xs text-muted-foreground">
      Sur chaque rouleau :{' '}
      {w.roue
        .map(
          (c, i) =>
            `${SYMBOLS[i] ?? ''} ${multLabel(c.mult)} : ${Math.round((c.poids / total) * 100)} %`,
        )
        .join(' · ')}
    </p>
  );
}

// Part 2, to come: the forge.
function Forge() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ICONS.forge className="size-4" /> La forge
          <Badge variant="secondary" className="ml-auto">
            Bientôt
          </Badge>
        </CardTitle>
        <CardDescription>
          La première Forgeronne rallume ses braises… Bientôt, tes fragments de rareté lui serviront
          à te forger des cartes, des dos de cartes et d'autres trésors.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
