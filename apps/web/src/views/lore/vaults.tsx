// Lore > Événements: the vaults (data/vaults.ts, 97-coffres-forts.sql). Three vaults shared by the
// whole community, drilled with drills bought in gold. A drill placed comes in from the side, drills
// (its bit turns, sparks fly), and leaves a hole for good in the door. At its last drill a vault
// opens: its door shakes, its bolts pull back, it swings open onto a beam of light in its colour,
// and the new cards it held fly out and turn over. The animations live in index.css (vault-*).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import {
  buyDrills,
  drill,
  fetchHeist,
  type Heist,
  type Hole,
  markOpeningSeen,
  openingSeen,
  type Tint,
  type Vault,
  vaultKeys,
  VAULTS_REFRESH,
} from '@/data/vaults';
import { ICONS } from '@/lib/icons';
import { useSession } from '@/lib/session';
import { TONES } from '@/lib/tones';

// The doors' pictures (assets/cadres).
const DOOR: Record<Tint, string> = {
  bleu: 'cadres/coffre-bleu.webp',
  violet: 'cadres/coffre-violet.webp',
  or: 'cadres/coffre-or.webp',
};
// The colour of its light (--glow).
const GLOW: Record<Tint, string> = {
  bleu: 'vault-glow-bleu',
  violet: 'vault-glow-violet',
  or: 'vault-glow-or',
};
const LOOT: Record<Tint, string> = {
  bleu: 'Des cartes rares inédites',
  violet: 'Des cartes épiques inédites',
  or: 'Des cartes légendaires inédites',
};

const fr = (n: number) => n.toLocaleString('fr-FR');

