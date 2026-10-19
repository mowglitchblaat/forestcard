// Recycling duplicates, for one card (its details) or all of them (the stats band): a button held to
// confirm (cards recycled do not come back), what it paid, and the gain rising from the button with
// coins popping out. With no duplicate the button stays, disabled: it shows where recycling lives.
// CSS only: a Lottie animation could replace GainBurst alone, later.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TONES } from '@/lib/tones';
import { ICONS } from '@/lib/icons';
import { HoldButton } from '@/components/hold-button';
import { GainAmount, Gold } from '@/components/money';
import { cardKeys } from '@/data/cards';
import { playerKeys } from '@/data/player';
import { type Gain, recycle, type RecycleResult } from '@/data/recycling';
import { useSession } from '@/lib/session';

// variantId: the duplicates of one card; none: all of them. gain: what it will pay.
export function RecycleBlock({ variantId, gain }: { variantId?: number; gain: Gain }) {
  const userId = useSession()?.user.id ?? '';
  const client = useQueryClient();
  const run = useMutation({
    mutationFn: () => recycle(variantId),
    // Recycled or refused, the collection and the gold are re-read from the database.
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: cardKeys.collection(userId) }),
        client.invalidateQueries({ queryKey: playerKeys.player(userId) }),
      ]),
  });
  const done = run.data;
  const one = variantId !== undefined;
  return (
    <div className="relative flex flex-col gap-2">
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
            <GainAmount gain={gain} />
          </>
        ) : (
          'Recycler les doublons'
        )}
      </HoldButton>
      <p className="text-xs text-muted-foreground">
        {gain.copies
          ? `Tu gardes toujours 1 exemplaire de ${one ? 'la carte' : 'chaque carte'}.`
          : one
            ? 'Aucun doublon de cette carte.'
            : 'Aucun doublon à recycler pour le moment.'}
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
