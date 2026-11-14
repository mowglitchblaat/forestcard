// L'atelier. Part 1: TAC-001, the machine of the Mécanique et Technologie collection, turns the
// fragments of recycling into rarity fragments: the player picks a tier (Épique, Légendaire, GGEZ),
// holds to stake its fragments, and TAC-001 spins its wheel (×0,5, ×1,2, ×2, ×3 the jackpot, each case
// as wide as its chance). The draw is the database's (atelier_tac): the wheel only shows it, slowing
// down onto the case drawn. Part 2, the forge, comes later: a card says so.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { Fragments } from '@/components/money';
import { PageSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { playerKeys } from '@/data/player';
import {
  fetchWorkshop,
  landingRotation,
  multLabel,
  type Spin,
  spinTac,
  type Tier,
  wheelArcs,
  type Workshop,
  workshopError,
  workshopKeys,
} from '@/data/workshop';
import { ICONS } from '@/lib/icons';
import { useSession } from '@/lib/session';
import { TONES } from '@/lib/tones';

// The machine's own colours: an illustration (iron, brass, the wheel's ink), not meanings.
const IRON = {
  rim: '#34383d',
  rimEdge: '#1d2024',
  bolt: '#c9a227',
  hub: '#5b6168',
  ink: '#1c1a17',
  gear: '#7b828a',
  gearDark: '#4d5359',
  steam: '#e6e8ea',
  lamp: '#ffcf4d',
};

// The wheel's cases, by order (a loss, a little gain, double, the jackpot).
const CASE_TONES = [
  TONES.danger.colour,
  TONES.info.colour,
  TONES.success.colour,
  TONES.gold.colour,
];
const SPIN_MS = 4800;

export function WorkshopPage() {
  const state = useQuery({ queryKey: workshopKeys.state, queryFn: fetchWorkshop });
  if (state.error)
    return <p role="alert">L'atelier est fermé pour le moment : {state.error.message}</p>;
  if (!state.data) return <PageSkeleton />;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">
        Dans l'atelier, tes fragments deviennent des fragments de rareté. TAC-001 les avale, fait
        tourner sa roue… et te rend des fragments Épiques, Légendaires ou GGEZ. Bientôt, ils te
        serviront à forger des cartes.
      </p>
      <Tac w={state.data} />
      <Forge />
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
      [0, r * 0.82],
      [step * 0.18, r],
      [step * 0.5, r],
      [step * 0.68, r * 0.82],
    ] as const) {
      points.push(
        `${(cx + Math.cos(a + da) * rr).toFixed(1)},${(cy + Math.sin(a + da) * rr).toFixed(1)}`,
      );
    }
  }
  return `M${points.join('L')}Z`;
}

function Gear({ size, teeth, motion }: { size: number; teeth: number; motion: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`${motion} pointer-events-none`}
      width={size}
      height={size}
      aria-hidden
    >
      <path
        d={gearPath(50, 50, 48, teeth)}
        fill={IRON.gear}
        stroke={IRON.gearDark}
        strokeWidth="3"
      />
      <circle cx="50" cy="50" r="16" fill={IRON.gearDark} />
      <circle cx="50" cy="50" r="7" fill={IRON.bolt} />
    </svg>
  );
}