function countdown(iso: string, now: number): string {
  const left = Math.max(0, new Date(iso).getTime() - now);
  const m = Math.floor(left / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d > 0 ? `${d} j ${h} h` : h > 0 ? `${h} h ${m % 60} min` : `${m % 60} min`;
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function VaultGame() {
  const heist = useQuery({
    queryKey: vaultKeys.state,
    queryFn: fetchHeist,
    refetchInterval: VAULTS_REFRESH,
  });
  const [opening, setOpening] = useState<Vault | null>(null);
  const data = heist.data;
  // A vault opened since this browser last looked: its opening plays once.
  useEffect(() => {
    if (opening || !data) return;
    const fresh = data.coffres.find((v) => v.ouvert_le && !openingSeen(v.id));
    if (fresh) setOpening(fresh);
  }, [data, opening]);
  if (!data) return null;
  return (
    <>
      <Heist heist={data} onOpened={setOpening} />
      {opening && (
        <Opening
          vault={data.coffres.find((v) => v.id === opening.id) ?? opening}
          onClose={() => {
            markOpeningSeen(opening.id);
            setOpening(null);
          }}
        />
      )}
    </>
  );
}

function Heist({ heist, onOpened }: { heist: Heist; onOpened: (v: Vault) => void }) {
  const signedIn = !!useSession();
  const client = useQueryClient();
  const now = useNow();
  const [count, setCount] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const buy = useMutation({
    mutationFn: (n: number) => buyDrills(n),
    onMutate: () => setError(null),
    onError: (e) => setError(e.message),
    onSettled: () => client.invalidateQueries({ queryKey: vaultKeys.state }),
  });
  const gold = heist.monnaie ?? 0;
  const open = !heist.termine;
  const buyable = (n: number) => open && signedIn && gold >= n * heist.prix && !buy.isPending;
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <ICONS.vault />
          {heist.titre}
          {open ? (
            <Badge variant="info">
              <ICONS.wait />
              Encore {countdown(heist.fin, now)}
            </Badge>
          ) : (
            <Badge variant="outline">Terminé</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Trois coffres-forts scellés renferment des cartes jamais vues. Achète des foreuses,
          pose-les sur le coffre de ton choix : chaque foreuse perce la porte pour de bon. Quand
          assez de trous sont faits, le coffre cède… et son trésor entre dans le jeu, pour tout le
          monde.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {signedIn && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <b className="flex items-center gap-1.5">
              <ICONS.shop />
              Boutique
            </b>
            <span className="text-sm text-muted-foreground">Foreuse : {fr(heist.prix)} gold</span>
            <span className={`flex items-center gap-1 text-sm font-medium ${TONES.gold.text}`}>
              <ICONS.gold />
              {fr(gold)}
            </span>
            <span className="flex items-center gap-1 text-sm font-medium">
              <ICONS.drill />
              {heist.stock} foreuse{heist.stock > 1 ? 's' : ''} en main
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {[1, 5, 10].map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant="outline"
                  disabled={!buyable(n)}
                  onClick={() => buy.mutate(n)}
                >
                  <ICONS.add />
                  {n}
                </Button>
              ))}
              <Input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="w-20"
              />
              <Button
                size="sm"
                disabled={!buyable(Math.max(1, Number(count) || 1))}
                onClick={() => buy.mutate(Math.min(100, Math.max(1, Number(count) || 1)))}
              >
                <ICONS.drill />
                Acheter
              </Button>
            </div>
          </div>
        )}
        {error && <small className="text-destructive">{error}</small>}
        <div className="vault-scene overflow-hidden rounded-xl">
          <img
            src="cadres/coffres-salle.webp"
            alt=""
            draggable={false}
            className="vault-scene-bg block w-full select-none"
          />
          <div className="grid grid-cols-3 gap-2 bg-muted/40 p-3 sm:gap-6">
            {heist.coffres.map((v, i) => (
              <VaultTile
                key={v.id}
                vault={v}
                slot={i}
                stock={heist.stock}
                canDrill={open && signedIn}
                onOpened={onOpened}
              />
            ))}
          </div>
        </div>
        {heist.perceurs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <b>Meilleurs perceurs :</b>
            {heist.perceurs.map((p, i) => (
              <Badge key={p.pseudo} variant={i === 0 ? 'warning' : 'outline'}>
                {i === 0 && <ICONS.drill />}
                {p.pseudo} · {p.foreuses}
              </Badge>
            ))}
            {(heist.mes_foreuses ?? 0) > 0 && (
              <span className="text-muted-foreground">
                · toi : {heist.mes_foreuses} foreuse{(heist.mes_foreuses ?? 0) > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
        {!signedIn && (
          <small className="text-muted-foreground">
            Connecte-toi pour acheter des foreuses et percer les coffres.
          </small>
        )}
      </CardContent>
    </Card>
  );
}

// A door with its holes; while drills come in, their holes stay hidden until the drill is done.
function Door({
  tint,
  holes,
  hidden,
  fresh,
  className = '',
}: {
  tint: Tint;
  holes: Hole[];
  hidden?: Set<number>;
  fresh?: Set<number>;
  className?: string;
}) {
  return (
    <div className={`vault-door-shadow relative aspect-square w-full ${className}`}>
      <img
        src={DOOR[tint]}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full select-none"
      />
      {holes
        .filter((h) => !hidden?.has(h.id))
        .map((h) => (
          <span key={h.id}>
            <span
              aria-hidden
              style={{ '--x': h.x, '--y': h.y, '--a': `${h.angle}deg` }}
              className="vault-crack absolute"
            />
            <span
              aria-hidden
              style={{ '--x': h.x, '--y': h.y, '--a': `${h.angle}deg` }}
              className={`vault-hole absolute ${h.moi ? 'vault-mine' : ''} ${fresh?.has(h.id) ? 'vault-hole-new' : ''}`}
            />
          </span>
        ))}
    </div>
  );
}

// The drill (assets/cadres/foreuse.webp): its bit points right, its tip at 41 % of its height.
function DrillShape() {
  return (
    <img
      src="cadres/foreuse.webp"
      alt=""
      draggable={false}
      className="vault-drill-bit block w-full select-none"
    />
  );
}

// The drill coming in to make one hole, with its sparks.
// It comes from outside the door, pointing to its centre; turned upright when it comes from the right.
function DrillFx({ hole }: { hole: Hole }) {
  const pointing = (hole.angle + 180) % 360;
  const upsideDown = pointing > 90 && pointing < 270;
  const sparks = [
    [-14, -22],
    [12, -26],
    [20, 6],
    [-18, 10],
    [4, 22],
    [-6, -30],
  ];
  return (
    <>
      <span
        aria-hidden
        style={{ '--x': hole.x, '--y': hole.y, '--a': `${pointing}deg` }}
        className={`vault-drill pointer-events-none absolute ${upsideDown ? 'vault-drill-flip' : ''}`}
      >
        <span className="vault-drill-shake block">
          <DrillShape />
        </span>
      </span>
      {sparks.map(([dx, dy], i) => (
        <span
          key={i}
          aria-hidden
          style={{
            '--x': hole.x,
            '--y': hole.y,
            '--dx': `${dx}px`,
            '--dy': `${dy}px`,
            '--delay': `${i * 60}ms`,
          }}
          className="vault-spark pointer-events-none absolute"
        />
      ))}
    </>
  );
}

const DRILL_MS = 1500;
const QUICK_MS = 700; // the next drills of a salvo come faster

// Where each door sits on the vault room's picture (its three rings): the centre, as a share of the
// picture's width and height.
const SLOTS = [0.251, 0.5, 0.749];

function VaultTile({
  vault: v,
  slot,
  stock,
  canDrill,
  onOpened,
}: {
  vault: Vault;
  slot: number;
  stock: number;
  canDrill: boolean;
  onOpened: (v: Vault) => void;
}) {
  const client = useQueryClient();
  const [queue, setQueue] = useState<Hole[]>([]);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: (n: number) => drill(v.id, n),
    onMutate: () => setError(null),
    onSuccess: (r) => {
      setQueue(r.trous);
      setOpened(r.ouvert);
    },
    onError: (e) => setError(e.message),
    onSettled: () => client.invalidateQueries({ queryKey: vaultKeys.state }),
  });
  // One drill after the other; the hole appears when its drill leaves.
  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(
      () => {
        setFresh((f) => new Set([...f, current.id]));
        setQueue((q) => q.slice(1));
      },
      fresh.size === 0 ? DRILL_MS : QUICK_MS,
    );
    return () => clearTimeout(t);
  }, [current, fresh.size]);
  // All drills done and the vault gave way: its opening.
  useEffect(() => {
    if (!queue.length && opened && !run.isPending) {
      setOpened(false);
      const t = setTimeout(
        () => onOpened({ ...v, ouvert_le: v.ouvert_le ?? new Date().toISOString() }),
        400,
      );
      return () => clearTimeout(t);
    }
    return undefined;
  }, [queue.length, opened, run.isPending, onOpened, v]);

  const known = new Set(v.trous.map((h) => h.id));
  const holes = [...v.trous, ...queue.filter((h) => !known.has(h.id))];
  const hidden = new Set(queue.map((h) => h.id));
  const done = holes.length;
  const left = Math.max(0, v.requis - done);
  const isOpen = !!v.ouvert_le;
  const busy = run.isPending || queue.length > 0;
  return (
    <div className={`flex flex-col items-center gap-3 ${GLOW[v.teinte]}`}>
      <div
        style={{ '--cx': SLOTS[slot] ?? 0.5, '--cy': 0.465 }}
        className={`vault-slot ${isOpen ? '' : 'vault-pulse'}`}
      >
        {isOpen ? (
          <button
            type="button"
            title="Voir le trésor"
            onClick={() => onOpened(v)}
            className="block w-full cursor-pointer transition hover:scale-105"
          >
            <img
              src="cadres/coffre-interieur.webp"
              alt="Coffre ouvert : voir le trésor"
              draggable={false}
              className="vault-door-shadow block w-full select-none"
            />
          </button>
        ) : (
          <Door tint={v.teinte} holes={holes} hidden={hidden} fresh={fresh} />
        )}
        {current && <DrillFx key={current.id} hole={current} />}
      </div>
      <b className="flex items-center gap-2">
        {v.nom}
        {isOpen && (
          <Badge variant="success" asChild>
            <button type="button" onClick={() => onOpened(v)}>
              Ouvert · voir le trésor
            </button>
          </Badge>
        )}
      </b>
      <div className="flex w-full flex-col gap-1">
        <Progress value={(Math.min(done, v.requis) * 100) / v.requis} />
        <small className="text-center text-muted-foreground tabular-nums">
          {isOpen
            ? `${v.requis} foreuses : le coffre a cédé`
            : `${done} / ${v.requis} foreuses · encore ${left}`}
        </small>
      </div>
      <small className="text-center text-muted-foreground">
        {isOpen
          ? `${v.cartes.length} carte${v.cartes.length > 1 ? 's' : ''} libérée${v.cartes.length > 1 ? 's' : ''}`
          : `${LOOT[v.teinte]}… mais lesquelles ?`}
      </small>
      {!isOpen && canDrill && (
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" disabled={busy || stock < 1} onClick={() => run.mutate(1)}>
            <ICONS.drill />
            Poser une foreuse
          </Button>
          {stock >= 5 && left >= 5 && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run.mutate(5)}>
              × 5
            </Button>
          )}
          {stock > 1 && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run.mutate(Math.min(stock, left))}
            >
              Tout ({Math.min(stock, left)})
            </Button>
          )}
        </div>
      )}
      {error && <small className="text-center text-destructive">{error}</small>}
    </div>
  );
}

