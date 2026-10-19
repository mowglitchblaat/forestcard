// Encyclopédie · Raretés: the rarities as buttons in their colours, the selected one shown on a card
// in the combat overlay's preview (one frame for the page); the author's notes on collections and
// versions; and how many active cards each collection has, by rarity.

import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cardKeys, fetchGameCardsFull } from '@/data/cards';
import { useMediaQuery } from '@/hooks/use-media-query';
import { RARITIES, RARITY_INTRO, RARITY_NOTES } from './content';
import { countsByCollection } from './model';
import { type RarityBadge, RarityExample } from './rarities';

const route = getRouteApi('/encyclopedie/raretes');

export function RaritiesPage() {
  const { rarete } = route.useSearch();
  const navigate = route.useNavigate();
  const wide = useMediaQuery('(min-width: 1024px)');
  const panel = useRef<HTMLElement>(null);
  const selected = RARITIES.find((r) => r.tier === rarete) ?? RARITIES[0];
  if (!selected) return null;

  const pick = (r: RarityBadge) => {
    void navigate({ search: { rarete: r.tier }, replace: true, resetScroll: false });
    if (!wide) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="grid items-start gap-8 lg:layout-main-aside-26">
      <div className="flex min-w-0 flex-col gap-8">
        <p className="text-muted-foreground">{RARITY_INTRO}</p>
        <div className="flex flex-wrap gap-2">
          {RARITIES.map((r) => (
            <button
              key={r.tier}
              type="button"
              aria-pressed={r === selected}
              onClick={() => pick(r)}
              className={`rounded-full px-3 py-1 text-sm font-semibold text-white transition hover:-translate-y-0.5 ${
                r.background.startsWith('linear-gradient') ? 'bg-(image:--chip)' : 'bg-(--chip)'
              } ${r === selected ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}`}
              style={{ '--chip': r.background }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {RARITY_NOTES.map((note) => (
            <Card key={note.title}>
              <CardHeader>
                <CardTitle className="text-base">{note.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">{note.body}</CardContent>
            </Card>
          ))}
        </div>
        <CollectionsTable />
      </div>
      <aside
        ref={panel}
        aria-live="polite"
        className="order-first flex scroll-mt-4 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground lg:sticky lg:top-4 lg:order-none"
      >
        <h2 className="text-lg font-semibold">{selected.label}</h2>
        <RarityExample key={selected.tier} rarity={selected} />
      </aside>
    </div>
  );
}

function CollectionsTable() {
  const cards = useQuery({ queryKey: cardKeys.gameCardsFull, queryFn: fetchGameCardsFull });
  if (cards.error) return <p role="alert">Erreur : {cards.error.message}</p>;
  if (!cards.data) return <Skeleton className="h-48 w-full rounded-xl" />;
  const rows = countsByCollection(cards.data);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="border-b pb-2 text-lg font-semibold">Les cartes de chaque collection</h2>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Collection</th>
              {RARITIES.map((r) => (
                <th key={r.tier} className="px-3 py-2 text-right font-medium">
                  {r.label}
                </th>
              ))}
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t">
                <td className="px-4 py-2">{row.name}</td>
                {RARITIES.map((r) => (
                  <td key={r.tier} className="px-3 py-2 text-right text-muted-foreground">
                    {row.byTier[r.tier] ?? '·'}
                  </td>
                ))}
                <td className="px-4 py-2 text-right font-semibold">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
