// The player's collection, reimagined: a stats band above the card grid shared with the
// catalogue (browser.tsx). Read only: building the deck and recycling come with slice 3.

import { CollectionSkeleton } from '@/components/skeletons';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { cardKeys, fetchCollection, fetchGameCards } from '@/data/cards';
import { fetchMirror, imageKeys } from '@/data/images';
import { DEFAULT_PRICES, fetchPrices, recyclingKeys } from '@/data/recycling';
import { useSession } from '@/lib/session';
import { CardBrowser } from './browser';
import type { CollectionSearch } from './search';
import { StatsBand } from './stats';

const route = getRouteApi('/collection');

export function CollectionPage() {
  const session = useSession();
  const userId = session?.user.id ?? '';
  const search = route.useSearch();
  const navigate = route.useNavigate();
  // Updating the address must not scroll the page back to the top (the router's default).
  const set = (patch: Partial<CollectionSearch>) =>
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true, resetScroll: false });

  const collection = useQuery({
    queryKey: cardKeys.collection(userId),
    queryFn: () => fetchCollection(userId),
    enabled: userId !== '',
  });
  const game = useQuery({ queryKey: cardKeys.gameCards, queryFn: fetchGameCards });
  const prices = useQuery({ queryKey: recyclingKeys.prices, queryFn: fetchPrices });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });

  const entries = collection.data;
  if (collection.error) return <p role="alert">Erreur : {collection.error.message}</p>;
  if (!entries) return <CollectionSkeleton />;
  if (!entries.length)
    return (
      <p>
        Tu n'as encore aucune carte. Achète un booster dans la boutique, puis ouvre-le en live avec
        !booster.
      </p>
    );

  return (
    <div className="flex flex-col gap-6">
      <StatsBand entries={entries} game={game.data} prices={prices.data ?? DEFAULT_PRICES} />
      <CardBrowser
        entries={entries}
        search={search}
        set={set}
        images={mirror.data ?? new Set<string>()}
        prices={prices.data ?? DEFAULT_PRICES}
      />
    </div>
  );
}
