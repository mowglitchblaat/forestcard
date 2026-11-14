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
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
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
};

// The reels' symbols, by case of the wheel (a loss, a little gain, double, the jackpot).
const SYMBOLS = ['\u{1F480}', '\u{1F352}', '\u{1F514}', '7'];
// Where the reels sit on TAC-001's illustration (its belly), as shares of the picture shown.
const REELS_AT = { '--reels-x': '27%', '--reels-y': '50%', '--reels-w': '44%', '--reels-h': '34%' };
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

// TAC-001: its illustration, cropped on the machine, with the three reels over its belly; bulbs
// around it that blink while it works; it shakes while the reels spin, flashes on the jackpot.
function Machine({
  w,
  reels,
  moving,
  working,
  jackpot,
}: {
  w: Workshop;
  reels: number[];
  moving: boolean;
  working: boolean;
  jackpot: boolean;
}) {
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const src = mirror.data ? imageUrl(w.tac?.image ?? null, mirror.data) : null;
  const bulbs = Array.from({ length: 14 }, (_, i) => i);
  const lit = working || jackpot;
  return (
    <div
      className={`relative mx-auto w-full max-w-md ${working ? 'animate-tac-shake' : ''} ${
        jackpot ? 'animate-jackpot' : ''
      }`}
    >
      <div className="relative aspect-4/3 overflow-hidden rounded-2xl border-4 border-border bg-muted shadow-lg">
        {src && (
          <img
            src={src}
            alt={w.tac?.nom ?? 'TAC-001'}
            className="absolute inset-x-0 top-0 w-full"
          />
        )}
        <div
          className="absolute top-(--reels-y) left-(--reels-x) flex h-(--reels-h) w-(--reels-w) gap-1 rounded-lg p-1 ring-2 ring-border"
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
      </div>
      {/* The bulbs, top and bottom: they blink while TAC-001 works. */}
      {(['top', 'bottom'] as const).map((side) => (
        <svg
          key={side}
          viewBox="0 0 280 12"
          className={`absolute inset-x-2 ${side === 'top' ? '-top-2' : '-bottom-2'}`}
          aria-hidden
        >
          <rect x="0" y="2" width="280" height="8" rx="4" fill={BRASS.frame} />
          {bulbs.map((i) => (
            <circle
              key={i}
              cx={10 + i * 20}
              cy="6"
              r="3.2"
              fill={lit || i % 3 === 0 ? BRASS.bulb : BRASS.bulbOff}
              className={lit && i % 2 === 0 ? 'animate-pulse' : ''}
            />
          ))}
        </svg>
      ))}
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
        <Machine w={w} reels={reels} moving={moving} working={busy} jackpot={jackpot} />
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
