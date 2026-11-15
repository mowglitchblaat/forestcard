// L'atelier. Part 1: TAC-002, the slot machine of the Mécanique et Technologie collection, turns the
// fragments of recycling into rarity fragments. The player picks a tier (Épique, Légendaire, GGEZ,
// each with its rate), stakes what they want (at least the minimum) and pulls the lever: the three
// reels on TAC-002's belly spin and stop, one after the other, each on its own case (a skull ×0,5,
// cherries ×1,2, a bell ×2, 7 ×3), and the pull is worth their product (three 7: ×27, the jackpot).
// The draw is the database's (atelier_tac): the reels only show it. Part 2, the forge: forge.tsx.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { FragmentGem } from '@/components/fragment-gem';
import { Fragments, TierFragments } from '@/components/money';
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
import leverBase from './art/lever-base.webp';
import leverBall from './art/lever-ball.webp';
import leverRod from './art/lever-rod.webp';
import symbol7 from './art/symbol-7.webp';
import symbolBell from './art/symbol-bell.webp';
import symbolCherries from './art/symbol-cherries.webp';
import symbolSkull from './art/symbol-skull.webp';
import tacArt from './art/tac-002.webp';
import { TacFire, FIRE_BOX } from './tac-fire';
import { Forge } from './forge';
import { TONES } from '@/lib/tones';

