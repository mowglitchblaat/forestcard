// The card grid shared by "Ma collection", the encyclopedia's catalogue and the deck page: a toolbar
// (search, filters, sort, all kept in the address), an image-first grid in one section per card
// type, and the selected card's details beside the grid (in a side panel on small screens).
// Pick mode (the deck page): a click puts the card in or out of the deck, a magnifier opens its
// details, always in a side panel (the deck takes the space beside the grid).

import { TONES } from '@/lib/tones';
import { ICONS, type LucideIcon } from '@/lib/icons';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CARD_TYPES, type CardType, type CollectionEntry } from '@/data/cards';
import { imageUrl } from '@/data/images';
import type { Prices } from '@/data/recycling';
import { useMediaQuery } from '@/hooks/use-media-query';
import { rarityRank } from '@/lib/rarity';
import { CardDetails, CardImage } from './details';
import { collectionOf, filterEntries, num, sortEntries, TYPE_LABELS } from './model';
import { type CollectionSearch, type Sort, SORTS } from './search';

const TYPE_ICONS: Record<CardType, LucideIcon> = {
  combattant: ICONS.fighter,
  magie: ICONS.magic,
  piege: ICONS.trap,
};
const ALL = '__all__';

// Pick mode: whether a card is in the deck, why it cannot join (null if it can), and the toggle.
export type Pick = {
  has: (e: CollectionEntry) => boolean;
  refusal: (e: CollectionEntry) => string | null;
  toggle: (e: CollectionEntry) => void;
};

