// L'inventaire (data/inventory.ts, 100-inventaire.sql): everything the player keeps, behind three
// tiles so the page stays light. A click opens each one:
//   - the box of boosters: the boosters kept, to open in live (!booster) or on « Jouer »;
//   - the chest: gold and every kind of fragment;
//   - the objects: drills and Perce-Abîme, and the mini-vaults. A mini-vault opens like the vaults of
//     the event (views/lore/vault-parts.tsx): drills come in one after the other and pierce its door;
//     its defense stays secret. At its last drill it shakes, swings open and its loot flies out.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import { Fragments, Gold, TierFragments } from '@/components/money';
import { PageSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import {
  drillMiniVault,
  fetchInventory,
  type Inventory,
  inventoryKeys,
  type Loot,
  type MiniVault,
  TINT_NAMES,
} from '@/data/inventory';
import type { Hole } from '@/data/vaults';
import { ICONS } from '@/lib/icons';
import { useSession } from '@/lib/session';
import {
  BOLTS,
  DRILL_MS,
  GIGA_DRILL,
  GIGA_MS,
  GLOW,
  type Phase,
  PHASES,
  QUICK_MS,
} from '@/views/lore/vault-art';
import { Door, DrillFx } from '@/views/lore/vault-parts';

type Panel = 'boosters' | 'chest' | 'objects';

export function InventoryPage() {
  const signedIn = !!useSession();
  const inventory = useQuery({
    queryKey: inventoryKeys.state,
    queryFn: fetchInventory,
    enabled: signedIn,
  });
  const [panel, setPanel] = useState<Panel | null>(null);
  if (!signedIn)
    return <p className="text-muted-foreground">Connecte-toi pour ouvrir ton inventaire.</p>;
  if (inventory.error) return <p role="alert">{inventory.error.message}</p>;
  if (!inventory.data) return <PageSkeleton />;
  const inv = inventory.data;
  const boosters = inv.boosters.reduce((n, b) => n + b.quantite, 0);
  const closed = inv.coffres.filter((c) => !c.ouvert_le).length;
  const objects = inv.objets.foreuse + inv.objets.perce_abime + closed;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">
        Tout ce que tu possèdes, rangé à sa place. Clique pour ouvrir.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile
          icon={ICONS.boosterBox}
          title="Boîte à boosters"
          line={`${boosters} booster${boosters > 1 ? 's' : ''} en réserve`}
          onClick={() => setPanel('boosters')}
        />
        <Tile
          icon={ICONS.purse}
          title="Mon coffre"
          line={<Gold n={inv.monnaie} />}
          onClick={() => setPanel('chest')}
        />
        <Tile
          icon={ICONS.inventory}
          title="Inventaire"
          line={`${objects} objet${objects > 1 ? 's' : ''}`}
          badge={closed > 0 ? `${closed} coffre${closed > 1 ? 's' : ''} à ouvrir` : null}
          onClick={() => setPanel('objects')}
        />
      </div>
      {panel === 'boosters' && <BoosterBox inv={inv} onClose={() => setPanel(null)} />}
      {panel === 'chest' && <Chest inv={inv} onClose={() => setPanel(null)} />}
      {panel === 'objects' && <Objects inv={inv} onClose={() => setPanel(null)} />}
    </div>
  );
}

function Tile({
  icon: Icon,
  title,
  line,
  badge = null,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  line: ReactNode;
  badge?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border bg-card p-6 text-center shadow-sm transition hover:-translate-y-1 hover:bg-accent hover:shadow-md"
    >
      <Icon className="size-12" />
      <b className="text-lg">{title}</b>
      <span className="text-sm text-muted-foreground">{line}</span>
      {badge && <Badge variant="warning">{badge}</Badge>}
    </button>
  );
}

