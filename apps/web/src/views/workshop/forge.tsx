// L'atelier, part 2: the forge of the first Forgeronne. The player picks a card (by tier, by name)
// and holds to forge it with the rarity fragments of its tier; the forge plays: the hammer strikes the
// glowing anvil three times, sparks fly, then the card rises from the anvil in its rarity's glow.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { TierFragments } from '@/components/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchForge,
  type Forge as ForgeState,
  type ForgeCard,
  forgeCard,
  type Forged,
  forgeError,
  forgeFilter,
  forgeKeys,
  TIER_NAMES,
  type TierKey,
} from '@/data/forge';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { playerKeys } from '@/data/player';
import { workshopKeys } from '@/data/workshop';
import { ICONS } from '@/lib/icons';
import { useSession } from '@/lib/session';

const TIERS: TierKey[] = ['epique', 'legendaire', 'ggez'];
const FORGE_MS = 2300; // three strikes, then the card

function useImages() {
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  return (path: string | null | undefined) =>
    mirror.data ? imageUrl(path ?? null, mirror.data) : null;
}

export function Forge() {
  const state = useQuery({ queryKey: forgeKeys.state, queryFn: fetchForge });
  const img = useImages();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ICONS.forge className="size-4" /> La forge de la première Forgeronne
        </CardTitle>
        <CardDescription>
          Choisis une carte : la Forgeronne te la forge avec tes fragments de sa rareté. Les
          versions alternatives rares coûtent le double.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.error ? (
          <p role="alert">La forge est éteinte pour le moment : {state.error.message}</p>
        ) : !state.data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <ForgeBody f={state.data} img={img} />
        )}
      </CardContent>
    </Card>
  );
}

