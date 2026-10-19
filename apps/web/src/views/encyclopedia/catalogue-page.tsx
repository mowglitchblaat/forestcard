// Encyclopédie · Catalogue: every active card of the game, in the grid of "Ma collection" (same
// filters, sort and details, without copies or recycling), and a link to the printable catalogue
// (catalogue.html, served beside the site).

import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { ICONS } from '@/lib/icons';
import { useMemo } from 'react';
import { CollectionSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { cardKeys, fetchGameCardsFull } from '@/data/cards';
import { fetchMirror, imageKeys } from '@/data/images';
import { CardBrowser } from '@/views/collection/browser';
import type { CollectionSearch } from '@/views/collection/search';
import { catalogueEntries } from './model';

const route = getRouteApi('/encyclopedie/catalogue');

export function CataloguePage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const set = (patch: Partial<CollectionSearch>) =>
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true, resetScroll: false });

  const cards = useQuery({ queryKey: cardKeys.gameCardsFull, queryFn: fetchGameCardsFull });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const entries = useMemo(() => cards.data && catalogueEntries(cards.data), [cards.data]);

  if (cards.error) return <p role="alert">Erreur : {cards.error.message}</p>;
  if (!entries) return <CollectionSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">
          Toutes les cartes du jeu, {entries.length} aujourd'hui.
        </p>
        <Button variant="outline" asChild>
          <a href="catalogue.html" target="_blank" rel="noopener">
            <ICONS.print /> Catalogue imprimable
          </a>
        </Button>
      </div>
      <CardBrowser
        entries={entries}
        search={search}
        set={set}
        images={mirror.data ?? new Set<string>()}
      />
    </div>
  );
}
