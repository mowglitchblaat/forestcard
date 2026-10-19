// A card that leans toward the pointer, with a glare where the pointer is, and turns over to show
// the player's back, as in the legacy page's card details (.fp, .fi, .tilt, .bk). The tilt is set
// as CSS variables on the element itself, never through React state: moving the pointer renders
// nothing. With reduced motion, no tilt, and the card turns over without animation.

import { ICONS } from '@/lib/icons';
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

const TREE = '\u{1F332}';
// The turn takes 0.7 s; the tilt follows the pointer in 0.12 s.
const TURN_MS = 700;
const TURN_EASE = [0.3, 0.8, 0.3, 1] as const;

// When a cubic-bezier easing reaches half of its progress, as a fraction of the time: the turn is
// edge-on then (90°). Fast at first, this curve gets there at 19 % of the time, not 50 %.
function halfwayTime([x1, y1, x2, y2]: readonly [number, number, number, number]): number {
  const at = (a: number, b: number, s: number) =>
    3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(y1, y2, mid) < 0.5) lo = mid;
    else hi = mid;
  }
  return at(x1, x2, lo);
}
const EDGE_ON_MS = Math.round(TURN_MS * halfwayTime(TURN_EASE));

// The lean toward the pointer, on the element `ref` points at, as CSS variables (--rx, --ry for the
// rotation, --mx, --my for the glare). mirrored: the card shows its back, so it leans the other way.
export function useTilt(mirrored = false) {
  const ref = useRef<HTMLDivElement>(null);
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${((0.5 - py) * 14).toFixed(1)}deg`);
    el.style.setProperty('--ry', `${((px - 0.5) * 18 * (mirrored ? -1 : 1)).toFixed(1)}deg`);
    el.style.setProperty('--mx', `${(px * 100).toFixed(0)}%`);
    el.style.setProperty('--my', `${(py * 100).toFixed(0)}%`);
  };
  const onPointerLeave = () => {
    for (const k of ['--rx', '--ry', '--mx', '--my']) ref.current?.style.removeProperty(k);
  };
  return { ref, handlers: { onPointerMove, onPointerLeave } };
}

// The glare where the pointer is (--mx, --my set by useTilt).
export function Glare() {
  return <div className="pointer-events-none absolute inset-0 glare mix-blend-overlay" />;
}

export function TiltCard({
  front,
  back,
  backName,
  glow,
}: {
  front: ReactNode;
  // The image of the player's back; none: the game's own back.
  back: string | null;
  // "Dos équipé : …" under the button; none while the backs load.
  backName: string | null;
  glow: string;
}) {
  const [flipped, setFlipped] = useState(false);
  // Turned over, the card leans the other way under the same pointer.
  const { ref: card, handlers } = useTilt(flipped);
  const [turning, setTurning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const turn = () => {
    setFlipped((f) => !f);
    setTurning(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTurning(false), TURN_MS + 50);
  };

  const glare = <Glare />;
  // Each face is hidden by visibility, switched when the card is edge-on (--edge-on, EDGE_ON_MS),
  // not by backface-visibility: that one is not inherited, so a face's children drawn on their own
  // layer (art, glare) stayed visible from behind, and the front showed mirrored.
  const face = (shown: boolean) =>
    `transition-all duration-0 motion-reduce:transition-none ${shown ? 'visible' : 'invisible'} ${
      turning ? 'delay-(--edge-on)' : 'delay-0'
    }`;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-full perspective-card" {...handlers}>
        {/* The turn's timing and the card's colour reach CSS as custom properties (index.css: tilt,
            glow-halo, glow-edge). */}
        <div
          ref={card}
          className={`relative tilt transition-transform transform-3d motion-reduce:transition-none ${
            turning ? 'duration-(--turn-ms) ease-(--turn-ease)' : 'duration-120 ease-out'
          }`}
          style={{
            '--turn': flipped ? '180deg' : '0deg',
            '--turn-ms': `${TURN_MS}ms`,
            '--turn-ease': `cubic-bezier(${TURN_EASE.join(',')})`,
            '--edge-on': `${EDGE_ON_MS}ms`,
            '--glow': glow,
          }}
        >
          <div
            className={`relative overflow-hidden rounded-lg glow-halo ${face(!flipped)}`}
            aria-hidden={flipped}
          >
            {front}
            {glare}
          </div>
          <div
            className={`absolute inset-0 flex rotate-y-180 items-center justify-center overflow-hidden rounded-lg border-3 bg-cover bg-center text-6xl glow-halo glow-edge ${
              back ? 'bg-(image:--back)' : 'back-default'
            } ${face(flipped)}`}
            style={{ '--back': back ? `url("${back}")` : undefined }}
            aria-hidden={!flipped}
          >
            {!back && TREE}
            {glare}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" size="sm" onClick={turn}>
          <ICONS.flip /> {flipped ? 'Voir la face' : 'Retourner la carte'}
        </Button>
        {backName && <small className="text-muted-foreground">{backName}</small>}
      </div>
    </div>
  );
}
