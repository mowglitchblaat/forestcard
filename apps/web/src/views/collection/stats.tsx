// The stats band: owned cards (with the detail by collection in a side panel), duplicates and what
// recycling them pays, and progress by rarity.

import { ICONS } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { CollectionEntry, GameCard } from '@/data/cards';
import { type Prices, totalGain } from '@/data/recycling';
import { pct, progress } from './model';
import { RecycleBlock } from './recycle';

export function StatsBand({
  entries,
  game,
  prices,
}: {
  entries: CollectionEntry[];
  game: GameCard[] | undefined;
  prices: Prices;
}) {
  const owned = new Set(entries.filter((e) => e.quantite > 0).map((e) => e.card.id));
  const p = game?.length ? progress(game, owned) : null;
  const gain = totalGain(entries, prices);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <ICONS.collection className="size-4" /> Cartes possédées
          </CardDescription>
          <CardTitle className="text-3xl tabular-nums">
            {p ? (
              <>
                {p.mine}
                <span className="text-lg text-muted-foreground"> / {p.total}</span>
              </>
            ) : (
              entries.length
            )}
          </CardTitle>
        </CardHeader>
        {p && (
          <CardContent className="flex flex-col gap-2">
            <Progress value={pct(p.mine, p.total)} />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {p.total - p.mine ? `Il t'en manque ${p.total - p.mine}` : 'Collection complète !'}
              </span>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="link" size="inline">
                    Par collection
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Par collection</SheetTitle>
                    <SheetDescription>
                      Cartes différentes possédées, sur les cartes actives du jeu.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="flex flex-col gap-4 px-4">
                    {p.byGroup.map((g) => (
                      <div key={g.name} className="flex flex-col gap-1 text-sm">
                        <div className="flex justify-between">
                          <span>{g.name}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {g.mine} / {g.total}
                          </span>
                        </div>
                        <Progress value={pct(g.mine, g.total)} />
                      </div>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <ICONS.recycle className="size-4" /> Doublons
          </CardDescription>
          <CardTitle className="text-3xl tabular-nums">{gain.copies}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="text-muted-foreground">
            <RecycleBlock gain={gain} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <ICONS.rarities className="size-4" /> Par rareté
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {p?.byRarity.map((r) => (
            <div key={r.name} className="grid layout-label-bar-value-md items-center gap-2 text-sm">
              <span className="truncate">{r.name}</span>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full w-(--pct) rounded-full bg-(--colour)"
                  style={{ '--pct': `${pct(r.mine, r.total)}%`, '--colour': r.color ?? undefined }}
                />
              </div>
              <span className="text-right tabular-nums text-muted-foreground">
                {r.mine}/{r.total}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