// The arc of a wheel case, as a pie slice (angles clockwise from the top, in degrees).
function slice(start: number, end: number, r: number): string {
  const at = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${(100 + Math.cos(rad) * r).toFixed(2)} ${(100 + Math.sin(rad) * r).toFixed(2)}`;
  };
  const large = end - start > 180 ? 1 : 0;
  return `M100 100 L${at(start)} A${r} ${r} 0 ${large} 1 ${at(end)} Z`;
}

function Wheel({ w, rotation, jackpot }: { w: Workshop; rotation: number; jackpot: boolean }) {
  const arcs = wheelArcs(w.roue);
  return (
    <div className={`relative mx-auto aspect-square w-64 ${jackpot ? 'animate-jackpot' : ''}`}>
      {/* The pointer, a brass claw at the top. */}
      <svg
        viewBox="0 0 40 40"
        className="absolute top-0 left-1/2 z-10 size-10 -translate-x-1/2 -translate-y-1/3"
        aria-hidden
      >
        <path d="M8 4 L32 4 L20 30 Z" fill={IRON.bolt} stroke={IRON.rimEdge} strokeWidth="2" />
        <circle cx="20" cy="9" r="3" fill={IRON.rimEdge} />
      </svg>
      <div
        className="size-full rotate-(--spin) transition-transform duration-(--spin-ms) ease-wheel"
        style={{ '--spin': `${rotation}deg`, '--spin-ms': `${SPIN_MS}ms` }}
      >
        <svg viewBox="0 0 200 200" className="size-full" role="img" aria-label="La roue de TAC-001">
          <circle cx="100" cy="100" r="98" fill={IRON.rimEdge} />
          <circle cx="100" cy="100" r="93" fill={IRON.rim} />
          {w.roue.map((c, i) => {
            const arc = arcs[i] ?? { start: 0, end: 0 };
            if (arc.end - arc.start <= 0) return null;
            const mid = ((arc.start + arc.end) / 2 - 90) * (Math.PI / 180);
            const small = arc.end - arc.start < 30;
            return (
              <g key={i}>
                <path
                  d={slice(arc.start, arc.end, 84)}
                  fill={CASE_TONES[i % CASE_TONES.length]}
                  stroke={IRON.rimEdge}
                  strokeWidth="1.5"
                />
                <text
                  x={100 + Math.cos(mid) * (small ? 70 : 58)}
                  y={100 + Math.sin(mid) * (small ? 70 : 58)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={small ? 10 : 15}
                  fontWeight="800"
                  fill={IRON.ink}
                  transform={`rotate(${(arc.start + arc.end) / 2} ${100 + Math.cos(mid) * (small ? 70 : 58)} ${100 + Math.sin(mid) * (small ? 70 : 58)})`}
                >
                  {multLabel(c.mult)}
                </text>
              </g>
            );
          })}
          {/* The bolts around the rim. */}
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            return (
              <circle
                key={i}
                cx={100 + Math.cos(a) * 89}
                cy={100 + Math.sin(a) * 89}
                r="2.2"
                fill={IRON.bolt}
              />
            );
          })}
          <path
            d={gearPath(100, 100, 20, 10)}
            fill={IRON.hub}
            stroke={IRON.rimEdge}
            strokeWidth="1.5"
          />
          <circle cx="100" cy="100" r="7" fill={IRON.bolt} />
        </svg>
      </div>
    </div>
  );
}

// TAC-001 at work: its portrait in a porthole, gears turning around it (fast while it works), steam
// from its chimney, lamps that blink while the wheel spins.
function Machine({ w, working }: { w: Workshop; working: boolean }) {
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const src = mirror.data ? imageUrl(w.tac?.image ?? null, mirror.data) : null;
  return (
    <div className={`relative mx-auto w-56 ${working ? 'animate-tac-shake' : ''}`}>
      <div className="absolute -top-4 -left-6 z-10">
        <Gear size={64} teeth={12} motion={working ? 'animate-gear-fast' : 'animate-gear'} />
      </div>
      <div className="absolute -right-5 -bottom-3 z-10">
        <Gear size={48} teeth={9} motion={working ? 'animate-gear-fast' : 'animate-gear-back'} />
      </div>
      {/* Steam from the chimney. */}
      <div className="absolute -top-2 right-6 z-10" aria-hidden>
        {[0, 700, 1400].map((d) => (
          <svg
            key={d}
            viewBox="0 0 20 20"
            className="absolute size-6 animate-steam opacity-0"
            style={{ '--delay': `${working ? d / 3 : d}ms` }}
          >
            <circle cx="10" cy="10" r="8" fill={IRON.steam} />
          </svg>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border-4 border-border bg-muted shadow-lg">
        {src ? (
          <img src={src} alt={w.tac?.nom ?? 'TAC-001'} className="aspect-5/7 w-full object-cover" />
        ) : (
          <div className="aspect-5/7 w-full" />
        )}
      </div>
      {/* Lamps under the porthole. */}
      <svg viewBox="0 0 120 16" className="mx-auto mt-2 w-32" aria-hidden>
        {[15, 45, 75, 105].map((x, i) => (
          <circle
            key={x}
            cx={x}
            cy="8"
            r="6"
            fill={working || i === 0 ? IRON.lamp : IRON.gearDark}
            className={working ? 'animate-pulse' : ''}
          />
        ))}
      </svg>
    </div>
  );
}

function TierTile({
  tier,
  chosen,
  affordable,
  onPick,
}: {
  tier: Tier;
  chosen: boolean;
  affordable: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={chosen}
      className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-3 text-center transition hover:-translate-y-0.5 ${
        chosen ? 'border-primary bg-primary/10' : ''
      } ${affordable ? '' : 'opacity-60'}`}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <span
          className="size-3 rounded-full bg-(--rarity) ring-1 ring-border"
          style={{ '--rarity': tier.couleur ?? 'var(--muted-foreground)' }}
        />
        {tier.nom}
      </span>
      <small className="text-muted-foreground">
        Mise <Fragments n={tier.mise} />
      </small>
      <small className="tabular-nums">Tu en as {tier.solde}</small>
    </button>
  );
}