// prices: the player's copies, the duplicates filter and what recycling pays; none in the
// catalogue, which has one of each card.
export function CardBrowser({
  entries,
  search,
  set,
  images,
  prices,
  pick,
}: {
  entries: CollectionEntry[];
  search: CollectionSearch;
  set: (patch: Partial<CollectionSearch>) => void;
  images: Set<string>;
  prices?: Prices;
  pick?: Pick;
}) {
  const wide = useMediaQuery('(min-width: 1024px)') && !pick;
  // One section per card type (fighters, magics, traps), each sorted; `shown` follows the
  // sections' order, so previous / next walk the grid as it is displayed.
  const sections = useMemo(() => {
    const sorted = sortEntries(filterEntries(entries, search), search.sort);
    return CARD_TYPES.map((type) => ({
      type,
      entries: sorted.filter((e) => e.card.type === type),
    })).filter((s) => s.entries.length);
  }, [entries, search]);
  const shown = useMemo(() => sections.flatMap((s) => s.entries), [sections]);

  const image = (e: CollectionEntry) => imageUrl(e.variant.image_path, images);
  const selectedIndex = shown.findIndex((e) => e.variant.id === search.card);
  const selected = selectedIndex < 0 ? undefined : shown[selectedIndex];
  const step =
    shown.length > 1 && selectedIndex >= 0
      ? (d: 1 | -1) =>
          set({ card: shown[(selectedIndex + d + shown.length) % shown.length]?.variant.id })
      : null;
  const details = selected && (
    <CardDetails
      entry={selected}
      image={image(selected)}
      maxAtq={Math.max(1, ...entries.map((e) => num(e.card.atq)))}
      maxPv={Math.max(1, ...entries.map((e) => num(e.card.pv)))}
      prices={prices}
      onStep={step}
    />
  );

  return (
    <>
      <Toolbar
        entries={entries}
        search={search}
        set={set}
        count={shown.length}
        duplicates={!!prices}
      />
      <div className={`grid items-start gap-6 ${pick ? '' : 'lg:layout-main-aside-22'}`}>
        <div
          className="flex flex-col gap-8"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') step?.(1);
            if (e.key === 'ArrowLeft') step?.(-1);
          }}
        >
          {sections.map(({ type, entries: list }) => {
            const Icon = TYPE_ICONS[type];
            return (
              <section key={type} className="flex flex-col gap-3">
                <h2 className="flex items-center gap-2 border-b pb-2 text-lg font-semibold">
                  <Icon className="size-5" /> {TYPE_LABELS[type].many}
                  <span className="text-sm font-normal text-muted-foreground tabular-nums">
                    {list.length}
                  </span>
                </h2>
                <div className="grid grid-tiles gap-3">
                  {list.map((entry) => (
                    <Tile
                      key={entry.variant.id}
                      entry={entry}
                      image={image(entry)}
                      selected={!pick && entry.variant.id === search.card}
                      onSelect={() => set({ card: entry.variant.id })}
                      pick={pick}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {!shown.length && <p className="text-muted-foreground">Aucune carte ne correspond.</p>}
        </div>
        {wide ? (
          <aside className="sticky top-4 max-h-viewport-inset overflow-y-auto rounded-xl border bg-card p-4 text-card-foreground">
            {details ?? (
              <p className="text-sm text-muted-foreground">
                Choisis une carte pour voir ses détails.
              </p>
            )}
          </aside>
        ) : (
          <Sheet open={!!selected} onOpenChange={(o) => !o && set({ card: undefined })}>
            <SheetContent className="overflow-y-auto">
              <SheetTitle className="sr-only">{selected?.card.nom}</SheetTitle>
              <SheetDescription className="sr-only">Détails de la carte</SheetDescription>
              <div className="p-4">{details}</div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </>
  );
}

function Tile({
  entry,
  image,
  selected,
  onSelect,
  pick,
}: {
  entry: CollectionEntry;
  image: string | null;
  selected: boolean;
  onSelect: () => void;
  pick?: Pick;
}) {
  if (pick) return <PickTile entry={entry} image={image} onDetails={onSelect} pick={pick} />;
  const color = entry.card.raretes.couleur ?? undefined;
  return (
    <CardTooltip entry={entry}>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="group relative rounded-lg transition hover:-translate-y-1 focus-visible:outline-none"
      >
        <CardImage
          entry={entry}
          image={image}
          className={selected ? 'shadow-lg' : 'shadow-sm group-hover:shadow-lg'}
        />
        {/* Rarity: a coloured band at the bottom of the card, a ring of the same colour when selected. */}
        <span
          aria-hidden
          className="absolute inset-x-2 bottom-0 h-1 rounded-full bg-(--rarity)"
          style={{ '--rarity': color }}
        />
        {selected && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-lg ring-4 ring-(--rarity)"
            style={{ '--rarity': color }}
          />
        )}
        {entry.quantite > 1 && (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-background/90 px-2 py-0.5 text-xs font-semibold tabular-nums shadow">
            ×{entry.quantite}
          </span>
        )}
        <span className="sr-only">
          {entry.card.nom}, {entry.card.raretes.nom}
        </span>
      </button>
    </CardTooltip>
  );
}

// A card's name on hover (the grid shows images only); below it, what a click would do, if given.
export function CardTooltip({
  entry,
  hint,
  children,
}: {
  entry: CollectionEntry;
  hint?: string | null;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="flex max-w-60 flex-col">
        <b>{entry.card.nom}</b>
        {hint && <span className="opacity-80">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

// A card in pick mode: in the deck, a check and a ring; refused, dimmed with the reason on hover.
function PickTile({
  entry,
  image,
  onDetails,
  pick,
}: {
  entry: CollectionEntry;
  image: string | null;
  onDetails: () => void;
  pick: Pick;
}) {
  const inDeck = pick.has(entry);
  const refused = inDeck ? null : pick.refusal(entry);
  return (
    <div className="group relative">
      <CardTooltip
        entry={entry}
        hint={refused ?? (inDeck ? 'Clic : retirer du deck' : 'Clic : ajouter au deck')}
      >
        <button
          type="button"
          onClick={() => pick.toggle(entry)}
          aria-pressed={inDeck}
          className={`relative block w-full rounded-lg transition hover:-translate-y-1 focus-visible:outline-none ${
            refused ? 'opacity-40' : ''
          }`}
        >
          <CardImage
            entry={entry}
            image={image}
            className={inDeck ? 'shadow-lg' : 'shadow-sm group-hover:shadow-lg'}
          />
          {inDeck && (
            <>
              <span
                aria-hidden
                className={`pointer-events-none absolute inset-0 rounded-lg ring-4 ${TONES.success.ring}`}
              />
              <span
                className={`absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full shadow ${TONES.success.badge}`}
              >
                <ICONS.done className="size-4" />
              </span>
            </>
          )}
          <span className="sr-only">
            {entry.card.nom},{' '}
            {inDeck ? 'dans le deck' : refused ? 'impossible à ajouter' : 'pas dans le deck'}
          </span>
        </button>
      </CardTooltip>
      <button
        type="button"
        onClick={onDetails}
        aria-label={`Voir ${entry.card.nom}`}
        className="absolute top-1.5 left-1.5 flex size-7 items-center justify-center rounded-full bg-background/90 shadow opacity-80 transition hover:opacity-100"
      >
        <ICONS.zoom className="size-4" />
      </button>
    </div>
  );
}

function Toolbar({
  entries,
  search,
  set,
  count,
  duplicates,
}: {
  entries: CollectionEntry[];
  search: CollectionSearch;
  set: (patch: Partial<CollectionSearch>) => void;
  count: number;
  duplicates: boolean;
}) {
  const groups = [...new Set(entries.map(collectionOf))].sort((a, b) => a.localeCompare(b, 'fr'));
  const rarities = [
    ...new Map(entries.map((e) => [e.card.raretes.nom, e.card.raretes])).values(),
  ].sort((a, b) => rarityRank(a)[0] - rarityRank(b)[0] || rarityRank(a)[1] - rarityRank(b)[1]);
  const filtered = !!(search.q || search.type || search.group || search.rarity || search.dup);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <ICONS.search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <SearchField value={search.q ?? ''} onCommit={(q) => set({ q: q || undefined })} />
      </div>
      <Choice
        label="Type"
        value={search.type}
        options={CARD_TYPES.map((t) => [t, TYPE_LABELS[t].many])}
        all="Tous les types"
        onChange={(v) => set({ type: v as CardType | undefined })}
      />
      <Choice
        label="Collection"
        value={search.group}
        options={groups.map((g) => [g, g])}
        all="Toutes les collections"
        onChange={(v) => set({ group: v })}
      />
      <Choice
        label="Rareté"
        value={search.rarity}
        options={rarities.map((r) => [r.nom, r.nom])}
        all="Toutes les raretés"
        onChange={(v) => set({ rarity: v })}
      />
      {duplicates && (
        <Toggle
          variant="outline"
          pressed={!!search.dup}
          onPressedChange={(p) => set({ dup: p || undefined })}
        >
          Doublons
        </Toggle>
      )}
      <Select
        value={search.sort ?? 'rarete'}
        onValueChange={(v) => set({ sort: v === 'rarete' ? undefined : (v as Sort) })}
      >
        <SelectTrigger aria-label="Trier par">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SORTS) as Sort[]).map((s) => (
            <SelectItem key={s} value={s}>
              Trier par {SORTS[s].toLowerCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="ml-auto text-sm text-muted-foreground tabular-nums">
        {count} carte{count > 1 ? 's' : ''}
      </span>
      {filtered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            set({
              q: undefined,
              type: undefined,
              group: undefined,
              rarity: undefined,
              dup: undefined,
            })
          }
        >
          <ICONS.remove /> Effacer les filtres
        </Button>
      )}
    </div>
  );
}

function Choice({
  label,
  value,
  options,
  all,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: [string, string][];
  all: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{all}</SelectItem>
        {options.map(([v, text]) => (
          <SelectItem key={v} value={v}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// The search text, typed in local state and written to the address 200 ms after the last key: bound
// to the address directly, every key went through the router and re-filtered the whole grid, and
// fast typing could lose characters. A change from outside (filters cleared, back button) replaces
// the text.
function SearchField({ value, onCommit }: { value: string; onCommit: (q: string) => void }) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const commit = useRef(onCommit);
  useEffect(() => {
    commit.current = onCommit;
  });
  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setText(value);
  }, [value]);
  useEffect(() => {
    if (text === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = text;
      commit.current(text);
    }, 200);
    return () => clearTimeout(timer);
  }, [text]);
  return (
    <Input
      placeholder="Rechercher une carte"
      className="pl-8"
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
}
