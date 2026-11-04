// Recycling duplicates, for one card (its details) or all of them (the stats band): a button held to
// confirm (cards recycled do not come back), what it paid, and the gain rising from the button with
// coins popping out. With no duplicate the button stays, disabled: it shows where recycling lives.
// CSS only: a Lottie animation could replace GainBurst alone, later.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TONES } from '@/lib/tones';
import { ICONS } from '@/lib/icons';
import { HoldButton } from '@/components/hold-button';
import { GainAmount, Gold } from '@/components/money';
import { cardKeys } from '@/data/cards';
import { playerKeys } from '@/data/player';
import type { CollectionEntry } from '@/data/cards';
import {
  fragmentsOffered,
  type Gain,
  type PriceTier,
  type Prices,
  recycle,
  recycleMany,
  type RecycleMode,
  type RecycleResult,
  TIER_LABELS,
  tierOfEntry,
  totalGain,
} from '@/data/recycling';
import { useSession } from '@/lib/session';

const TIERS: PriceTier[] = ['commun', 'rare', 'epique', 'legendaire', 'ggez'];
const TIERS_KEY = 'fc_rec_rangs';

// The rarities ticked for recycling every duplicate, kept in this browser (as the legacy page):
// common and rare by default.
function storedTiers(): Set<PriceTier> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(TIERS_KEY) ?? 'null');
    if (Array.isArray(v)) return new Set(TIERS.filter((t) => v.includes(t)));
  } catch {
    // no storage: the default
  }
  return new Set<PriceTier>(['commun', 'rare']);
}

// One card's duplicates (its details): gain is what it will pay.
export function RecycleBlock({
  variantId,
  gain,
  offered = false,
}: {
  variantId: number;
  gain: Gain;
  offered?: boolean;
}) {
  return <Recycler variantId={variantId} gain={gain} offered={offered} />;
}

// Every duplicate of the ticked rarities (the stats band).
export function RecycleAll({ entries, prices }: { entries: CollectionEntry[]; prices: Prices }) {
  const [tiers, setTiers] = useState(storedTiers);
  const picked = entries.filter((e) => e.quantite > 1 && tiers.has(tierOfEntry(e)));
  const toggle = (t: PriceTier, on: boolean) => {
    const next = new Set(tiers);
    if (on) next.add(t);
    else next.delete(t);
    setTiers(next);
    try {
      localStorage.setItem(TIERS_KEY, JSON.stringify([...next]));
    } catch {
      // no storage: kept for this visit
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {TIERS.map((t) => (
          <label key={t} className="flex items-center gap-1 text-xs">
            <Checkbox checked={tiers.has(t)} onChange={(e) => toggle(t, e.target.checked)} />
            {TIER_LABELS[t]}
          </label>
        ))}
      </div>
      <Recycler
        variantIds={picked.map((e) => e.variant.id)}
        gain={totalGain(picked, prices)}
        offered={fragmentsOffered(prices)}
      />
    </div>
  );
}

// The button held to recycle, the choice of gold or fragments (when fragments are installed), and
// what it paid.
function Recycler({
  variantId,
  variantIds,
  gain,
  offered,
}: {
  variantId?: number;
  variantIds?: number[];
  gain: Gain;
  offered: boolean;
}) {
  const userId = useSession()?.user.id ?? '';
  const client = useQueryClient();
  const [mode, setMode] = useState<RecycleMode>('gold');
  const run = useMutation({
    mutationFn: () =>
      variantIds !== undefined ? recycleMany(variantIds, mode) : recycle(variantId, mode),
    // Recycled or refused, the collection and the gold are re-read from the database.
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: cardKeys.collection(userId) }),
        client.invalidateQueries({ queryKey: playerKeys.player(userId) }),
      ]),
  });
  const done = run.data;
  const one = variantId !== undefined;
  const paid: Gain =
    mode === 'fragments'
      ? { copies: gain.copies, gold: 0, fragments: gain.alt ?? 0 }
      : { copies: gain.copies, gold: gain.gold, fragments: gain.fragments };
  return (
    <div className="relative flex flex-col gap-2">
      {offered && gain.copies > 0 && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={mode}
          onValueChange={(v) => v && setMode(v === 'fragments' ? 'fragments' : 'gold')}
        >
          <ToggleGroupItem value="gold" className="flex-1">
            💰 Gold
          </ToggleGroupItem>
          <ToggleGroupItem value="fragments" className="flex-1">
            🧩 Fragments
          </ToggleGroupItem>
        </ToggleGroup>
      )}
      <HoldButton
        variant="outline"
        disabled={!gain.copies || run.isPending}
        onConfirm={() => run.mutate()}
        className="w-full"
      >
        <ICONS.recycle />
        {gain.copies ? (
          <>
            Maintiens pour recycler {gain.copies} doublon{gain.copies > 1 ? 's' : ''} ·{' '}
            <GainAmount gain={paid} />
          </>
        ) : (
          'Recycler les doublons'
        )}
      </HoldButton>
      <p className="text-xs text-muted-foreground">
        {gain.copies
          ? `Tu gardes toujours 1 exemplaire de ${one ? 'la carte' : 'chaque carte'}.${offered ? ' Les fragments servent aux échanges.' : ''}`
          : one
            ? 'Aucun doublon de cette carte.'
            : 'Aucun doublon à recycler pour ces raretés.'}
      </p>
      {done && <Recycled key={run.submittedAt} result={done} />}
      {run.error && (
        <p role="alert" className="text-sm text-destructive">
          {run.error.message}
        </p>
      )}
    </div>
  );
}

function Recycled({ result }: { result: RecycleResult }) {
  return (
    <p
      role="status"
      className={`relative flex items-center gap-2 rounded-lg p-2 text-sm ${TONES.success.box}`}
    >
      <ICONS.recycle className={`size-4 shrink-0 ${TONES.success.text}`} />
      {result.cartes} carte{result.cartes > 1 ? 's' : ''} recyclée{result.cartes > 1 ? 's' : ''} :{' '}
      <GainAmount
        gain={{ copies: result.cartes, gold: result.gold, fragments: result.fragments }}
      />
      <GainBurst gold={result.gold} />
    </p>
  );
}

// The gain rising, coins popping out around it; nothing for whoever asks for less motion.
const COINS = [-48, -30, -12, 12, 30, 48];
function GainBurst({ gold }: { gold: number }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
      <span className="absolute -top-2 font-semibold opacity-0 motion-safe:animate-gain-rise">
        <Gold n={gold} sign />
      </span>
      {COINS.map((dx, i) => (
        <span
          key={dx}
          className="absolute top-0 opacity-0 motion-safe:animate-coin-pop"
          style={{ '--dx': `${dx}px`, '--delay': `${i * 60}ms` }}
        >
          {'\u{1FA99}'}
        </span>
      ))}
    </span>
  );
}
