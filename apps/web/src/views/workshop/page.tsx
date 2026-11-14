// L'atelier. Part 1: TAC-001, the slot machine of the Mécanique et Technologie collection, turns the
// fragments of recycling into rarity fragments. The player picks a tier (Épique, Légendaire, GGEZ,
// each with its rate), stakes what they want (at least the minimum) and pulls the lever: the three
// reels on TAC-001's belly spin and stop, one after the other, each on its own case (a skull ×0,5,
// cherries ×1,2, a bell ×2, 7 ×3), and the pull is worth their product (three 7: ×27, the jackpot).
// The draw is the database's (atelier_tac): the reels only show it. Part 2, the forge: forge.tsx.

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
import { Forge } from './forge';
import { TONES } from '@/lib/tones';

// The machine's own colours: an illustration (iron, bronze, fire), not meanings.
const TAC = {
  night: '#1a0806',
  ember: '#6e1408',
  fire: '#ff6a1a',
  flare: '#ffc04a',
  white: '#fff4dc',
  iron: '#1f1714',
  bronze: '#8a5a24',
  bronzeLight: '#c8954a',
  chain: '#2c2420',
  glass: '#120a07',
  red: '#d4141e',
  redDark: '#5a0508',
};

// The reels' symbols, by case of the wheel (a loss, a little gain, double, the jackpot).
const SYMBOLS = ['\u{1F480}', '\u{1F352}', '\u{1F514}', '7'];
// Where the reels sit on TAC-001's drum: its three windows in the drawing (viewBox 400 × 320).
const REELS_AT = {
  '--reels-x': `${(151 / 400) * 100}%`,
  '--reels-y': `${(185 / 320) * 100}%`,
  '--reels-w': `${(150.6 / 400) * 100}%`,
  '--reels-h': `${(88 / 320) * 100}%`,
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
        tire le levier… et croise les doigts. Puis la première Forgeronne te forge les cartes de ton
        choix.
      </p>
      <Tac w={state.data} />
      <Forge />
    </div>
  );
}

