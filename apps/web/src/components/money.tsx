// Amounts of gold and fragments: the number, then the currency's symbol with its name in a tooltip
// (and for screen readers). The only way the site writes an amount, so every one looks the same.
// Symbols written as escapes: the source stays emoji-free.

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Gain } from '@/data/recycling';

const CURRENCIES = {
  gold: { symbol: '\u{1FA99}', name: 'Gold' },
  fragments: { symbol: '\u{1F9E9}', name: 'Fragments' },
} as const;

function Amount({
  n,
  currency,
  sign,
}: {
  n?: number; // none: the currency symbol alone, standing for the word
  currency: keyof typeof CURRENCIES;
  sign?: boolean;
}) {
  const { symbol, name } = CURRENCIES[currency];
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {sign && n !== undefined && n >= 0 ? '+' : ''}
      {n}
      <Tooltip>
        <TooltipTrigger asChild>
          <span role="img" aria-label={name}>
            {symbol}
          </span>
        </TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>
    </span>
  );
}

export const Gold = (props: { n?: number; sign?: boolean }) => (
  <Amount {...props} currency="gold" />
);
export const Fragments = (props: { n: number; sign?: boolean }) => (
  <Amount {...props} currency="fragments" />
);

// What recycling pays: gold, and fragments when there are some.
export function GainAmount({ gain }: { gain: Gain }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Gold n={gain.gold} sign />
      {gain.fragments > 0 && (
        <>
          · <Fragments n={gain.fragments} sign />
        </>
      )}
    </span>
  );
}
