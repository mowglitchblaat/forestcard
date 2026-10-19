// The shop, reimagined: the boosters waiting to be opened live first, then the boosters on sale as
// cards (image, cards per booster, featured cards, content by collection and rarity), each bought by
// holding its button (no confirmation dialog). A booster new or repriced since the last visit is
// badged ("Nouveau", "Prix : 300 → 250"). Buying writes: gold and stock are re-read after.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TONES } from '@/lib/tones';
import { ICONS } from '@/lib/icons';
import { useEffect, useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { Gold } from '@/components/money';
import { PageSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { fetchPlayer, playerKeys } from '@/data/player';
import {
  type BoosterType,
  buyBooster,
  type ContentRow,
  type Featured,
  fetchContents,
  fetchFeatured,
  fetchShop,
  fetchStock,
  offerChange,
  offerKeys,
  shopKeys,
} from '@/data/shop';
import { listMark, markSeen, SEEN_KEYS } from '@/lib/seen';
import { useSession } from '@/lib/session';

export function ShopPage() {
  const userId = useSession()?.user.id ?? '';
  const client = useQueryClient();
  const offers = useQuery({ queryKey: shopKeys.offers, queryFn: fetchShop });
  const stock = useQuery({
    queryKey: shopKeys.stock(userId),
    queryFn: () => fetchStock(userId),
    enabled: userId !== '',
  });
  const player = useQuery({
    queryKey: playerKeys.player(userId),
    queryFn: () => fetchPlayer(userId),
    enabled: userId !== '',
  });
  const contents = useQuery({ queryKey: shopKeys.contents, queryFn: fetchContents });
  const featured = useQuery({ queryKey: shopKeys.featured, queryFn: fetchFeatured });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const [bought, setBought] = useState<string | null>(null);
  const buy = useMutation({
    mutationFn: (b: BoosterType) => buyBooster(b.id),
    onSuccess: (_, b) => setBought(b.nom),
    // Bought or refused, the gold and the stock are re-read from the database.
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: playerKeys.player(userId) }),
        client.invalidateQueries({ queryKey: shopKeys.stock(userId) }),
      ]),
  });

  // The offers seen at the previous visit, read once on arrival: marking this visit must not remove
  // the badges while the player reads them. A first visit badges nothing.
  const [seenBefore] = useState(() => localStorage.getItem(SEEN_KEYS.shop));
  useEffect(() => {
    if (offers.data) markSeen(SEEN_KEYS.shop, listMark(offerKeys(offers.data)));
  }, [offers.data]);

  if (offers.error) return <p role="alert">Boutique indisponible : {offers.error.message}</p>;
  if (!offers.data) return <PageSkeleton />;

  const images = mirror.data ?? new Set<string>();
  // Unknown until the player loads: no offer says "il te manque" meanwhile (see OfferCard).
  const gold = player.data?.monnaie;
  const sorted = [...offers.data].sort(
    (a, b) => (a.prix ?? Infinity) - (b.prix ?? Infinity) || a.nom.localeCompare(b.nom, 'fr'),
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ICONS.booster className="size-5" /> Tes boosters à ouvrir
        </h2>
        {stock.data?.length ? (
          <>
            {/* The boosters themselves, side by side as if laid on a table: one picture each. */}
            <div className="flex flex-wrap items-end gap-x-2 gap-y-6 py-2">
              {stock.data.flatMap((s, i) =>
                Array.from({ length: Math.min(s.quantite, MAX_SHOWN) }, (_, n) => (
                  <BoosterPack
                    key={`${i}-${n}`}
                    name={s.types_boosters?.nom ?? 'Booster'}
                    image={imageUrl(s.types_boosters?.image_path ?? null, images)}
                    more={n === MAX_SHOWN - 1 ? s.quantite - MAX_SHOWN : 0}
                  />
                )),
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Ouvre-les pendant le live avec <code>!booster</code>.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun booster en attente. Ceux que tu achètes ici t'attendront pour le live.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Acheter</h2>
          <span className="text-sm text-muted-foreground">
            {gold === undefined ? (
              '…'
            ) : (
              <>
                Tu as <Gold n={gold} />
              </>
            )}
          </span>
        </div>
        {bought && (
          <p role="status" className={`rounded-lg p-3 text-sm ${TONES.success.box}`}>
            « {bought} » acheté ! Ouvre-le pendant le live avec <code>!booster</code>.
          </p>
        )}
        {buy.error && (
          <p role="alert" className="text-sm text-destructive">
            {buy.error.message}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((b) => (
            <Offer
              key={b.id}
              booster={b}
              image={imageUrl(b.image_path, images)}
              gold={gold}
              change={offerChange(seenBefore, b)}
              contents={contents.data?.filter((r) => r.type_id === b.id) ?? []}
              featured={featured.data?.filter((f) => f.type_id === b.id) ?? []}
              images={images}
              busy={buy.isPending}
              buying={buy.isPending && buy.variables?.id === b.id}
              onBuy={() => {
                setBought(null);
                buy.mutate(b);
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// Beyond this many of a kind, the last picture carries "+n".
export const MAX_SHOWN = 10;

// One booster as it stands: its picture, upright, lifted on hover; its name on hover.
export function BoosterPack({
  name,
  image,
  more,
}: {
  name: string;
  image: string | null;
  more: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative w-28 shrink-0 transition hover:-translate-y-2 sm:w-32">
          {image ? (
            <img
              loading="lazy"
              src={image}
              alt={name}
              className="w-full rounded-md object-contain drop-shadow-lg"
            />
          ) : (
            <Thumb image={null} />
          )}
          {more > 0 && (
            <span className="absolute right-1 bottom-1 rounded-full bg-background/90 px-2 py-0.5 text-xs font-semibold tabular-nums shadow">
              +{more}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );
}

function Thumb({ image }: { image: string | null }) {
  const size = 'w-full';
  return image ? (
    <img
      loading="lazy"
      src={image}
      alt=""
      className={`${size} aspect-5/7 shrink-0 rounded-md object-cover`}
    />
  ) : (
    <div
      className={`${size} flex aspect-5/7 shrink-0 items-center justify-center rounded-md bg-muted text-2xl`}
    >
      {'\u{1F3B4}'}
    </div>
  );
}

function Offer({
  booster: b,
  image,
  gold,
  change,
  contents,
  featured,
  images,
  busy,
  buying,
  onBuy,
}: {
  booster: BoosterType;
  image: string | null;
  gold: number | undefined;
  change: ReturnType<typeof offerChange>;
  contents: ContentRow[];
  featured: Featured[];
  images: Set<string>;
  busy: boolean;
  // This offer is the one being bought (busy: a purchase is running, this one or another).
  buying: boolean;
  onBuy: () => void;
}) {
  const price = b.prix;
  const missing = price === null || gold === undefined ? 0 : price - gold;
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <div className="flex items-start gap-3">
          {/* Wrapped: an img as the card's first child is taken for a cover image. */}
          <div className="w-20 shrink-0">
            <Thumb image={image} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="text-base">{b.nom}</CardTitle>
            <CardDescription>
              {b.nb_cartes ?? '?'} carte{(b.nb_cartes ?? 0) > 1 ? 's' : ''} par booster
            </CardDescription>
            {change?.kind === 'new' && (
              <Badge variant="new" className="w-fit">
                Nouveau
              </Badge>
            )}
            {change?.kind === 'price' && (
              <Badge variant="new" className="w-fit">
                Prix : {change.before ?? '—'} → {price ?? '—'}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <Contents rows={contents} featured={featured} images={images} />
        {price === null ? (
          <p className="text-sm text-muted-foreground">Pas en vente : il se gagne.</p>
        ) : gold === undefined ? (
          <p className="text-sm text-muted-foreground">
            <Gold n={price} />
          </p>
        ) : missing > 0 ? (
          <p className="text-sm text-muted-foreground">
            <Gold n={price} /> : il te manque <Gold n={missing} />.
          </p>
        ) : (
          <HoldButton onConfirm={onBuy} disabled={busy}>
            {buying ? (
              'Achat…'
            ) : (
              <>
                Maintiens pour acheter · <Gold n={price} />
              </>
            )}
          </HoldButton>
        )}
      </CardContent>
    </Card>
  );
}

// What a booster may give: its featured cards, then per collection the count of cards by rarity
// (by rarity weight, as the legacy page). Folded: the card stays compact.
function Contents({
  rows,
  featured,
  images,
}: {
  rows: ContentRow[];
  featured: Featured[];
  images: Set<string>;
}) {
  if (!rows.length && !featured.length) return null;
  const total = rows.reduce((n, r) => n + r.nb, 0);
  const groups = new Map<string, { common: boolean; rows: ContentRow[] }>();
  for (const r of rows) {
    const key = r.collection_id === null ? 'communes' : String(r.collection_id);
    const group = groups.get(key) ?? { common: r.collection_id === null, rows: [] };
    groups.set(key, group);
    group.rows.push(r);
  }
  const ordered = [...groups.values()].sort(
    (a, b) =>
      Number(a.common) - Number(b.common) ||
      (a.rows[0]?.collection_nom ?? '').localeCompare(b.rows[0]?.collection_nom ?? '', 'fr'),
  );
  return (
    <details className="group rounded-lg border">
      <summary className="flex list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
        Contenu : {total} carte{total > 1 ? 's' : ''} possibles
        <ICONS.expand className="ml-auto size-4 transition group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 border-t px-3 py-3 text-sm">
        {featured.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <b>À l'affiche</b>
            <div className="flex flex-wrap gap-2">
              {featured.map((f, i) => {
                const src = imageUrl(f.image_path ?? null, images);
                return (
                  <span key={i} className="flex w-14 flex-col items-center gap-1 text-center">
                    {src && (
                      <img
                        loading="lazy"
                        src={src}
                        alt=""
                        className="aspect-5/7 w-full rounded object-cover rarity-glow"
                        style={{ '--rarity': f.couleur ?? undefined }}
                      />
                    )}
                    <small className="leading-tight">{f.nom}</small>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {ordered.map((g) => (
          <div key={g.rows[0]?.collection_nom} className="flex flex-col gap-1">
            <b>{g.rows[0]?.collection_nom}</b>
            <div className="flex flex-wrap gap-1.5">
              {[...g.rows]
                .sort((a, b) => (a.rarete_poids ?? 0) - (b.rarete_poids ?? 0))
                .map((r) => (
                  <span
                    key={r.rarete_nom}
                    className="rounded-full border border-(--rarity) px-2 py-0.5 text-xs"
                    style={{ '--rarity': r.rarete_couleur ?? undefined }}
                  >
                    {r.nb} {r.rarete_nom}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