// One reel: a strip of the cases' symbols, standing on cell `at` (moving there in `ms`, or at once).
function Reel({ cases, at, ms }: { cases: number; at: number; ms: number }) {
  return (
    <div className="relative h-full flex-1 overflow-hidden rounded-md bg-tac-glass text-tac-flare">
      <div
        className="flex h-full translate-y-(--y) flex-col transition-transform duration-(--ms) ease-wheel"
        style={{ '--y': `${-at * 100}%`, '--ms': `${ms}ms` }}
      >
        {Array.from({ length: STRIP }, (_, i) => (
          <div key={i} className="flex h-full shrink-0 items-center justify-center">
            <span
              className={`text-3xl leading-none font-black ${i % cases === cases - 1 ? 'text-tac-red' : ''}`}
            >
              {SYMBOLS[i % cases] ?? '?'}
            </span>
          </div>
        ))}
      </div>
      {/* The glass over the reel. */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-tac-night via-transparent to-tac-night opacity-60" />
    </div>
  );
}

// TAC-001, drawn after its card: a war slot machine. A great iron drum, ringed with bronze bands
// and glowing seams, carries the three reels on its front; a segmented cannon rises from its back and
// arcs over it, its spiked muzzle spitting fire; a lever with a red ball stands at its left end;
// chains hang between them, on a background of embers. While it works: it shakes, the seams and the
// muzzle blaze, sparks fly; the lever comes down when pulled; the jackpot makes it all flash.
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
  const glow = lit ? 'animate-pulse' : '';
  // The muzzle's spikes.
  const spikes = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    const at = (r: number, da = 0) =>
      `${(322 + Math.cos(a + da) * r).toFixed(1)},${(96 + Math.sin(a + da) * r).toFixed(1)}`;
    return `M${at(34, -0.16)}L${at(46)}L${at(34, 0.16)}Z`;
  });
  return (
    <div
      className={`relative mx-auto w-full max-w-md ${working ? 'animate-tac-shake' : ''} ${
        jackpot ? 'animate-jackpot' : ''
      }`}
    >
      <svg
        viewBox="0 0 400 320"
        className="w-full rounded-2xl"
        role="img"
        aria-label={w.tac?.nom ?? 'TAC-001'}
      >
        <defs>
          <radialGradient id="tac-sky" cx="85%" cy="25%" r="90%">
            <stop offset="0%" stopColor={TAC.flare} />
            <stop offset="25%" stopColor={TAC.fire} />
            <stop offset="55%" stopColor={TAC.ember} />
            <stop offset="100%" stopColor={TAC.night} />
          </radialGradient>
          <linearGradient id="tac-drum" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TAC.iron} />
            <stop offset="35%" stopColor={TAC.bronze} />
            <stop offset="55%" stopColor={TAC.bronzeLight} />
            <stop offset="100%" stopColor={TAC.iron} />
          </linearGradient>
          <linearGradient id="tac-pipe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TAC.bronzeLight} />
            <stop offset="50%" stopColor={TAC.bronze} />
            <stop offset="100%" stopColor={TAC.iron} />
          </linearGradient>
          <radialGradient id="tac-blast" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={TAC.white} />
            <stop offset="35%" stopColor={TAC.flare} />
            <stop offset="75%" stopColor={TAC.fire} />
            <stop offset="100%" stopColor={TAC.ember} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="tac-ball" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor={TAC.white} />
            <stop offset="18%" stopColor={TAC.red} />
            <stop offset="100%" stopColor={TAC.redDark} />
          </radialGradient>
        </defs>
        {/* The sky of embers. */}
        <rect width="400" height="320" fill="url(#tac-sky)" />
        {/* The cannon: from the drum's back, up and over, to its spiked muzzle. */}
        <path
          id="tac-cannon"
          d="M118 200 C 92 150, 104 92, 160 78 S 270 70, 300 92"
          stroke={TAC.iron}
          strokeWidth="46"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M118 200 C 92 150, 104 92, 160 78 S 270 70, 300 92"
          stroke="url(#tac-pipe)"
          strokeWidth="38"
          fill="none"
          strokeLinecap="round"
        />
        {/* Its rings, and the fire glowing between them. */}
        <path
          d="M118 200 C 92 150, 104 92, 160 78 S 270 70, 300 92"
          stroke={TAC.iron}
          strokeWidth="42"
          strokeDasharray="5 15"
          fill="none"
        />
        <path
          d="M118 200 C 92 150, 104 92, 160 78 S 270 70, 300 92"
          stroke={TAC.fire}
          strokeWidth="14"
          strokeDasharray="8 12"
          strokeDashoffset="-6"
          fill="none"
          className={glow}
        />
        {/* The muzzle and its blast. */}
        <circle
          cx="322"
          cy="96"
          r={lit ? 70 : 52}
          fill="url(#tac-blast)"
          className={`transition-all duration-500 ${glow}`}
        />
        {spikes.map((d) => (
          <path key={d} d={d} fill={TAC.bronze} stroke={TAC.iron} strokeWidth="1.5" />
        ))}
        <circle cx="322" cy="96" r="34" fill="none" stroke={TAC.bronze} strokeWidth="9" />
        <circle
          cx="322"
          cy="96"
          r="34"
          fill="none"
          stroke={TAC.iron}
          strokeWidth="2"
          strokeDasharray="3 6"
        />
        {/* Chains, from the cannon to the drum. */}
        <g stroke={TAC.chain} strokeWidth="3" strokeDasharray="4 3" fill="none" opacity="0.9">
          <path d="M175 96 Q 190 140 205 170" />
          <path d="M235 88 Q 255 130 262 170" />
          <path d="M140 120 Q 128 165 118 205" />
        </g>
        {/* The drum: its body, the bands at its left end, its right cap. */}
        <rect
          x="88"
          y="168"
          width="258"
          height="122"
          rx="56"
          fill="url(#tac-drum)"
          stroke={TAC.iron}
          strokeWidth="4"
        />
        {[96, 112, 128].map((x, i) => (
          <ellipse
            key={x}
            cx={x}
            cy="229"
            rx={14 - i * 2}
            ry={58 - i * 5}
            fill="none"
            stroke={i === 1 ? TAC.fire : TAC.bronzeLight}
            strokeWidth={i === 1 ? 2.5 : 5}
            className={i === 1 ? glow : ''}
          />
        ))}
        <ellipse
          cx="338"
          cy="229"
          rx="12"
          ry="50"
          fill={TAC.iron}
          stroke={TAC.bronze}
          strokeWidth="4"
        />
        {/* The red lights on top of the drum. */}
        {[196, 252].map((x) => (
          <rect
            key={x}
            x={x - 13}
            y="160"
            width="26"
            height="12"
            rx="2"
            fill={TAC.red}
            stroke={TAC.iron}
            strokeWidth="2"
            className={glow}
          />
        ))}
        {/* The reels' frame: three windows, their seams glowing. */}
        <rect
          x="146"
          y="180"
          width="160"
          height="98"
          rx="10"
          fill={TAC.iron}
          stroke={TAC.bronzeLight}
          strokeWidth="3"
        />
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={151 + i * 51.3}
            y="185"
            width="48"
            height="88"
            rx="7"
            fill={TAC.glass}
            stroke={TAC.fire}
            strokeWidth="2"
            className={glow}
          />
        ))}
        {/* The name plate, under the reels. */}
        <rect
          x="186"
          y="282"
          width="80"
          height="18"
          rx="3"
          fill={TAC.iron}
          stroke={TAC.bronze}
          strokeWidth="2"
        />
        <text
          x="226"
          y="295"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          letterSpacing="2"
          fill={TAC.flare}
        >
          {w.tac?.nom ?? 'TAC-001'}
        </text>
        {/* The lever at the left end: it comes down when pulled. */}
        <rect
          x="70"
          y="214"
          width="28"
          height="30"
          rx="6"
          fill={TAC.iron}
          stroke={TAC.bronze}
          strokeWidth="2"
        />
        <g
          className={`origin-bottom transition-transform duration-300 transform-fill ${
            pulled ? '-rotate-75' : 'rotate-0'
          }`}
        >
          <rect
            x="79"
            y="118"
            width="10"
            height="108"
            rx="5"
            fill={TAC.bronze}
            stroke={TAC.iron}
            strokeWidth="2"
          />
          <circle
            cx="84"
            cy="114"
            r="17"
            fill="url(#tac-ball)"
            stroke={TAC.redDark}
            strokeWidth="1.5"
          />
        </g>
      </svg>
      {/* The reels, in the drum's windows. */}
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
      {/* Sparks from the muzzle. */}
      <div className="absolute top-1/4 right-1/6" aria-hidden>
        {[0, 500, 1000, 1500].map((d) => (
          <svg
            key={d}
            viewBox="0 0 20 20"
            className="absolute size-3 animate-steam opacity-0"
            style={{ '--delay': `${lit ? d / 3 : d}ms` }}
          >
            <circle cx="10" cy="10" r="8" fill={TAC.flare} />
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