function Tac({ w }: { w: Workshop }) {
  const client = useQueryClient();
  const userId = useSession()?.user.id ?? '';
  const [tier, setTier] = useState<Tier['cle']>('epique');
  const [rotation, setRotation] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle');
  const [result, setResult] = useState<Spin | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const spin = useMutation({ mutationFn: spinTac });
  const chosen = w.paliers.find((t) => t.cle === tier) ?? w.paliers[0];
  const affordable = !!chosen && w.fragments >= chosen.mise;
  const busy = phase === 'spinning' || spin.isPending;
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: workshopKeys.state }),
      client.invalidateQueries({ queryKey: playerKeys.player(userId) }),
    ]);

  const launch = () => {
    if (!chosen) return;
    setResult(null);
    setPhase('spinning');
    spin.mutate(chosen.cle, {
      onSuccess: (r) => {
        setRotation((from) => landingRotation(wheelArcs(w.roue), r.case, from, Math.random()));
        timer.current = setTimeout(() => {
          setResult(r);
          setPhase('done');
          void refresh();
        }, SPIN_MS + 150);
      },
      onError: () => setPhase('idle'),
    });
  };

  const tierName = (cle: string) => w.paliers.find((t) => t.cle === cle)?.nom ?? cle;
  const jackpot = phase === 'done' && !!result && result.case === w.roue.length - 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ICONS.workshop className="size-4" /> TAC-001, le convertisseur
          <Badge variant="outline" className="ml-auto">
            Mécanique et Technologie
          </Badge>
        </CardTitle>
        <CardDescription>
          Choisis un palier et mise tes fragments : TAC-001 te rend {w.gain_base} fragments de ce
          palier, multipliés par la case de sa roue.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <Machine w={w} working={busy} />
          <Wheel w={w} rotation={rotation} jackpot={jackpot} />
        </div>
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
              chosen={t.cle === tier}
              affordable={w.fragments >= t.mise}
              onPick={() => !busy && setTier(t.cle)}
            />
          ))}
        </div>
        <HoldButton disabled={busy || !affordable} onConfirm={launch}>
          {busy
            ? 'TAC-001 calcule…'
            : affordable
              ? `Maintiens pour nourrir TAC-001 (${chosen?.mise ?? 0} fragments, palier ${chosen?.nom ?? ''})`
              : `Il te faut ${chosen?.mise ?? 0} fragments pour ce palier`}
        </HoldButton>
        {spin.error && (
          <p role="alert" className="text-sm text-destructive">
            {workshopError(spin.error)}
          </p>
        )}
        {phase === 'done' && result && (
          <p
            className={`rounded-lg border p-3 text-center text-sm ${
              result.mult >= 1 ? TONES.success.box : 'bg-muted/40'
            }`}
          >
            {jackpot && <b className={`block text-lg ${TONES.gold.text}`}>JACKPOT !</b>}
            <b>{multLabel(result.mult)}</b> : TAC-001 te rend <b>{result.gain}</b> fragments{' '}
            {tierName(result.palier)}.
            {result.mult < 1 && ' La machine a des ratés… retente ta chance !'}
          </p>
        )}
        <WheelOdds w={w} />
        {w.derniers.length > 0 && (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <b>Tes derniers tours</b>
            {w.derniers.map((d) => (
              <span key={d.le} className="tabular-nums">
                {tierName(d.palier)} · {multLabel(d.mult)} · +{d.gain} fragments
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// The wheel's chances, said plainly.
function WheelOdds({ w }: { w: Workshop }) {
  const total = w.roue.reduce((s, c) => s + c.poids, 0) || 1;
  return (
    <p className="text-center text-xs text-muted-foreground">
      {w.roue
        .map((c) => `${multLabel(c.mult)} : ${Math.round((c.poids / total) * 100)} %`)
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