function ForgeBody({
  f,
  img,
}: {
  f: ForgeState;
  img: (path: string | null | undefined) => string | null;
}) {
  const client = useQueryClient();
  const userId = useSession()?.user.id ?? '';
  const [tier, setTier] = useState<TierKey | null>(null);
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<ForgeCard | null>(null);
  const [forged, setForged] = useState<Forged | null>(null);
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const forge = useMutation({ mutationFn: forgeCard });
  const shown = forgeFilter(f.cartes, tier, search);
  const portrait = img(f.forgeronne);
  const affordable = (c: ForgeCard) => f.soldes[c.palier] >= c.prix;

  const strike = (c: ForgeCard) => {
    setRevealed(false);
    forge.mutate(c.variante_id, {
      onSuccess: (r) => {
        setForged(r);
        setChosen(null);
        timer.current = setTimeout(() => {
          setRevealed(true);
          void Promise.all([
            client.invalidateQueries({ queryKey: forgeKeys.state }),
            client.invalidateQueries({ queryKey: workshopKeys.state }),
            client.invalidateQueries({ queryKey: playerKeys.player(userId) }),
          ]);
        }, FORGE_MS);
      },
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        {portrait && (
          <img
            src={portrait}
            alt="La première Forgeronne"
            className="size-20 rounded-full object-cover object-top ring-2 ring-border"
          />
        )}
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Tes fragments de rareté</span>
          <span className="flex flex-wrap gap-3">
            {TIERS.map((t) => (
              <span key={t}>
                <TierFragments tier={t} n={f.soldes[t]} /> {TIER_NAMES[t]}
              </span>
            ))}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={tier === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTier(null)}
        >
          Toutes
        </Button>
        {TIERS.map((t) => (
          <Button
            key={t}
            variant={tier === t ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTier(t)}
          >
            {TIER_NAMES[t]}
          </Button>
        ))}
        <Input
          placeholder="Chercher une carte"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />
      </div>
      <div className="grid-tiles-sm grid gap-3">
        {shown.map((c) => (
          <button
            key={c.variante_id}
            type="button"
            onClick={() => setChosen(c)}
            className={`flex cursor-pointer flex-col gap-1 rounded-lg p-1 text-left transition hover:-translate-y-0.5 ${
              affordable(c) ? '' : 'opacity-60'
            }`}
          >
            {img(c.image) ? (
              <img
                src={img(c.image) ?? undefined}
                alt=""
                loading="lazy"
                className="rarity-ring aspect-5/7 w-full rounded-md object-cover"
                style={{ '--rarity': c.couleur ?? 'var(--muted-foreground)' }}
              />
            ) : (
              <div className="aspect-5/7 w-full rounded-md bg-muted" />
            )}
            <small className="line-clamp-1 font-medium">{c.nom}</small>
            <span className="flex flex-wrap items-center gap-1 text-xs">
              <TierFragments tier={c.palier} n={c.prix} />
              {c.alternative && <Badge variant="outline">{c.variante}</Badge>}
            </span>
            {c.possede > 0 && (
              <small className="text-xs text-muted-foreground">Tu l'as en {c.possede}</small>
            )}
          </button>
        ))}
        {shown.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune carte à forger ici.</p>
        )}
      </div>

      {/* The card chosen: forge it. */}
      <Dialog open={!!chosen} onOpenChange={(open) => !open && setChosen(null)}>
        <DialogContent>
          {chosen && (
            <>
              <DialogHeader>
                <DialogTitle>Forger {chosen.nom}</DialogTitle>
                <DialogDescription>
                  {TIER_NAMES[chosen.palier]}
                  {chosen.alternative ? ` · version ${chosen.variante} (prix double)` : ''}
                </DialogDescription>
              </DialogHeader>
              {img(chosen.image) && (
                <img
                  src={img(chosen.image) ?? undefined}
                  alt=""
                  className="rarity-ring-glow mx-auto aspect-5/7 w-40 rounded-md object-cover"
                  style={{ '--rarity': chosen.couleur ?? 'var(--muted-foreground)' }}
                />
              )}
              <p className="text-center text-sm">
                Prix : <TierFragments tier={chosen.palier} n={chosen.prix} /> (tu en as{' '}
                {f.soldes[chosen.palier]})
              </p>
              <HoldButton
                disabled={!affordable(chosen) || forge.isPending}
                onConfirm={() => strike(chosen)}
              >
                {affordable(chosen)
                  ? `${'\u{1F528}'} Maintiens pour forger`
                  : `Il te manque ${chosen.prix - f.soldes[chosen.palier]} fragments ${TIER_NAMES[chosen.palier]}`}
              </HoldButton>
              {forge.error && (
                <p role="alert" className="text-sm text-destructive">
                  {forgeError(forge.error)}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* The forging: the anvil, then the card. */}
      <Dialog open={!!forged} onOpenChange={(open) => !open && revealed && setForged(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{revealed ? 'Forgée !' : 'La Forgeronne frappe…'}</DialogTitle>
            <DialogDescription>
              {revealed && forged
                ? `${forged.nom} rejoint ta collection.`
                : 'Le métal rougit, le marteau tombe.'}
            </DialogDescription>
          </DialogHeader>
          {forged &&
            (revealed ? <ForgedCard forged={forged} src={img(forged.image)} /> : <Anvil />)}
          {revealed && <Button onClick={() => setForged(null)}>Merci, Forgeronne !</Button>}
        </DialogContent>
      </Dialog>
    </>
  );
}

// The anvil, the hot metal on it, the hammer striking, the sparks.
function Anvil() {
  const sparks = [-40, -22, -8, 10, 26, 44];
  return (
    <div className="relative mx-auto h-56 w-64">
      <svg viewBox="0 0 200 160" className="absolute inset-0 size-full" aria-hidden>
        {/* The glow of the hot metal. */}
        <ellipse
          cx="100"
          cy="78"
          rx="46"
          ry="16"
          className="animate-pulse fill-forge-heat opacity-40"
        />
        {/* The anvil. */}
        <path
          d="M40 80 L160 80 L170 70 L150 70 Q140 64 120 64 L60 64 Q46 66 30 70 L20 74 L40 80 Z"
          className="fill-forge-steel"
        />
        <path d="M70 80 L130 80 L122 112 L78 112 Z" className="fill-forge-iron" />
        <path d="M60 112 L140 112 L150 130 L50 130 Z" className="fill-forge-iron" />
        {/* The hot ingot on it. */}
        <rect
          x="82"
          y="56"
          width="36"
          height="9"
          rx="3"
          className="animate-pulse fill-forge-heat"
        />
      </svg>
      {/* Sparks off each strike. */}
      <div className="absolute top-1/3 left-1/2">
        {sparks.map((dx, i) => (
          <span
            key={dx}
            className="absolute size-1.5 animate-spark rounded-full bg-forge-spark"
            style={{ '--dx': `${dx}px`, '--delay': `${i * 25}ms` }}
          />
        ))}
      </div>
      {/* The hammer: it swings down onto the ingot from its handle's end. */}
      <svg
        viewBox="0 0 120 120"
        className="absolute top-0 right-2 size-32 origin-bottom-right animate-hammer"
        aria-hidden
      >
        <rect x="30" y="97" width="88" height="9" rx="4" className="fill-forge-steel" />
        <rect x="6" y="84" width="30" height="34" rx="4" className="fill-forge-iron" />
      </svg>
    </div>
  );
}

function ForgedCard({ forged, src }: { forged: Forged; src: string | null }) {
  return (
    <div className="flex animate-forge-reveal flex-col items-center gap-2">
      {src ? (
        <img
          src={src}
          alt={forged.nom}
          className="rarity-ring-glow aspect-5/7 w-48 rounded-md object-cover"
          style={{ '--rarity': forged.couleur ?? 'var(--muted-foreground)' }}
        />
      ) : (
        <div className="aspect-5/7 w-48 rounded-md bg-muted" />
      )}
      <b>{forged.nom}</b>
      <small className="text-muted-foreground">
        {TIER_NAMES[forged.palier]}
        {forged.variante !== 'Standard' ? ` · ${forged.variante}` : ''} ·{' '}
        <TierFragments tier={forged.palier} n={forged.prix} />
      </small>
    </div>
  );
}
