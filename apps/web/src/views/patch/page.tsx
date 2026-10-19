// Patch notes, reimagined: one feed by day mixing the author's technical notes and the balance log
// (the legacy page had one tab per source). A day's balance is folded ("3 cartes ajustées") unless
// only the balance is shown; days after the previous visit are marked "Nouveau". Opening the page
// removes the dot on its sidebar entry. The votes, a tab here on the legacy page, have their own
// page (views/votes); the admin's delete button (tranche 4) is not here yet.

import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { TONES } from '@/lib/tones';
import { ICONS } from '@/lib/icons';
import { useEffect, useMemo, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cardKeys, type CollectionEntry, fetchGameCardsFull } from '@/data/cards';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import {
  type BalanceRow,
  fetchBalance,
  fetchPatchNotes,
  type PatchNote,
  patchNotesKeys,
} from '@/data/patchnotes';
import { usePatchNotesFingerprint } from '@/data/patchnotes-query';
import { markSeen, SEEN_KEYS } from '@/lib/seen';
import { catalogueEntries } from '@/views/encyclopedia/model';
import { cardsTouched, changeView, dayLabel, type FeedDay, feed, isNew, latestDay } from './model';
import { PATCH_FILTERS, type PatchFilter } from './search';

const route = getRouteApi('/patch');
const ALL = 'tout';

