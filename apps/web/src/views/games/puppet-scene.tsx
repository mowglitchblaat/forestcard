// The spot-the-differences game's scenes: a puppet theatre (Marionnettia), drawn from the day's seed
// (differences_jour.graine, db/migrations/89-jeux-differences-ombres.sql). The same seed always
// draws the same pair of scenes: a reload shows the same game. The second scene is the first with
// `count` changes, each on a different element (a puppet's hat, a star, the lantern…), so every
// change is one difference to count; `marks` says where each one is, circled once the game is over.

import { TONES } from '@/lib/tones';

// The scenes' own colours: an illustration (a stage, puppets, a paper screen), not meanings; the
// meaning colours of the site stay in TONES.
export const SCENE = {
  ink: '#1b1b1b',
  nightShade: '#1f2a4d',
  bird: '#2c3e50',
  iron: '#2d2d2d',
  darkWood: '#3b2a1e',
  bar: '#6b4423',
  boards: '#7a4a24',
  bow: '#c0392b',
  blush: '#e8798a',
  skin: '#f1d3b0',
  beak: '#f2b134',
  moon: '#fdf1b8',
  flame: '#ffd76a',
  star: '#fff6c8',
  nightEdge: '#141b33',
  nightGlow: '#3a4a7a',
  plank: '#5a3418',
  thread: '#d9d2c3',
  flameOff: '#4a4a4a',
  curtainRed: '#8e1b2c',
  curtainPlum: '#5b1f6b',
  curtainBlue: '#1f4f6b',
  frame: '#4a2a12',
  paperEdge: '#8a4f1d',
  paper: '#e9b46a',
  paperGlow: '#fbe7bf',
};

// The puppets' clothes, the flags, the chest.
const PALETTE = ['#d64545', '#3a7bd5', '#f2b134', '#3fae6a', '#9b59b6', '#f07f2e', '#ecf0f1'];
const HATS = ['cone', 'top', 'crown', 'none'] as const;

type Puppet = {
  x: number;
  body: string;
  hat: (typeof HATS)[number];
  hatColour: string;
  buttons: number;
  arm: 'left' | 'right';
  mouth: 'smile' | 'o';
  bow: boolean;
  cheeks: boolean;
};

type Scene = {
  moon: 'full' | 'crescent';
  moonX: number;
  stars: { x: number; y: number }[];
  curtain: string;
  tassel: string;
  flags: string[];
  lantern: boolean;
  chest: string;
  bird: boolean;
  puppets: Puppet[];
};

export type PuppetGame = { a: Scene; b: Scene; marks: { x: number; y: number }[] };

