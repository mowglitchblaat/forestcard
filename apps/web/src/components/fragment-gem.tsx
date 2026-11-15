// A fragment, drawn: a faceted crystal shard in its kind's colours: the plain fragments of recycling
// (steel blue), and the atelier's rarity fragments: Épique (violet), Légendaire (amber), GGEZ
// (prismatic). Sized on the text around it (1.15 em), for the amounts of components/money.tsx.

import { useId } from 'react';

export type FragmentKind = 'fragments' | 'epique' | 'legendaire' | 'ggez';

// Each shard's colours: an illustration (light, body, shadow), not meanings.
const SHARDS: Record<FragmentKind, { light: string; mid: string; dark: string }> = {
  fragments: { light: '#d4e6f3', mid: '#7aa3c4', dark: '#34526e' },
  epique: { light: '#ecd2ff', mid: '#a855f7', dark: '#4c1a7d' },
  legendaire: { light: '#ffe9a8', mid: '#f59e0b', dark: '#7c4205' },
  ggez: { light: '#ffffff', mid: '#c4b5fd', dark: '#475569' },
};
// The GGEZ shard's rainbow.
const PRISM = ['#ff6b6b', '#ffd166', '#6bff95', '#4cc9f0', '#c77dff'];
const WHITE = '#ffffff';

export function FragmentGem({ kind }: { kind: FragmentKind }) {
  const id = useId();
  const c = SHARDS[kind];
  const left = `${id}-l`;
  const right = `${id}-r`;
  const prism = `${id}-p`;
  return (
    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden className="inline-block">
      <defs>
        <linearGradient id={left} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={c.mid} />
          <stop offset="1" stopColor={c.dark} />
        </linearGradient>
        <linearGradient id={right} x1="1" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor={c.light} />
          <stop offset="1" stopColor={c.mid} />
        </linearGradient>
        <linearGradient id={prism} x1="0" y1="0" x2="1" y2="1">
          {PRISM.map((colour, i) => (
            <stop key={colour} offset={i / (PRISM.length - 1)} stopColor={colour} />
          ))}
        </linearGradient>
      </defs>
      {/* the two halves of the shard, lit from the upper right */}
      <path d="M12 1 L5 7.5 L7 19.5 L12 23 Z" fill={`url(#${left})`} />
      <path d="M12 1 L19 7.5 L17 19.5 L12 23 Z" fill={`url(#${right})`} />
      {/* the GGEZ shard shimmers with every colour */}
      {kind === 'ggez' && (
        <path
          d="M12 1 L19 7.5 L17 19.5 L12 23 L7 19.5 L5 7.5 Z"
          fill={`url(#${prism})`}
          opacity="0.55"
        />
      )}
      {/* the crown's facets and the ridge */}
      <path d="M12 1 L8.5 8 L12 11 L15.5 8 Z" fill={WHITE} opacity="0.35" />
      <path
        d="M5 7.5 L8.5 8 L12 11 L15.5 8 L19 7.5"
        fill="none"
        stroke={c.dark}
        strokeWidth="0.5"
        opacity="0.6"
      />
      <path d="M12 11 L12 23" stroke={WHITE} strokeWidth="0.6" opacity="0.45" />
      <path
        d="M12 1 L19 7.5 L17 19.5 L12 23 L7 19.5 L5 7.5 Z"
        fill="none"
        stroke={c.dark}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      {/* a glint */}
      <path d="M15.2 4.6 L16.4 5.8" stroke={WHITE} strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