export function PatchPage() {
  const { filtre } = route.useSearch();
  const navigate = route.useNavigate();
  const notes = useQuery({ queryKey: patchNotesKeys.notes, queryFn: fetchPatchNotes });
  const balance = useQuery({ queryKey: patchNotesKeys.balance, queryFn: fetchBalance });
  const fingerprint = usePatchNotesFingerprint();

  // The day seen at the previous visit, read once on arrival: marking this visit must not remove
  // the "Nouveau" marks while the player reads them.
  const [seenUpTo] = useState(() => localStorage.getItem(SEEN_KEYS.patchNotesUpTo));
  useEffect(() => {
    if (fingerprint) markSeen(SEEN_KEYS.patchNotes, fingerprint);
  }, [fingerprint]);
  useEffect(() => {
    if (!notes.data && !balance.data) return;
    const latest = latestDay(notes.data ?? [], balance.data ?? []);
    if (latest) markSeen(SEEN_KEYS.patchNotesUpTo, latest);
  }, [notes.data, balance.data]);

  const days = useMemo(
    () => feed(notes.data ?? [], balance.data ?? [], filtre),
    [notes.data, balance.data, filtre],
  );

  if (notes.isPending && balance.isPending) return <PageSkeleton />;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">
          Les nouveautés et corrections du jeu, et chaque carte retouchée.
        </p>
        <ToggleGroup
          type="single"
          variant="outline"
          value={filtre ?? ALL}
          onValueChange={(v) =>
            v &&
            void navigate({
              search: { filtre: v === ALL ? undefined : (v as PatchFilter) },
              replace: true,
              resetScroll: false,
            })
          }
        >
          <ToggleGroupItem value={ALL}>Tout</ToggleGroupItem>
          {(Object.keys(PATCH_FILTERS) as PatchFilter[]).map((f) => (
            <ToggleGroupItem key={f} value={f}>
              {PATCH_FILTERS[f]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {notes.error && filtre !== 'equilibrage' && (
        <p role="alert" className="text-sm text-destructive">
          Notes indisponibles pour le moment : {notes.error.message}
        </p>
      )}
      {balance.error && filtre !== 'notes' && (
        <p role="alert" className="text-sm text-destructive">
          Équilibrage indisponible pour le moment : {balance.error.message}
        </p>
      )}
      {days.map((day) => (
        <Day
          key={day.date}
          day={day}
          fresh={isNew(day.date, seenUpTo)}
          balanceOpen={filtre === 'equilibrage'}
        />
      ))}
      {!days.length && !notes.error && !balance.error && (
        <p className="text-muted-foreground">Rien pour l'instant.</p>
      )}
    </div>
  );
}

function Day({ day, fresh, balanceOpen }: { day: FeedDay; fresh: boolean; balanceOpen: boolean }) {
  const touched = cardsTouched(day.balance);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 border-b pb-2 text-lg font-semibold">
        {dayLabel(day.date)}
        {fresh && <Badge variant="new">Nouveau</Badge>}
      </h2>
      {day.notes.map((note, i) => (
        <Note key={i} note={note} />
      ))}
      {day.balance.length > 0 && (
        // Native disclosure: keyboard and screen readers for free.
        <details open={balanceOpen} className="group rounded-xl border bg-card">
          <summary className="flex list-none items-center gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
            Équilibrage · {touched} carte{touched > 1 ? 's' : ''} ajustée{touched > 1 ? 's' : ''}
            <ICONS.expand className="ml-auto size-4 transition group-open:rotate-180" />
          </summary>
          <BalanceList rows={day.balance} />
        </details>
      )}
    </section>
  );
}

function Note({ note }: { note: PatchNote }) {
  return (
    <div className="flex flex-col gap-3">
      {note.intro && <p className="text-muted-foreground">{note.intro}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {note.groupes.map((g) => (
          <div key={g.titre} className="rounded-xl border bg-card p-4 text-card-foreground">
            <h3 className="mb-2 font-semibold">{g.titre}</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {g.points.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// Each row with the card's image and a link to it in the catalogue, when the card is still active.
function BalanceList({ rows }: { rows: BalanceRow[] }) {
  const cards = useQuery({ queryKey: cardKeys.gameCardsFull, queryFn: fetchGameCardsFull });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const byId = useMemo(
    () => new Map(catalogueEntries(cards.data ?? []).map((e) => [e.card.id, e])),
    [cards.data],
  );
  const images = mirror.data ?? new Set<string>();
  return (
    <ul className="divide-y border-t">
      {rows.map((row) => {
        const entry = row.carte_id === null ? undefined : byId.get(row.carte_id);
        return (
          <li key={row.id} className="flex gap-3 px-4 py-3">
            <Thumb
              entry={entry}
              image={entry ? imageUrl(entry.variant.image_path, images) : null}
            />
            <div className="flex min-w-0 flex-col gap-1">
              {entry ? (
                <Link
                  to="/encyclopedie/catalogue"
                  search={{ card: entry.variant.id }}
                  className="font-semibold hover:underline"
                >
                  {row.carte_nom}
                </Link>
              ) : (
                <b>{row.carte_nom}</b>
              )}
              <ul className="flex flex-col gap-0.5 text-sm">
                {row.changements.map((c, i) => (
                  <ChangeLine key={i} change={c} />
                ))}
              </ul>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Thumb({ entry, image }: { entry: CollectionEntry | undefined; image: string | null }) {
  return image ? (
    <img
      loading="lazy"
      src={image}
      alt=""
      className="aspect-5/7 w-10 shrink-0 rounded object-cover"
    />
  ) : (
    <div
      aria-hidden
      className={`aspect-5/7 w-10 shrink-0 rounded ${entry?.card.raretes.couleur ? 'bg-(--rarity)' : 'bg-muted'}`}
      style={{ '--rarity': entry?.card.raretes.couleur ?? undefined }}
    />
  );
}

const TREND = {
  up: { icon: ICONS.up, className: TONES.success.text, label: 'en hausse' },
  down: { icon: ICONS.down, className: TONES.danger.text, label: 'en baisse' },
};

function ChangeLine({ change }: { change: BalanceRow['changements'][number] }) {
  const v = changeView(change);
  if (v.kind === 'added')
    return (
      <li>
        <span className={`font-medium ${TONES.success.text}`}>{v.field}</span>
        {v.value && <> : {v.value}</>}
      </li>
    );
  const trend = v.trend && TREND[v.trend];
  return (
    <li className="flex flex-wrap items-center gap-x-1.5">
      <span className="text-muted-foreground">{v.field} :</span>
      <span className="text-muted-foreground line-through decoration-1">{v.before ?? 'aucun'}</span>
      <ICONS.becomes className="size-3.5 text-muted-foreground" aria-label="devient" />
      <span className={`font-medium ${trend?.className ?? ''}`}>{v.after ?? 'aucun'}</span>
      {trend && <trend.icon className={`size-3.5 ${trend.className}`} aria-label={trend.label} />}
    </li>
  );
}