// A small seeded generator (mulberry32): the same seed, the same numbers.
function generator(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function puppetGame(seed: number, count: number): PuppetGame {
  const rnd = generator(seed);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)] as T;
  const other = <T,>(list: readonly T[], not: T): T => pick(list.filter((v) => v !== not));
  const a: Scene = {
    moon: rnd() < 0.5 ? 'full' : 'crescent',
    moonX: 60 + Math.floor(rnd() * 200),
    stars: Array.from({ length: 6 }, (_, i) => ({
      x: 45 + i * 45 + Math.floor(rnd() * 20),
      y: 35 + Math.floor(rnd() * 30),
    })),
    curtain: pick([SCENE.curtainRed, SCENE.curtainPlum, SCENE.curtainBlue]),
    tassel: pick(PALETTE),
    flags: Array.from({ length: 7 }, () => pick(PALETTE)),
    lantern: rnd() < 0.5,
    chest: pick(PALETTE),
    bird: rnd() < 0.5,
    puppets: [80, 160, 240].map((x) => ({
      x,
      body: pick(PALETTE),
      hat: pick(HATS),
      hatColour: pick(PALETTE),
      buttons: 1 + Math.floor(rnd() * 3),
      arm: rnd() < 0.5 ? 'left' : 'right',
      mouth: rnd() < 0.5 ? 'smile' : 'o',
      bow: rnd() < 0.5,
      cheeks: rnd() < 0.5,
    })),
  };
  // The stars stay clear of the moon.
  a.stars = a.stars.filter((s) => Math.abs(s.x - a.moonX) > 26);

  const b: Scene = structuredClone(a);
  // Every possible change, each on its own element: where it shows (its part: two changes on the
  // same part would read as one), and what it does to the second scene.
  type Change = { at: { x: number; y: number }; apply: () => void };
  const star = Math.floor(rnd() * b.stars.length);
  const flag = Math.floor(rnd() * b.flags.length);
  const changes: Change[] = [
    { at: { x: b.moonX, y: 45 }, apply: () => (b.moon = b.moon === 'full' ? 'crescent' : 'full') },
    { at: b.stars[star] ?? { x: 0, y: 0 }, apply: () => b.stars.splice(star, 1) },
    { at: { x: 30, y: 120 }, apply: () => (b.tassel = other(PALETTE, b.tassel)) },
    {
      at: { x: 40 + flag * 40, y: 14 },
      apply: () => (b.flags[flag] = other(PALETTE, b.flags[flag] ?? '')),
    },
    { at: { x: 272, y: 168 }, apply: () => (b.lantern = !b.lantern) },
    { at: { x: 48, y: 186 }, apply: () => (b.chest = other(PALETTE, b.chest)) },
    { at: { x: 205, y: 26 }, apply: () => (b.bird = !b.bird) },
  ];
  for (const p of b.puppets) {
    changes.push(
      { at: { x: p.x, y: 131 }, apply: () => (p.body = other(PALETTE, p.body)) },
      { at: { x: p.x, y: 131 }, apply: () => (p.buttons = p.buttons === 1 ? 2 : p.buttons - 1) },
      { at: { x: p.x, y: 78 }, apply: () => (p.hat = other(HATS, p.hat)) },
      { at: { x: p.x, y: 121 }, apply: () => (p.arm = p.arm === 'left' ? 'right' : 'left') },
      { at: { x: p.x, y: 99 }, apply: () => (p.mouth = p.mouth === 'smile' ? 'o' : 'smile') },
      { at: { x: p.x, y: 110 }, apply: () => (p.bow = !p.bow) },
      { at: { x: p.x, y: 99 }, apply: () => (p.cheeks = !p.cheeks) },
    );
    // A hat's colour shows only on a hat.
    if (p.hat !== 'none')
      changes.push({
        at: { x: p.x, y: 78 },
        apply: () => (p.hatColour = other(PALETTE, p.hatColour)),
      });
  }
  const marks: { x: number; y: number }[] = [];
  const used = new Set<string>();
  while (marks.length < count && changes.length) {
    const [change] = changes.splice(Math.floor(rnd() * changes.length), 1);
    if (!change) break;
    const part = `${change.at.x}:${change.at.y}`;
    if (used.has(part)) continue;
    used.add(part);
    change.apply();
    marks.push(change.at);
  }
  return { a, b, marks };
}

function PuppetFigure({ p }: { p: Puppet }) {
  const { x } = p;
  const armUp = (side: 'left' | 'right') => p.arm === side;
  return (
    <g>
      {/* The strings, from the control bar. */}
      <g stroke={SCENE.thread} strokeWidth="0.6" opacity="0.8">
        <line x1={x} y1="30" x2={x} y2="84" />
        <line x1={x - 18} y1="30" x2={x - 18} y2={armUp('left') ? 98 : 140} />
        <line x1={x + 18} y1="30" x2={x + 18} y2={armUp('right') ? 98 : 140} />
      </g>
      <rect x={x - 24} y="28" width="48" height="4" rx="2" fill={SCENE.bar} />
      {/* Arms. */}
      <g stroke={SCENE.skin} strokeWidth="4" strokeLinecap="round">
        <line x1={x - 13} y1="116" x2={x - 18} y2={armUp('left') ? 98 : 140} />
        <line x1={x + 13} y1="116" x2={x + 18} y2={armUp('right') ? 98 : 140} />
      </g>
      {/* Legs. */}
      <g stroke={SCENE.darkWood} strokeWidth="4" strokeLinecap="round">
        <line x1={x - 7} y1="150" x2={x - 9} y2="172" />
        <line x1={x + 7} y1="150" x2={x + 9} y2="172" />
      </g>
      {/* Body. */}
      <path d={`M${x - 12} 110 L${x + 12} 110 L${x + 17} 152 L${x - 17} 152 Z`} fill={p.body} />
      {Array.from({ length: p.buttons }, (_, i) => (
        <circle key={i} cx={x} cy={122 + i * 9} r="2" fill={SCENE.ink} />
      ))}
      {p.bow && (
        <path
          d={`M${x} 110 L${x - 8} 105 L${x - 8} 115 Z M${x} 110 L${x + 8} 105 L${x + 8} 115 Z`}
          fill={SCENE.bow}
        />
      )}
      {/* Head. */}
      <circle cx={x} cy="96" r="13" fill={SCENE.skin} />
      <circle cx={x - 5} cy="93" r="1.8" fill={SCENE.ink} />
      <circle cx={x + 5} cy="93" r="1.8" fill={SCENE.ink} />
      {p.cheeks && (
        <g fill={SCENE.blush} opacity="0.8">
          <circle cx={x - 8} cy="99" r="2.6" />
          <circle cx={x + 8} cy="99" r="2.6" />
        </g>
      )}
      {p.mouth === 'smile' ? (
        <path
          d={`M${x - 5} 101 Q${x} 106 ${x + 5} 101`}
          stroke={SCENE.ink}
          strokeWidth="1.4"
          fill="none"
        />
      ) : (
        <circle cx={x} cy="103" r="2.4" fill={SCENE.ink} />
      )}
      {/* Hat. */}
      {p.hat === 'cone' && <path d={`M${x - 11} 86 L${x} 62 L${x + 11} 86 Z`} fill={p.hatColour} />}
      {p.hat === 'top' && (
        <g fill={p.hatColour}>
          <rect x={x - 15} y="83" width="30" height="4" rx="1" />
          <rect x={x - 9} y="66" width="18" height="18" rx="1" />
        </g>
      )}
      {p.hat === 'crown' && (
        <path
          d={`M${x - 11} 86 L${x - 11} 72 L${x - 5} 79 L${x} 68 L${x + 5} 79 L${x + 11} 72 L${x + 11} 86 Z`}
          fill={p.hatColour}
        />
      )}
    </g>
  );
}

