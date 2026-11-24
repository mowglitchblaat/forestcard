// The vaults' pieces, shared by the event's vaults (vaults.tsx) and the inventory's mini-vaults
// (views/inventory): a door with its holes, and a drill coming in to make one. The animations live
// in index.css (vault-*).

import type { Hole, Tint } from '@/data/vaults';
import { DOOR, GIGA_DRILL, GIGA_TINTED } from './vault-art';

// A door with its holes; while drills come in, their holes stay hidden until the drill is done.
export function Door({
  tint,
  holes,
  hidden,
  fresh,
  className = '',
}: {
  tint: Tint;
  holes: Hole[];
  hidden?: Set<number>;
  fresh?: Set<number>;
  className?: string;
}) {
  return (
    <div className={`vault-door-shadow relative aspect-square w-full ${className}`}>
      <img
        src={DOOR[tint]}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full select-none"
      />
      {holes
        .filter((h) => !hidden?.has(h.id))
        .map((h) => (
          <span key={h.id}>
            <span
              aria-hidden
              style={{ '--x': h.x, '--y': h.y, '--a': `${h.angle}deg` }}
              className={`absolute ${(h.poids ?? 1) > 1 ? 'vault-crack-giga' : 'vault-crack'}`}
            />
            <span
              aria-hidden
              style={{ '--x': h.x, '--y': h.y, '--a': `${h.angle}deg` }}
              className={`absolute ${(h.poids ?? 1) > 1 ? 'vault-hole vault-hole-giga' : 'vault-hole'} ${h.moi ? 'vault-mine' : ''} ${fresh?.has(h.id) ? 'vault-hole-new' : ''}`}
            />
          </span>
        ))}
    </div>
  );
}

// The drill (assets/cadres/foreuse.webp): its bit points right, its tip at 41 % of its height.
function DrillShape({ giga }: { giga: boolean }) {
  return (
    <img
      src={giga ? GIGA_DRILL : 'cadres/foreuse.webp'}
      alt=""
      draggable={false}
      className={`vault-drill-bit block w-full select-none ${giga && GIGA_TINTED ? 'vault-giga-tint' : ''}`}
    />
  );
}

// The drill coming in to make one hole, with its sparks.
// It comes from outside the door, pointing to its centre; turned upright when it comes from the right.
export function DrillFx({ hole }: { hole: Hole }) {
  const giga = (hole.poids ?? 1) > 1;
  const pointing = (hole.angle + 180) % 360;
  const upsideDown = pointing > 90 && pointing < 270;
  const sparks = [
    [-14, -22],
    [12, -26],
    [20, 6],
    [-18, 10],
    [4, 22],
    [-6, -30],
    ...(giga
      ? [
          [-30, -10],
          [28, -18],
          [24, 24],
          [-26, 26],
          [0, -40],
          [10, 36],
        ]
      : []),
  ];
  return (
    <>
      <span
        aria-hidden
        style={{ '--x': hole.x, '--y': hole.y, '--a': `${pointing}deg` }}
        className={`vault-drill pointer-events-none absolute ${giga ? 'vault-drill-giga' : ''} ${upsideDown ? 'vault-drill-flip' : ''}`}
      >
        <span className="vault-drill-shake block">
          <DrillShape giga={giga} />
        </span>
      </span>
      {sparks.map(([dx, dy], i) => (
        <span
          key={i}
          aria-hidden
          style={{
            '--x': hole.x,
            '--y': hole.y,
            '--dx': `${dx}px`,
            '--dy': `${dy}px`,
            '--delay': `${i * 60}ms`,
          }}
          className={`vault-spark pointer-events-none absolute ${giga ? 'vault-spark-giga' : ''}`}
        />
      ))}
    </>
  );
}