function Panel({
  title,
  description,
  onClose,
  children,
}: {
  title: ReactNode;
  description: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-dialog overflow-y-auto sm:max-w-3xl">
        <DialogTitle>
          <span className="flex items-center gap-2">{title}</span>
        </DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function BoosterBox({ inv, onClose }: { inv: Inventory; onClose: () => void }) {
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  return (
    <Panel
      title={
        <>
          <ICONS.boosterBox />
          Boîte à boosters
        </>
      }
      description="Tes boosters pas encore ouverts : ouvre-les en live avec !booster, ou dans « Jouer » quand le jeu est en pause."
      onClose={onClose}
    >
      {inv.boosters.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ta boîte est vide pour le moment.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {inv.boosters.map((b) => {
            const src = imageUrl(b.image, mirror.data ?? new Set());
            return (
              <div key={b.type_id} className="flex flex-col items-center gap-1 text-center">
                <div className="relative w-full">
                  {src ? (
                    <img src={src} alt="" className="w-full rounded-lg shadow-md" />
                  ) : (
                    <div className="back-game aspect-vault-card w-full rounded-lg" />
                  )}
                  <span className="absolute top-1 right-1">
                    <Badge variant="info">× {b.quantite}</Badge>
                  </span>
                </div>
                <small>{b.nom}</small>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function Chest({ inv, onClose }: { inv: Inventory; onClose: () => void }) {
  const rows: [string, ReactNode][] = [
    ['Gold', <Gold key="g" n={inv.monnaie} />],
    ['Fragments', <Fragments key="f" n={inv.fragments} />],
    ['Fragments épiques', <TierFragments key="e" tier="epique" n={inv.fragments_epique} />],
    [
      'Fragments légendaires',
      <TierFragments key="l" tier="legendaire" n={inv.fragments_legendaire} />,
    ],
    ['Fragments GGEZ', <TierFragments key="z" tier="ggez" n={inv.fragments_ggez} />],
  ];
  return (
    <Panel
      title={
        <>
          <ICONS.purse />
          Mon coffre
        </>
      }
      description="Ton argent et tes fragments."
      onClose={onClose}
    >
      <div className="flex flex-col divide-y rounded-lg border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 p-3">
            <span>{label}</span>
            <b className="text-lg">{value}</b>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Objects({ inv, onClose }: { inv: Inventory; onClose: () => void }) {
  const [vault, setVault] = useState<number | null>(null);
  const picked = inv.coffres.find((c) => c.id === vault) ?? null;
  const closed = inv.coffres.filter((c) => !c.ouvert_le);
  const opened = inv.coffres.filter((c) => !!c.ouvert_le);
  if (picked)
    return (
      <MiniVaultDialog
        vault={picked}
        inv={inv}
        onClose={() => setVault(null)}
        onBack={() => setVault(null)}
      />
    );
  return (
    <Panel
      title={
        <>
          <ICONS.inventory />
          Inventaire
        </>
      }
      description="Tes objets. Les foreuses s'achètent pendant les événements des coffres-forts ; un coffre s'ouvre en le perçant."
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <img src="cadres/foreuse.webp" alt="" draggable={false} className="w-20 select-none" />
          <span className="flex flex-col">
            <b>Foreuse</b>
            <small className="text-muted-foreground">× {inv.objets.foreuse}</small>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <img src={GIGA_DRILL} alt="" draggable={false} className="w-20 select-none" />
          <span className="flex flex-col">
            <b>Perce-Abîme</b>
            <small className="text-muted-foreground">
              × {inv.objets.perce_abime} · compte pour {inv.puissance_giga} foreuses
            </small>
          </span>
        </div>
      </div>
      <b className="flex items-center gap-2">
        <ICONS.vault />
        Coffres à ouvrir
      </b>
      {closed.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun coffre pour le moment.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {closed.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setVault(c.id)}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg p-2 text-center transition hover:scale-105 hover:bg-accent ${GLOW[c.teinte]}`}
            >
              <span className="vault-pulse block w-full">
                <Door tint={c.teinte} holes={c.trous} mini />
              </span>
              <small>{TINT_NAMES[c.teinte]}</small>
              {c.origine && <small className="text-muted-foreground">{c.origine}</small>}
            </button>
          ))}
        </div>
      )}
      {opened.length > 0 && (
        <>
          <b>Derniers coffres ouverts</b>
          <div className="flex flex-col gap-2">
            {opened.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                <img
                  src="cadres/coffre-interieur.webp"
                  alt=""
                  draggable={false}
                  className="w-10 select-none"
                />
                <small className="font-medium">{TINT_NAMES[c.teinte]}</small>
                {(c.butin ?? []).map((l, i) => (
                  <LootLine key={i} loot={l} />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

const LOOT_NAMES: Record<Loot['objet'], string> = {
  gold: 'Gold',
  fragments: 'Fragments',
  fragments_epique: 'Fragments épiques',
  fragments_legendaire: 'Fragments légendaires',
  fragments_ggez: 'Fragments GGEZ',
  booster: 'Booster',
  foreuse: 'Foreuse',
  perce_abime: 'Perce-Abîme',
  carte: 'Carte',
};

// One thing a vault gave, on one line.
function LootLine({ loot: l }: { loot: Loot }) {
  switch (l.objet) {
    case 'gold':
      return <Gold n={l.n} sign />;
    case 'fragments':
      return <Fragments n={l.n} sign />;
    case 'fragments_epique':
      return <TierFragments tier="epique" n={l.n} sign />;
    case 'fragments_legendaire':
      return <TierFragments tier="legendaire" n={l.n} sign />;
    case 'fragments_ggez':
      return <TierFragments tier="ggez" n={l.n} sign />;
    case 'carte':
      return (
        <Badge variant="warning">
          <ICONS.cards />
          {l.nom}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          +{l.n} {l.objet === 'booster' ? (l.nom ?? 'Booster') : LOOT_NAMES[l.objet]}
        </Badge>
      );
  }
}

// A mini-vault, drilled. Its holes come one after the other; at the last one, its opening.
function MiniVaultDialog({
  vault: v,
  inv,
  onClose,
  onBack,
}: {
  vault: MiniVault;
  inv: Inventory;
  onClose: () => void;
  onBack: () => void;
}) {
  const client = useQueryClient();
  const [queue, setQueue] = useState<Hole[]>([]);
  const [made, setMade] = useState<Hole[]>([]); // every hole drilled since the vault was opened here
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [loot, setLoot] = useState<Loot[] | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: ({ n, giga }: { n: number; giga: boolean }) => drillMiniVault(v.id, n, giga),
    onMutate: () => setError(null),
    onSuccess: (r) => {
      setQueue(r.trous);
      setMade((m) => [...m, ...r.trous]);
      if (r.ouvert) setLoot(r.butin ?? []);
    },
    onError: (e) => setError(e.message),
  });
  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(
      () => {
        setFresh((f) => new Set([...f, current.id]));
        setQueue((q) => q.slice(1));
      },
      (current.poids ?? 1) > 1 ? GIGA_MS : fresh.size === 0 ? DRILL_MS : QUICK_MS,
    );
    return () => clearTimeout(t);
  }, [current, fresh.size]);
  // the drills done: refresh what the inventory shows, and the opening if it gave way
  useEffect(() => {
    if (queue.length || run.isPending) return;
    // the inventory, and the gold and fragments the sidebar shows
    if (run.isSuccess) void client.invalidateQueries();
    if (loot) setOpening(true);
  }, [queue.length, run.isPending, run.isSuccess, loot, client]);

  const seen = new Set(v.trous.map((h) => h.id));
  const allHoles = [...v.trous, ...made.filter((h) => !seen.has(h.id))];
  if (opening && loot)
    return <MiniOpening vault={v} holes={allHoles} loot={loot} onClose={onBack} />;

  const holes = allHoles;
  const hidden = new Set(queue.map((h) => h.id));
  const done = holes.reduce((n, h) => n + (h.poids ?? 1), 0);
  const busy = run.isPending || queue.length > 0 || !!loot;
  const stock = inv.objets.foreuse;
  const giga = inv.objets.perce_abime;
  return (
    <Panel
      title={
        <>
          <ICONS.vault />
          {TINT_NAMES[v.teinte]}
        </>
      }
      description={v.origine ?? 'Combien de foreuses faudra-t-il ? Et que cache-t-il ?'}
      onClose={onClose}
    >
      <div className={`mx-auto w-full max-w-xs ${GLOW[v.teinte]}`}>
        <Door tint={v.teinte} holes={holes} hidden={hidden} fresh={fresh} mini>
          {current && <DrillFx key={current.id} hole={current} />}
        </Door>
      </div>
      <small className="flex items-center justify-center gap-1 text-muted-foreground tabular-nums">
        <ICONS.drill />
        {done} foreuse{done > 1 ? 's' : ''} plantée{done > 1 ? 's' : ''}… combien encore ?
      </small>
      <div className="flex flex-wrap justify-center gap-2">
        <Button disabled={busy || stock < 1} onClick={() => run.mutate({ n: 1, giga: false })}>
          <ICONS.drill />
          Poser une foreuse ({stock})
        </Button>
        {stock >= 5 && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run.mutate({ n: 5, giga: false })}
          >
            × 5
          </Button>
        )}
        {stock > 1 && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run.mutate({ n: stock, giga: false })}
          >
            Tout ({stock})
          </Button>
        )}
        {giga > 0 && (
          <Button disabled={busy} onClick={() => run.mutate({ n: 1, giga: true })}>
            <ICONS.drill />
            Perce-Abîme ({giga})
          </Button>
        )}
      </div>
      {stock < 1 && giga < 1 && (
        <small className="text-center text-muted-foreground">
          Plus de foreuse : elles s'achètent pendant les événements des coffres-forts.
        </small>
      )}
      {error && <small className="text-center text-destructive">{error}</small>}
      <Button variant="outline" onClick={onBack}>
        <ICONS.previous />
        Retour à l'inventaire
      </Button>
    </Panel>
  );
}

// The opening of a mini-vault: it shakes, its bolts pull back, it swings open, its loot flies out.
function MiniOpening({
  vault: v,
  holes,
  loot,
  onClose,
}: {
  vault: MiniVault;
  holes: Hole[];
  loot: Loot[];
  onClose: () => void;
}) {
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const [phase, setPhase] = useState<Phase>('shake');
  useEffect(() => {
    const timers = PHASES.slice(1).map(([p, at]) => setTimeout(() => setPhase(p), at));
    return () => timers.forEach(clearTimeout);
  }, []);
  const at = PHASES.findIndex(([p]) => p === phase);
  const past = (p: Phase) => at >= PHASES.findIndex(([q]) => q === p);
  const legendary = v.teinte === 'or';
  return (
    <Panel
      title={
        <>
          <ICONS.vault />
          {TINT_NAMES[v.teinte]} : il a cédé !
        </>
      }
      description={past('cards') ? 'Voici ton butin !' : 'Les verrous sautent un à un…'}
      onClose={onClose}
    >
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
        <div className="relative mx-auto aspect-square w-full max-w-xs">
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
            <Door tint={v.teinte} holes={holes} mini />
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
        {past('cards') && (
          <div className="relative flex flex-wrap justify-center gap-3 p-4">
            {loot.map((l, i) => {
              const src = l.image ? imageUrl(l.image, mirror.data ?? new Set()) : null;
              return (
                <div
                  key={i}
                  style={{ '--i': i, '--from-y': '-10rem' }}
                  className="vault-card flex w-28 flex-col items-center gap-1 rounded-lg border bg-card p-2 text-center shadow-md"
                >
                  {l.objet === 'carte' && src ? (
                    <img src={src} alt="" className="w-full rounded-md" />
                  ) : l.objet === 'booster' && src ? (
                    <img src={src} alt="" className="w-full rounded-md" />
                  ) : l.objet === 'foreuse' || l.objet === 'perce_abime' ? (
                    <img
                      src={l.objet === 'foreuse' ? 'cadres/foreuse.webp' : GIGA_DRILL}
                      alt=""
                      className="w-full"
                    />
                  ) : null}
                  <b className="text-sm">
                    <LootLine loot={l} />
                  </b>
                  {l.objet === 'carte' && <small>{l.rarete}</small>}
                </div>
              );
            })}
            {loot.length === 0 && (
              <p className="text-sm text-muted-foreground">Rien… cette fois.</p>
            )}
          </div>
        )}
      </div>
      <Button onClick={onClose} variant={past('cards') ? 'default' : 'outline'}>
        {past('cards') ? 'Génial !' : 'Passer'}
      </Button>
    </Panel>
  );
}