// One scene. `marks`: the differences to circle (the result, once the game is over).
export function PuppetScene({
  scene: s,
  marks,
  label,
}: {
  scene: Scene;
  marks?: { x: number; y: number }[];
  label: string;
}) {
  return (
    <svg viewBox="0 0 320 220" role="img" aria-label={label} className="w-full rounded-lg">
      <defs>
        <radialGradient id="spot" cx="50%" cy="85%" r="60%">
          <stop offset="0%" stopColor={SCENE.nightGlow} />
          <stop offset="100%" stopColor={SCENE.nightEdge} />
        </radialGradient>
      </defs>
      <rect width="320" height="220" fill="url(#spot)" />
      {/* The night backdrop. */}
      {s.stars.map((st, i) => (
        <path
          key={i}
          d={`M${st.x} ${st.y - 4} L${st.x + 1.2} ${st.y - 1.2} L${st.x + 4} ${st.y} L${st.x + 1.2} ${st.y + 1.2} L${st.x} ${st.y + 4} L${st.x - 1.2} ${st.y + 1.2} L${st.x - 4} ${st.y} L${st.x - 1.2} ${st.y - 1.2} Z`}
          fill={SCENE.star}
        />
      ))}
      <circle cx={s.moonX} cy="45" r="13" fill={SCENE.moon} />
      {s.moon === 'crescent' && <circle cx={s.moonX + 7} cy="41" r="12" fill={SCENE.nightShade} />}
      {/* The boards. */}
      <rect y="172" width="320" height="48" fill={SCENE.boards} />
      <g stroke={SCENE.plank} strokeWidth="1">
        <line x1="0" y1="186" x2="320" y2="186" />
        <line x1="0" y1="202" x2="320" y2="202" />
      </g>
      {/* The chest and the lantern. */}
      <rect x="34" y="176" width="28" height="18" rx="2" fill={s.chest} stroke={SCENE.darkWood} />
      <rect x="34" y="182" width="28" height="2" fill={SCENE.darkWood} />
      <rect x="264" y="158" width="16" height="20" rx="3" fill={SCENE.iron} />
      <rect
        x="267"
        y="161"
        width="10"
        height="14"
        rx="2"
        fill={s.lantern ? SCENE.flame : SCENE.flameOff}
      />
      {s.lantern && <circle cx="272" cy="168" r="16" fill={SCENE.flame} opacity="0.18" />}
      {s.puppets.map((p) => (
        <PuppetFigure key={p.x} p={p} />
      ))}
      {/* The curtains, their tassels, the valance and its flags. */}
      <path d="M0 0 L36 0 Q22 90 30 172 L0 172 Z" fill={s.curtain} />
      <path d="M320 0 L284 0 Q298 90 290 172 L320 172 Z" fill={s.curtain} />
      <circle cx="30" cy="120" r="5" fill={s.tassel} />
      <circle cx="290" cy="120" r="5" fill={s.tassel} />
      <rect width="320" height="10" fill={s.curtain} />
      {s.flags.map((f, i) => (
        <path key={i} d={`M${30 + i * 40} 8 L${50 + i * 40} 8 L${40 + i * 40} 22 Z`} fill={f} />
      ))}
      {s.bird && (
        <g>
          <ellipse cx="205" cy="26" rx="7" ry="5" fill={SCENE.bird} />
          <circle cx="210" cy="22" r="3.5" fill={SCENE.bird} />
          <path d="M213 22 L217 23 L213 24 Z" fill={SCENE.beak} />
        </g>
      )}
      {marks?.map((m, i) => (
        <circle
          key={i}
          cx={m.x}
          cy={m.y}
          r="13"
          fill="none"
          stroke={TONES.success.colour}
          strokeWidth="2.5"
          strokeDasharray="4 3"
        />
      ))}
    </svg>
  );
}
