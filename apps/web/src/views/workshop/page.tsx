// L'atelier. Part 1: TAC-002, the slot machine of the Mécanique et Technologie collection, turns the
// fragments of recycling into rarity fragments. The player picks a tier (Épique, Légendaire, GGEZ,
// each with its rate), stakes what they want (at least the minimum) and pulls the lever: the three
// reels on TAC-002's belly spin and stop, one after the other, each on its own case (a skull ×0,5,
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
import tacArt from './art/tac-002.webp';
import { Forge } from './forge';
import { TONES } from '@/lib/tones';

// The reels' symbols, by case of the wheel (a loss, a little gain, double, the jackpot).
const SYMBOLS = ['\u{1F480}', '\u{1F352}', '\u{1F514}', '7'];
// Where things sit on TAC-002's portrait (746 × 597): the window of its drum (three slots, 10 px
// apart), the lever on its left, its cannon's muzzle; shares of the picture.
const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(2)}%`;
const ART_AT = {
  '--reels-x': pct(211, 746),
  '--reels-y': pct(251, 597),
  '--reels-w': pct(330, 746),
  '--reels-h': pct(109, 597),
  '--reels-gap': pct(10, 330),
  '--lever-x': pct(22, 746),
  '--lever-y': pct(110, 597),
  '--lever-h': pct(210, 597),
  '--fire-x': pct(560, 746),
  '--fire-y': pct(30, 597),
  '--fire-w': pct(180, 746),
  '--fire-cx': pct(690, 746),
  '--fire-cy': pct(110, 597),
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
        Dans l'atelier, tes fragments deviennent des fragments de rareté. Glisse-les dans TAC-002,
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

// TAC-002: its war-machine portrait (art/tac-002.webp), the three reels set in the window of its
// drum, its lever on the left. While it works: it shakes, the window's frame and the cannon's fire
// blaze, sparks fly from the muzzle; the lever comes down when pulled; the jackpot makes it flash.
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
  return (
    <div
      className={`relative mx-auto w-full max-w-lg ${working ? 'animate-tac-shake' : ''} ${
        jackpot ? 'animate-jackpot' : ''
      }`}
      style={ART_AT}
    >
      <img src={tacArt} alt="TAC-002" className="block w-full rounded-2xl" />
      {/* The cannon's fire, blazing while it works. */}
      <div
        className={`absolute top-(--fire-y) left-(--fire-x) aspect-square w-(--fire-w) rounded-full bg-forge-heat/60 blur-2xl transition-opacity duration-500 ${
          lit ? 'animate-pulse opacity-100' : 'opacity-0'
        }`}
      />
      {/* The reels, in the drum's window, its frame glowing while it works. */}
      <div
        className={`absolute top-(--reels-y) left-(--reels-x) flex h-(--reels-h) w-(--reels-w) gap-(--reels-gap) rounded-sm ${
          lit ? 'animate-pulse ring-2 ring-forge-heat' : ''
        }`}
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
      {/* The lever, on the drum's left: it comes down when pulled. */}
      <svg
        viewBox="0 0 40 120"
        className={`absolute top-(--lever-y) left-(--lever-x) aspect-1/3 h-(--lever-h) origin-bottom transition-transform duration-300 ${
          pulled ? '-rotate-75' : 'rotate-0'
        }`}
        aria-hidden
      >
        <rect x="16" y="22" width="8" height="92" rx="4" className="fill-forge-steel" />
        <rect x="8" y="106" width="24" height="14" rx="4" className="fill-forge-iron" />
        <circle cx="20" cy="18" r="15" className="fill-tac-red" />
        <circle cx="15" cy="12" r="5" className="fill-tac-flare opacity-60" />
      </svg>
      {/* Sparks from the muzzle. */}
      <div className="absolute top-(--fire-cy) left-(--fire-cx)" aria-hidden>
        {[0, 400, 800, 1200].map((d) => (
          <span
            key={d}
            className="absolute size-1.5 animate-steam rounded-full bg-tac-flare opacity-0"
            style={{ '--delay': `${lit ? d / 3 : d}ms` }}
          />
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
          <ICONS.workshop className="size-4" /> TAC-002, la machine à fragments
          <Badge variant="outline" className="ml-auto">
            Mécanique et Technologie
          </Badge>
        </CardTitle>
        <CardDescription>
          Mise tes fragments (au moins {w.mise_min}) et choisis ce que TAC-002 te rend : des
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
            {result.mult < 1 && ' TAC-002 a des ratés… retente ta chance !'}
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