// ── The opening ──

type Phase = 'shake' | 'bolts' | 'swing' | 'cards';
const PHASES: [Phase, number][] = [
  ['shake', 0],
  ['bolts', 1300],
  ['swing', 2800],
  ['cards', 4300],
];
const BOLTS = [
  { top: 'top-1/4', dx: '3rem' },
  { top: 'top-1/2', dx: '3.5rem' },
  { top: 'top-3/4', dx: '3rem' },
];

function Opening({ vault: v, onClose }: { vault: Vault; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('shake');
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const images = mirror.data ?? new Set<string>();
  useEffect(() => {
    const timers = PHASES.slice(1).map(([p, at]) => setTimeout(() => setPhase(p), at));
    return () => timers.forEach(clearTimeout);
  }, []);
  const at = PHASES.findIndex(([p]) => p === phase);
  const past = (p: Phase) => at >= PHASES.findIndex(([q]) => q === p);
  const legendary = v.teinte === 'or';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-dialog overflow-y-auto sm:max-w-4xl">
        <DialogTitle>
          <span className="flex items-center gap-2">
            <ICONS.vault />
            {v.nom} : il a cédé !
          </span>
        </DialogTitle>
        <DialogDescription>
          {past('cards')
            ? v.cartes.length
              ? 'Les nouvelles cartes entrent dans le jeu : elles sortent maintenant dans les boosters.'
              : 'Le trésor se dévoilera très bientôt…'
            : 'Les verrous sautent un à un…'}
        </DialogDescription>
        <div className={`relative overflow-hidden rounded-xl bg-background ${GLOW[v.teinte]}`}>
          {legendary && past('swing') && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {Array.from({ length: 18 }, (_, i) => (
                <span
                  key={i}
                  style={{ '--x': `${(i * 37) % 100}%`, '--delay': `${(i * 173) % 2000}ms` }}
                  className="vault-coin absolute top-0"
                />
              ))}
            </div>
          )}
          <div className="relative mx-auto aspect-square w-full max-w-sm">
            <img
              src="cadres/coffre-interieur.webp"
              alt=""
              draggable={false}
              className="absolute inset-0 size-full select-none"
            />
            {past('swing') && (
              <>
                <span aria-hidden className="vault-open-beam absolute inset-0 rounded-full" />
                <span aria-hidden className="vault-open-rays absolute inset-0" />
              </>
            )}
            <div
              className={`absolute inset-0 ${phase === 'shake' ? 'vault-open-shake' : ''} ${past('swing') ? 'vault-open-swing' : ''}`}
            >
              <Door tint={v.teinte} holes={v.trous} />
              {phase === 'bolts' &&
                BOLTS.map((b, i) => (
                  <span
                    key={b.top}
                    aria-hidden
                    style={{ '--i': i, '--dx': b.dx }}
                    className={`vault-bolt absolute right-0 h-4 w-16 rounded-sm bg-muted-foreground ${b.top}`}
                  />
                ))}
            </div>
          </div>
          {past('cards') && v.cartes.length > 0 && (
            <div className="relative flex flex-wrap justify-center gap-3 p-4">
              {v.cartes.map((card, i) => {
                const src = imageUrl(card.image ?? null, images);
                return (
                  <div
                    key={card.id}
                    style={{ '--i': i, '--from-y': '-12rem' }}
                    className="vault-card w-28"
                  >
                    <div className="vault-card-flip relative aspect-vault-card">
                      <div className="vault-card-face absolute inset-0">
                        {src ? (
                          <img
                            src={src}
                            alt={card.nom}
                            className="size-full rounded-md object-cover"
                          />
                        ) : (
                          <span className="flex size-full items-center justify-center rounded-md border bg-muted p-1 text-center text-xs">
                            {card.nom}
                          </span>
                        )}
                      </div>
                      <div className="vault-card-back back-game absolute inset-0 rounded-md border" />
                    </div>
                    <small className="mt-1 block truncate text-center">{card.nom}</small>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <Button onClick={onClose} variant={past('cards') ? 'default' : 'outline'}>
          {past('cards') ? 'Génial !' : 'Passer'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
