// Combat scene: where the cards stand, and how long each journal line takes (ms). Plain data, like
// booster.ts. Positions are on the 1920 x 1080 stream, a card by its centre.

export type CombatConfig = {
  // the two fighters face to face, each with its magic over its trap on its outer side
  place: {
    y: number;
    fighterX: readonly [number, number];
    fighter: number; // height on screen
    side: number; // a magic's or trap's height
    gap: number; // between a fighter and its magic and trap
    stack: number; // between the magic and the trap
  };
  // The deal: each card flies in from its player's edge of the screen (from `offscreen` px past it), on
  // an arc (`arc` px high), turned by `turn` degrees, and settles. The fighters first, then each side's
  // magic and trap (`stagger` between them).
  // At the end, they fly back out (`out`).
  deal: {
    fly: number;
    settle: number;
    out: number;
    stagger: number;
    offscreen: number;
    arc: number;
    turn: number;
  };
  // the journal line's text, under the cards (the legacy overlay's banner)
  banner: { y: number; size: number; width: number };
  // the pause after each line, by its type (the legacy overlay's waits); `default` for the others
  pace: Readonly<Record<string, number>> & { default: number };
  // The attacker strikes: it draws back leaning away (windup), rushes faster and faster to the other
  // fighter, stretched by its speed (dash), holds at the contact (hold), then comes back (back). `pull`
  // and `reach`: fractions of the distance between the fighters; `lean`: degrees; `stretch`: of its size.
  // The hit itself is the damage line's: the target is pushed back (recoil, px) and flashes.
  lunge: {
    windup: number;
    dash: number;
    hold: number;
    back: number;
    pull: number;
    reach: number;
    lean: number;
    stretch: number;
  };
  recoil: { px: number; ms: number; flash: number };
  // the active fighter stands forward, the other one back
  active: { scale: number; idleAlpha: number };
  // the damage and healing numbers: `size` px (`big`: times that for a heavy hit), landing at `land`
  // times their size, rising `rise` px over their life (`ms`)
  number: { size: number; big: number; land: number; rise: number; ms: number };
  // the players' names, over their fighter (as in the legacy overlay); a longer one shrinks to `maxWidth`
  name: { size: number; above: number; maxWidth: number };
  // A relay (the championship's belts: 3 fighters a team): one light per fighter over the name (the
  // legacy's yellow dots), `size` px each, `above` the name; a fallen one goes out in `fade` ms.
  team: { size: number; above: number; fade: number };
  // Whose turn it is: the active player's name grows (`nameScale`) and turns `gold`, a thread of light
  // (`width` x `height` px, `below` the name's foot) glows under it; the other's name pales (`idleAlpha`).
  turn: {
    nameScale: number;
    gold: number;
    idleAlpha: number;
    width: number;
    height: number;
    below: number;
    ms: number;
  };
  // Each fighter's life bar (scenes/life-bar.ts), under its card, as wide as it (`gap` px under it): the
  // fighter's name, the bar (`height` px), its HP. A hit's red part waits `lagHold` ms, then drains in
  // `lagDrain` ms.
  lifeBar: {
    gap: number;
    height: number;
    spill: number; // how far its waves spill over its edges (px)
    // how fast its liquid moves (1: the shader's own speed): at rest, and right after it changed; it
    // calms down from one to the other in `settle` seconds
    pace: { rest: number; stirred: number; settle: number };
    nameSize: number;
    hpSize: number;
    lagHold: number;
    lagDrain: number;
  };
};

export const COMBAT: CombatConfig = {
  place: { y: 430, fighterX: [660, 1260], fighter: 540, side: 230, gap: 30, stack: 16 },
  deal: { fly: 560, settle: 160, out: 380, stagger: 120, offscreen: 300, arc: 150, turn: 28 },
  banner: { y: 865, size: 40, width: 1500 },
  pace: {
    debut: 600,
    prolongation: 600,
    relais: 600,
    tour: 700,
    // the attacker comes back while the next line (the hit) plays
    attaque: 40,
    frappe: 40,
    degats: 650,
    soin: 650,
    esquive: 900,
    magie: 900,
    piege: 900,
    statut: 800,
    finstatut: 500,
    stat: 500,
    reanim_mort: 1600,
    reanim: 1400,
    fin: 2500,
    default: 700,
  },
  lunge: {
    windup: 190,
    dash: 120,
    hold: 90,
    back: 320,
    pull: 0.05,
    reach: 0.3,
    lean: 6,
    stretch: 0.1,
  },
  recoil: { px: 30, ms: 300, flash: 0.35 },
  active: { scale: 1.04, idleAlpha: 0.82 },
  number: { size: 84, big: 1.35, land: 1.6, rise: 76, ms: 1300 },
  name: { size: 42, above: 24, maxWidth: 420 },
  team: { size: 26, above: 4, fade: 600 },
  turn: {
    nameScale: 1.12,
    gold: 0xffe3a0,
    idleAlpha: 0.7,
    width: 360,
    height: 28,
    below: 3,
    ms: 250,
  },
  lifeBar: {
    gap: 16,
    height: 13,
    spill: 14,
    pace: { rest: 0.4, stirred: 1, settle: 1.5 },
    nameSize: 32,
    hpSize: 29,
    lagHold: 450,
    lagDrain: 700,
  },
};