// The reels' symbols, by case of the wheel (a loss, a little gain, double, the jackpot): their
// picture (in TAC-002's style) and their sign in the texts.
const SYMBOLS = ['\u{1F480}', '\u{1F352}', '\u{1F514}', '7'];
const SYMBOL_ART: (string | null)[] = [symbolSkull, symbolCherries, symbolBell, symbol7];
// Where things sit on TAC-002's portrait (1402 × 1122): the window of its drum (three slots, 17 px
// apart), the lever on its left, its cannon's muzzle; shares of the picture.
const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(2)}%`;
const ART_W = 1402;
const ART_H = 1122;
const ART_AT = {
  // the fire's canvas (tac-fire.tsx): around the portrait, with room for the jet and its smoke
  '--fire-x': pct(FIRE_BOX.x, ART_W),
  '--fire-y': pct(FIRE_BOX.y, ART_H),
  '--fire-w': pct(FIRE_BOX.w, ART_W),
  '--fire-h': pct(FIRE_BOX.h, ART_H),
  '--reels-x': pct(395, ART_W),
  '--reels-y': pct(472, ART_H),
  '--reels-w': pct(622, ART_W),
  '--reels-h': pct(206, ART_H),
  '--reels-gap': pct(17, 622),
  // The lever, standing on the drum's left: 240 × 725 in all; its ball (240 × 136) on its rod (240 ×
  // 502, from 129 px down), which ends on the pivot, 61 px down its base (240 × 155), whose hub
  // covers the rod's end.
  '--lever-x': pct(6, ART_W),
  '--lever-y': pct(150, ART_H),
  '--lever-h': pct(570, ART_H),
  '--ball-h': pct(136, 725),
  '--rod-y': pct(129, 725),
  '--rod-h': pct(502, 725),
  '--base-y': pct(631 - 61, 725),
  // The cannon's mouth (1160 × 150): the embers fly from there (the fire itself: tac-fire.tsx).
  '--muzzle-x': pct(1160, ART_W),
  '--muzzle-y': pct(150, ART_H),
};
// Each reel stops a little after the previous one, after more turns.
const REEL_STOPS = [
  { ms: 1700, turns: 6 },
  { ms: 2400, turns: 8 },
  { ms: 3100, turns: 10 },
];
// The embers the jet throws ahead: how far (px, right and up or down), and after how long (ms).
const EMBERS: readonly (readonly [number, number, number])[] = [
  [140, -30, 0],
  [180, 10, 120],
  [120, 25, 260],
  [200, -12, 380],
  [160, -40, 520],
  [210, 30, 640],
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

// One reel: a strip of the cases' symbols, standing on cell `at` (moving there in `ms`, or at once),
// blurred by its speed while it spins.
function Reel({
  cases,
  at,
  ms,
  spinning,
}: {
  cases: number;
  at: number;
  ms: number;
  spinning: boolean;
}) {
  return (
    <div className="relative h-full flex-1 overflow-hidden rounded-md bg-tac-glass text-tac-flare">
      <div
        className={`flex h-full translate-y-(--y) flex-col transition-transform duration-(--ms) ease-wheel ${
          spinning ? 'blur-xs' : ''
        }`}
        style={{ '--y': `${-at * 100}%`, '--ms': `${ms}ms` }}
      >
        {Array.from({ length: STRIP }, (_, i) => {
          const art = SYMBOL_ART[i % cases];
          return (
            <div key={i} className="flex h-full shrink-0 items-center justify-center p-1">
              {art ? (
                <img src={art} alt="" className="size-full object-contain drop-shadow-lg" />
              ) : (
                <span className="text-4xl leading-none">{SYMBOLS[i % cases] ?? '?'}</span>
              )}
            </div>
          );
        })}
      </div>
      {/* The glass over the reel. */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-tac-night via-transparent to-tac-night opacity-60" />
    </div>
  );
}

// TAC-002: its war-machine portrait (art/tac-002.webp), the three reels set in the window of its
// drum, its lever on the left. Pulled, the lever comes towards you and springs back; while the reels spin,
// the machine shakes, the window's frame blazes and its cannon roars flames; the jackpot makes it
// all flash.
function Machine({
  w,
  reels,
  moving,
  stopped,
  pulls,
  working,
  jackpot,
  gain,
}: {
  w: Workshop;
  reels: number[];
  moving: boolean;
  stopped: boolean[];
  pulls: number;
  working: boolean;
  jackpot: boolean;
  // what the last pull brought: shown over the reels once they stop
  gain: { tier: Tier['cle']; n: number; at: number } | null;
}) {
  const lit = working || jackpot;
  return (
    <div
      className={`relative mx-auto w-full max-w-lg ${working ? 'animate-tac-shake' : ''} ${
        jackpot ? 'animate-jackpot' : ''
      }`}
      style={ART_AT}
    >
      <div className="relative overflow-hidden rounded-2xl">
        <img src={tacArt} alt="TAC-002" className="block w-full" />
        {/* The reels, in the drum's window, its frame glowing while it works. */}
        <div
          className={`absolute top-(--reels-y) left-(--reels-x) z-10 flex h-(--reels-h) w-(--reels-w) gap-(--reels-gap) rounded-sm ${
            lit ? 'animate-pulse ring-2 ring-forge-heat' : ''
          }`}
        >
          {reels.map((at, i) => (
            <Reel
              key={i}
              cases={w.roue.length || 4}
              at={at}
              ms={moving ? (REEL_STOPS[i]?.ms ?? 0) : 0}
              spinning={moving && !stopped[i]}
            />
          ))}
        </div>
        {/* The lever on the drum's left. Pulled, it comes towards you: its rod shortens into its base
            while the ball comes down and grows, then it springs back. */}
        <div
          key={pulls}
          className="absolute top-(--lever-y) left-(--lever-x) z-10 aspect-240/725 h-(--lever-h)"
        >
          <img
            src={leverRod}
            alt=""
            className={`absolute inset-x-0 top-(--rod-y) h-(--rod-h) w-full origin-bottom ${
              pulls ? 'animate-lever-rod' : ''
            }`}
          />
          <img src={leverBase} alt="" className="absolute inset-x-0 top-(--base-y) w-full" />
          <img
            src={leverBall}
            alt=""
            className={`absolute inset-x-0 top-0 h-(--ball-h) w-full ${
              pulls ? 'animate-lever-ball' : ''
            }`}
          />
        </div>
      </div>
      {/* The fire (tac-fire.tsx): the portrait redrawn under the heat, the jet, then the smoke. Under
          the reels and the lever. */}
      <TacFire
        burning={lit}
        className="pointer-events-none absolute top-(--fire-y) left-(--fire-x) z-0 h-(--fire-h) w-(--fire-w)"
      />
      {/* What the pull brought, over the reels: it pops, floats a moment, fades. */}
      {gain && (
        <div
          key={gain.at}
          className="pointer-events-none absolute top-(--reels-y) left-(--reels-x) z-20 flex h-(--reels-h) w-(--reels-w) items-center justify-center"
        >
          <span
            className={`animate-gain-pop rounded-full bg-background/85 px-5 py-2 text-3xl font-black tabular-nums shadow-lg ring-2 ${
              jackpot ? `ring-forge-spark ${TONES.gold.text}` : 'ring-forge-heat'
            }`}
          >
            <TierFragments tier={gain.tier} n={gain.n} sign />
          </span>
        </div>
      )}
      {/* Embers flying from the mouth while it works. */}
      {lit && (
        <>
          <div className="absolute top-(--muzzle-y) left-(--muzzle-x)" aria-hidden>
            {EMBERS.map(([dx, dy, delay]) => (
              <span
                key={delay}
                className="absolute size-1.5 animate-ember-fly rounded-full bg-forge-spark opacity-0"
                style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, '--delay': `${delay}ms` }}
              />
            ))}
          </div>
        </>
      )}
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
        <span className="text-xl">
          <FragmentGem kind={tier.cle} />
        </span>
        {tier.nom}
      </span>
      <small className="inline-flex items-center gap-1 text-muted-foreground">
        <Fragments n={tier.taux} /> → <TierFragments tier={tier.cle} n={1} />
      </small>
      <small className="tabular-nums">
        Tu en as <TierFragments tier={tier.cle} n={tier.solde} />
      </small>
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
  const [pulls, setPulls] = useState(0);
  const [stopped, setStopped] = useState([true, true, true]);
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
    setPulls((n) => n + 1);
    spin.mutate(
      { tier: tier.cle, stake },
      {
        onSuccess: (r) => {
          // Rewind the strips at once (each still shows the same symbol), then run them to the case.
          setMoving(false);
          setReels((now) => now.map((at) => at % cases));
          later(() => {
            setMoving(true);
            setStopped([false, false, false]);
            REEL_STOPS.forEach((stop, i) =>
              later(
                () => setStopped((now) => now.map((s, k) => (k === i ? true : s))),
                stop.ms - 350,
              ),
            );
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
        {/* Room on the sides for the cannon's jet, clipped at the card's edge. */}
        <div className="w-full overflow-x-clip">
          <Machine
            w={w}
            reels={reels}
            moving={moving}
            stopped={stopped}
            pulls={pulls}
            working={busy}
            jackpot={jackpot}
            gain={
              phase === 'done' && result ? { tier: result.palier, n: result.gain, at: pulls } : null
            }
          />
        </div>
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
