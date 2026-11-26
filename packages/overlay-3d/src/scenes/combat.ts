// Combat scene: replays a combat message's journal, line by line, without computing anything (like the
// legacy combat.html). The two fighters face to face, each with its magic over its trap on its outer
// side, dealt face down on their player's back.
//
// After every line, both fighters' numbers take the line's values (the legacy maj). Then the line plays:
// the table is in docs/plans/overlay-3d.md, "Scène de combat". Every line's text shows in a banner at the
// top: a line with no animation yet stays readable. The scene owns its cards: they are destroyed when it
// ends, whatever happens (engine/player.ts).

import { Container, Text, type Application } from 'pixi.js';
import { Particles } from '../engine/particles.ts';
import { H, W } from '@forestcard/layout';
import type { Card, Hidden } from '../card/card.ts';
import { COMBAT } from '../config/combat.ts';
import { DISPLAY } from '../config/display.ts';
import type { Stage } from '../engine/stage.ts';
import { detach, easing, every, tween, wait } from '../engine/time.ts';
import { runFx } from '../fx/run.ts';
import { toCardData, type BoosterMessageCard, type TextureKeys } from '../input/booster-message.ts';
import type { CombatLine, CombatMessage, CombatPlayer } from '../input/combat-message.ts';
import { CardMarks } from '../marks/host.ts';
import { CardMoves } from '../moves/host.ts';
import { cornerQuad, makeMesh } from '../engine/shader.ts';
import { CardStatuses } from '../status/host.ts';
import { MATTERS, strikeNumber, type Matter } from './combat-number.ts';
import { LifeBar } from './life-bar.ts';
import type { StatusFxKind } from '../status/registry.ts';
import { mechanicsOf } from './combat-fx.ts';
import { cardLayers, dressedCard, textResolutionFor, type Deps } from './common.ts';
import { CombatTerrain } from './terrain.ts';
import { dropTexture } from '../kit/draw.ts';
import { bloodSpurt } from './blood.ts';
import { beltKey, CombatBelts } from './belts.ts';
import { liveNumbers, type LiveNumbers, type NumbersStyle } from './live-numbers.ts';
import { LegacyCanvas } from '../original/fx.ts';
import { legacyEffects } from '../original/effects.ts';

/** `keys`: texture names of an image and of a drawing. */
export type CombatContext = {
  app: Application;
  stage: Stage;
  layer: Container;
  deps: Deps;
  keys: TextureKeys;
  hidden?: Hidden;
  // loads a texture the combat did not announce (a magic's or trap's image known at its reveal only)
  load?: (key: string) => Promise<void>;
  // the numbers' style of each version image (chiffres_cartes), by the fighters' card ids
  numberStyles?: (ids: number[]) => Promise<ReadonlyMap<string, string>>;
};

type Slot = 'fighter' | 'magic' | 'trap';
// What a player's card is built from: the whole card the enriched message carries, else (a legacy
// message) its name and flattened image.
function sourceOf(p: CombatPlayer, slot: Slot): BoosterMessageCard | null {
  const ref = p[slot];
  if (!ref) return null;
  return (
    p.cards?.[slot] ?? {
      carte: ref.name,
      // a fighter shows its image without numbers when it has one: they are written live over it
      image: (slot === 'fighter' ? ref.imageCombat : null) ?? ref.image,
      id: ref.id,
      type: ref.type,
      rarete: ref.rarity,
    }
  );
}
const SLOTS: readonly Slot[] = ['fighter', 'magic', 'trap'];

/** The textures a combat shows (every card of every player, and their backs): to hold while it plays. */
export function combatTextures(m: CombatMessage, keys: TextureKeys): string[] {
  const out = new Set<string>();
  for (const l of m.journal)
    for (const p of l.players ?? []) {
      if (p.back) out.add(keys.imageKey(p.back));
      for (const slot of SLOTS) {
        const src = sourceOf(p, slot);
        if (!src) continue;
        const face = toCardData(src, 0, keys).face;
        const key = face.kind === 'built' ? face.drawing : face.image;
        if (key) out.add(key);
      }
    }
  // the championship's belts (scenes/belts.ts)
  for (const d of [...(m.belts?.[0] ?? []), ...(m.belts?.[1] ?? []), m.title?.division ?? null])
    if (d) out.add(beltKey(d));
  return [...out];
}

// The thread of golden light under the active player's name: it breathes, sparks run from its middle
// to its ends. Added light (the mesh's default blend).
const TURN_THREAD = `
void main(void){
  float x = vUV.x * 2.0 - 1.0, y = vUV.y * 2.0 - 1.0;
  float ends = 1.0 - smoothstep(0.55, 1.0, abs(x));
  float line = exp(-y * y * 26.0) * ends;
  float glow = exp(-y * y * 4.0) * ends * 0.35;
  float breathe = 0.7 + 0.3 * sin(uTime * 3.2);
  float run = fract(uTime * 0.6);
  float spark = exp(-pow((abs(x) - run) * 9.0, 2.0)) * (1.0 - run) * exp(-y * y * 18.0);
  vec3 light = uGold * ((line + glow) * breathe + spark * 1.4) + vec3(1.0) * line * 0.25;
  finalColor = vec4(light * uOn, 0.0);
}`;

// A relay team's fighters over the player's name (the legacy's yellow dots): one light each, the
// fallen ones out. `uCount` dots, the first `uOut` out, the last of them going out over `uFade` (1 -> 0).
const TEAM_DOTS = `
void main(void){
  float n = max(uCount, 1.0);
  vec2 p = vec2(vUV.x * n, vUV.y);
  float k = floor(p.x);
  if (k >= uCount) { finalColor = vec4(0.0); return; }
  vec2 q = vec2(fract(p.x) - 0.5, p.y - 0.5);   // each dot in a square cell
  float r = length(q);
  float on = k < uOut - 1.0 ? 0.0 : (k < uOut ? uFade : 1.0);
  float breathe = 0.85 + 0.15 * sin(uTime * 2.4 + k * 1.3);
  float core = 1.0 - smoothstep(0.16, 0.22, r);
  float glow = exp(-r * r * 30.0) * 0.6;
  vec3 lit = uGold * (core * 1.1 + glow) * breathe + vec3(1.0) * core * 0.3;
  vec3 dead = vec3(0.16, 0.13, 0.1) * core;
  vec3 col = mix(dead, lit, on);
  finalColor = vec4(col, core * (1.0 - on) * 0.9);
}`;

// The legacy statuses by their journal kind (statut / finstatut `k`).
const STATUS_OF: Readonly<Record<string, StatusFxKind>> = {
  poison: 'poison',
  brulure: 'burn',
  saignement: 'bleed',
  malediction: 'curse',
  gel: 'frost',
  glas: 'knell',
  fracture: 'fracture',
  etourdi: 'stun',
  rage: 'rage',
  fatigue: 'fatigue',
  solide: 'solid',
  transc: 'transcendence',
  contamination: 'contamination',
  faiblesse: 'weakness',
  gag: 'gag',
};
// statut lines that end a status
const ENDS: Readonly<Record<string, StatusFxKind>> = {
  eclat_glace: 'frost',
  solide_brise: 'solid',
  etourdi_fin: 'stun',
  glas_mort: 'knell',
};
// Where a status acts (its pulse), by the kind of line, each its own table: the same kind means
// another thing on another line ('poison' on a damage line: the poison deals its damage; on a status
// line: the poison is laid).
// a damage line of that kind: the status dealt it
const ACTS_DAMAGE: Readonly<Record<string, StatusFxKind>> = {
  poison: 'poison',
  brulure: 'burn',
  saignement: 'bleed',
  glas: 'knell',
  gel: 'frost',
  gag: 'gag',
};
// a stat line: the curse takes its ATQ
const ACTS_STAT: Readonly<Record<string, StatusFxKind>> = { malediction_tick: 'curse' };
// a status line: the frost cancels an attack, the stun holds the fighter
const ACTS_STATUS: Readonly<Record<string, StatusFxKind>> = {
  gel_bloque: 'frost',
  etourdi_tour: 'stun',
};
// damage over time does not shake the card
const OVER_TIME = new Set(['poison', 'brulure', 'saignement', 'glas']);

type Fighter = { card: Card; statuses: CardStatuses; marks: CardMarks; moves: CardMoves };
type Side = {
  fighter: Fighter;
  magic: Card | null;
  trap: Card | null;
  scale: number; // the fighter's scale at rest
};

export async function playCombat(ctx: CombatContext, m: CombatMessage): Promise<void> {
  const { app, stage, layer } = ctx,
    P = COMBAT.place;
  const scene = new Container({ label: 'combat' });
  layer.addChild(scene);
  const { cards: cardLayer } = cardLayers(scene);
  const owned: Card[] = [];
  let sides: Side[] = [];
  // the fighter each side shows (its name): a control swaps them (scenes/combat-fx.ts)
  let shown: string[] = [];

  const build = (
    src: BoosterMessageCard,
    back: string | null,
    height: number,
    x: number,
    y: number,
  ) => {
    const data = toCardData(src, 0, ctx.keys);
    const scale = height / H;
    const card = dressedCard(data, ctx.deps, {
      compo: data.compo,
      textResolution: textResolutionFor(scale * stage.scale, app),
      hidden: ctx.hidden ?? DISPLAY.hidden,
      back: back ? ctx.keys.imageKey(back) : undefined,
    });
    card.root.scale.set(scale);
    card.root.position.set(x, y);
    card.show(false);
    card.root.alpha = 0;
    cardLayer.addChild(card.root);
    owned.push(card);
    // a flat face whose image is not there: the back with its name, until its reveal brings one
    if (data.face.kind === 'flat' && !ctx.deps.textures[data.face.image])
      blank.set(card, { src, back });
    return card;
  };
  const blank = new WeakMap<Card, { src: BoosterMessageCard; back: string | null }>();

  // A magic or trap revealed (its line carries its image, img): drawn again with it when it was
  // built without one, before it turns.
  async function revealed(card: Card, l: CombatLine): Promise<Card> {
    const b = blank.get(card),
      img = typeof l.raw['img'] === 'string' && l.raw['img'] ? l.raw['img'] : null;
    if (!b || !img) return card;
    const key = ctx.keys.imageKey(img);
    if (!ctx.deps.textures[key]) await ctx.load?.(key).catch(() => {});
    if (!ctx.deps.textures[key]) return card;
    const name = typeof l.raw['carte'] === 'string' ? l.raw['carte'] : b.src.carte;
    const root = card.root;
    const next = build({ ...b.src, carte: name, image: img }, b.back, P.side, root.x, root.y);
    next.root.scale.copyFrom(root.scale);
    next.root.angle = root.angle;
    next.root.alpha = root.alpha;
    owned.splice(owned.indexOf(card), 1);
    card.destroy();
    return next;
  }

  // a player's magic or trap, at its place; nothing for an empty slot
  const hand0 = (p: CombatPlayer, slot: 'magic' | 'trap', x: number, y: number) => {
    const src = sourceOf(p, slot);
    return src ? build(src, p.back, P.side, x, y) : null;
  };

  // Side i's magic and trap: on its outer side, the magic over the trap.
  const hand = (i: number) => {
    const out = i === 0 ? -1 : 1,
      dy = (P.side + P.stack) / 2;
    const x = P.fighterX[i]! + out * ((P.fighter * W) / H / 2 + P.gap + (P.side * W) / H / 2);
    return { x, magic: P.y - dy, trap: P.y + dy };
  };
  const fighterOf = (card: Card, i: number): Fighter => ({
    card,
    statuses: new CardStatuses(card),
    marks: new CardMarks(card),
    // each steps away from the other
    moves: new CardMoves(card, app, { away: i === 0 ? -1 : 1 }),
  });

  // A card flies in from its player's edge of the screen (side 0: left, 1: right), on an arc, turned,
  // and lands with a little settle.
  async function flyIn(card: Card, side: number): Promise<void> {
    const D = COMBAT.deal,
      root = card.root,
      dir = side === 0 ? -1 : 1;
    const tx = root.x,
      ty = root.y,
      k = root.scale.y;
    const sx = side === 0 ? -D.offscreen : stage.width + D.offscreen;
    // at the start of its flight before it shows: a tween moves it only from the next frame on, and the
    // card would show one frame where it lands
    root.position.set(sx, ty);
    root.angle = dir * D.turn;
    root.alpha = 1;
    await tween(
      D.fly,
      (u) => {
        root.x = sx + (tx - sx) * u;
        root.y = ty - D.arc * Math.sin(Math.PI * u) * (1 - u);
        root.angle = dir * D.turn * (1 - u);
      },
      'out-cubic',
      root,
    );
    await tween(
      D.settle,
      (u) => {
        const v = Math.sin(Math.PI * u) * 0.04;
        root.scale.set(k * (1 + v), k * (1 - v));
      },
      'linear',
      root,
    );
  }

  // A card flies back out to its player's edge.
  async function flyOut(card: Card, side: number): Promise<void> {
    const D = COMBAT.deal,
      root = card.root,
      dir = side === 0 ? -1 : 1;
    const x0 = root.x,
      y0 = root.y;
    const ex = side === 0 ? -D.offscreen : stage.width + D.offscreen;
    await tween(
      D.out,
      (u) => {
        root.x = x0 + (ex - x0) * u;
        root.y = y0 - D.arc * 0.5 * Math.sin(Math.PI * u);
        root.angle = dir * D.turn * u;
      },
      'in-3',
      root,
    );
  }

  // The deal's order: the two fighters together, then, once they stand, each side's magic and trap
  // (they land on the outer side, never crossing a fighter). Going away: the other way round.
  async function inOrder(
    list: readonly Side[],
    each: (c: Card, side: number) => Promise<void>,
    out = false,
  ) {
    const fighters = () => Promise.all(list.map((s, i) => each(s.fighter.card, i)));
    const hands = () =>
      Promise.all(
        list.flatMap((s, i) =>
          [s.magic, s.trap]
            .filter((c) => !!c)
            .map((c, j) => wait(j * COMBAT.deal.stagger).then(() => each(c, i))),
        ),
      );
    if (out) {
      await hands();
      await fighters();
    } else {
      await fighters();
      await hands();
    }
  }

  // Each fighter's life bar, under its card (scenes/life-bar.ts); each player's name, over it.
  const LB = COMBAT.lifeBar;
  const resolution = Math.max(1, stage.scale * app.renderer.resolution);
  const bars = [0, 1].map((i) => {
    const bar = new LifeBar({
      x: P.fighterX[i]!,
      y: P.y + P.fighter / 2 + LB.gap,
      width: (P.fighter * W) / H,
      resolution,
    });
    scene.addChild(bar.root);
    return bar;
  });
  const names = [0, 1].map((i) => {
    const t = new Text({
      text: '',
      anchor: { x: 0.5, y: 1 },
      resolution,
      style: {
        fontFamily: ['Lilita One', 'Arial Black', 'sans-serif'],
        fontSize: COMBAT.name.size,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 5, join: 'round' },
      },
    });
    t.position.set(P.fighterX[i]!, P.y - P.fighter / 2 - COMBAT.name.above);
    t.alpha = 0;
    scene.addChild(t);
    return t;
  });
  // Whose turn it is (the legacy's yellow arrows around the name): the active player's name grows and
  // turns gold, a thread of golden light glows under it; the other's name pales.
  const T = COMBAT.turn;
  const threads = [0, 1].map((i) => {
    const m = makeMesh(
      'combat-turn-thread',
      TURN_THREAD,
      { uTime: Math.random() * 10, uOn: 0, uGold: [1, 0.82, 0.42] },
      { geometry: cornerQuad() },
    );
    m.mesh.scale.set(T.width, T.height);
    m.mesh.position.set(P.fighterX[i]! - T.width / 2, names[i]!.y + T.below - T.height / 2);
    scene.addChild(m.mesh);
    every(m.mesh, (dt) => void (m.u.uTime += dt));
    return m;
  });
  // a long name shrinks to fit (`fit`: its scale at rest)
  const fits = [1, 1];
  function setName(i: number, text: string): void {
    const t = names[i]!;
    t.text = text;
    t.scale.set(1);
    fits[i] = Math.min(1, COMBAT.name.maxWidth / Math.max(1, t.width));
    t.scale.set(fits[i]! * (turnOf === i ? T.nameScale : 1));
  }

  // A relay team's fighters, over the name (TEAM_DOTS): set by the combat's start and by each relay.
  const D = COMBAT.team;
  const dots = [0, 1].map((i) => {
    const m = makeMesh(
      'combat-team-dots',
      TEAM_DOTS,
      { uCount: 0, uOut: 0, uFade: 1, uTime: Math.random() * 10, uGold: [1, 0.82, 0.42] },
      { geometry: cornerQuad(), blend: 'normal' },
    );
    m.mesh.visible = false;
    m.mesh.y = names[i]!.y - COMBAT.name.size * 1.25 - D.size - D.above;
    scene.addChild(m.mesh);
    every(m.mesh, (dt) => void (m.u.uTime += dt));
    return m;
  });
  // `n`: the fighter that comes in (1 for the first); those before it are out, the last one going out now
  function team(i: number, of: number, n: number): void {
    const m = dots[i]!;
    m.mesh.visible = of > 1;
    m.u.uCount = of;
    m.mesh.scale.set(D.size * of, D.size);
    m.mesh.x = P.fighterX[i]! - (D.size * of) / 2;
    const out = n - 1;
    if (out > m.u.uOut) {
      m.u.uOut = out;
      detach(tween(D.fade, (u) => void (m.u.uFade = 1 - u), 'in-out-quad', m.mesh));
    } else m.u.uOut = out;
  }

  let turnOf: 0 | 1 | null = null;
  function showTurn(c: 0 | 1 | null): void {
    if (c === turnOf) return;
    turnOf = c;
    for (const [i, name] of names.entries()) {
      const on = c === i,
        thread = threads[i]!.u;
      const s0 = name.scale.x,
        s1 = fits[i]! * (on ? T.nameScale : 1);
      const a0 = name.alpha,
        a1 = c === null || on ? 1 : T.idleAlpha;
      const o0 = thread.uOn;
      name.tint = on ? T.gold : 0xffffff;
      detach(
        tween(
          T.ms,
          (u) => {
            name.scale.set(s0 + (s1 - s0) * u);
            name.alpha = a0 + (a1 - a0) * u;
            thread.uOn = o0 + ((on ? 1 : 0) - o0) * u;
          },
          'smooth',
          name,
        ),
      );
    }
  }
  // the ATQ a fighter shows: doubled, then the rage added (the legacy's live ATQ)
  const atqShown = (l: CombatLine, i: number) => {
    const b = l.boost?.[i];
    return l.atq[i]! * (b?.[1] ? 2 : 1) + (b?.[0] ?? 0);
  };
  const enterBar = (l: CombatLine, i: number, p: CombatPlayer) =>
    bars[i]!.enter(p.fighter.name, l.pv[i]!, l.max[i]!);

  // The six cards are dealt face down; then the fighters turn, their life bars fill.
  async function deal(l: CombatLine, players: readonly CombatPlayer[]): Promise<void> {
    const next: Side[] = players.map((p, i) => {
      const fx = P.fighterX[i]!,
        h = hand(i);
      const card = build(sourceOf(p, 'fighter')!, p.back, P.fighter, fx, P.y);
      numbersOn(card, p);
      return {
        fighter: fighterOf(card, i),
        magic: hand0(p, 'magic', h.x, h.magic),
        trap: hand0(p, 'trap', h.x, h.trap),
        scale: card.root.scale.x,
      };
    });
    const old = sides;
    sides = next;
    shown = players.map((p) => p.fighter.name);
    await leave(old);
    await inOrder(next, flyIn);
    for (const [i, p] of players.entries()) setName(i, p.pseudo);
    // a relay: each team's first fighter comes in
    const teamSize = num(l.raw['equipe']);
    if (teamSize) for (const i of [0, 1]) team(i, teamSize, 1);
    await tween(300, (u) => {
      for (const t of names) t.alpha = Math.max(t.alpha, u);
    });
    await Promise.all([
      ...next.map((s) => s.fighter.card.flip(app)),
      ...players.map((p, i) => enterBar(l, i, p)),
    ]);
  }

  // Cards going away: back out to their player's edge, then destroyed.
  async function leave(old: readonly Side[]): Promise<void> {
    if (!old.length) return;
    const cards = old.flatMap((s) => [s.fighter.card, s.magic, s.trap]).filter((c) => !!c);
    await inOrder(old, flyOut, true);
    for (const c of cards) c.destroy();
  }

  // A relay: side c's fighter fell; its player sends the next one, with a new magic and trap (face
  // down). The other side keeps everything.
  // A relay: the fallen fighter breaks like in the legacy (combat.html, relais), unless it already lies
  // cut; its magic and trap drop away; the next three fly in from their player's edge.
  async function dropOut(card: Card, n: number): Promise<void> {
    const root = card.root,
      y0 = root.y,
      k = root.scale.x,
      a0 = root.angle;
    await wait((n % 3) * 90);
    await tween(
      650,
      (u) => {
        root.y = y0 + (30 + (n % 3) * 8) * u;
        root.angle = a0 + (n % 2 ? 6 : -6) * u;
        root.scale.set(k * (1 - 0.2 * u));
        root.alpha = 1 - u;
      },
      'in-2',
      root,
    );
  }

  async function relay(l: CombatLine, c: 0 | 1, p: CombatPlayer): Promise<void> {
    const s = sides[c];
    if (!s) return;
    const fallen = s.fighter.card;
    // a fighter taken by the threads (a control) leaves whole; a fallen one breaks
    const broken = l.t === 'relais' && fallen.root.visible && !legacy.isCut(fallen);
    if (broken) {
      await legacy.shatter(fallen);
      await wait(2080);
    } else if (l.t === 'relais') await wait(600);
    const hands = [s.magic, s.trap].filter((x) => !!x);
    await Promise.all([
      ...hands.map((x, n) => dropOut(x, n)),
      ...(broken ? [] : [dropOut(fallen, 2)]),
    ]);
    await wait(150);
    for (const x of [fallen, ...hands]) x.destroy();
    const h = hand(c);
    s.fighter = fighterOf(
      build(sourceOf(p, 'fighter')!, p.back, P.fighter, P.fighterX[c]!, P.y),
      c,
    );
    numbersOn(s.fighter.card, p);
    s.magic = hand0(p, 'magic', h.x, h.magic);
    s.trap = hand0(p, 'trap', h.x, h.trap);
    shown[c] = p.fighter.name;
    // they fly in from their player's edge, like at the deal (liked on the live)
    await inOrder([s], (x) => flyIn(x, c));
    await Promise.all([s.fighter.card.flip(app), enterBar(l, c, p)]);
    const of = num(l.raw['of']);
    if (l.t === 'relais' && of && l.n !== null)
      legacy.say(s.fighter.card, `Combattant ${l.n}/${of}`, '#fcd34d', true);
  }

  // A flat fighter (a legacy message: its image) gets its numbers written live over it, like in
  // combat.html: over its image without numbers, or on medallions over the printed ones (live-numbers.ts).
  const live = new WeakMap<Card, LiveNumbers>();
  let numberStyles: ReadonlyMap<string, string> = new Map();
  function numbersOn(card: Card, p: CombatPlayer): void {
    if (p.cards?.fighter) return;
    const combat = p.fighter.imageCombat ?? null,
      shownImage = combat ?? p.fighter.image;
    const found = shownImage ? numberStyles.get(shownImage) : undefined;
    const style: NumbersStyle | null =
      found === 'or' || found === 'violet' || (found === 'seazer' && combat)
        ? found
        : combat
          ? 'plain'
          : null;
    if (style) live.set(card, liveNumbers(card.front, style));
  }

  // Both fighters' numbers, as the line leaves them (the ATQ shown counts a double and a rage).
  function sync(l: CombatLine): void {
    for (const [i, s] of sides.entries()) {
      s.fighter.card.setStat('pv', l.pv[i]!);
      s.fighter.card.setStat('atq', atqShown(l, i));
      const b = l.boost?.[i];
      live
        .get(s.fighter.card)
        ?.set(atqShown(l, i), l.pv[i]!, b?.[0] ? 'rage' : b?.[1] ? 'x2' : null);
      bars[i]!.set(l.pv[i]!, l.max[i]!);
    }
  }

  // The active fighter stands forward, the other back; null: both at rest.
  function activate(c: 0 | 1 | null): void {
    const A = COMBAT.active;
    showTurn(c);
    for (const [i, s] of sides.entries()) {
      const root = s.fighter.card.root;
      const from = root.scale.x / s.scale,
        to = c === null || i === c ? (i === c ? A.scale : 1) : 1;
      const a0 = root.alpha,
        a1 = c === null || i === c ? 1 : A.idleAlpha;
      detach(
        tween(
          250,
          (u) => {
            root.scale.set(s.scale * (from + (to - from) * u));
            root.alpha = a0 + (a1 - a0) * u;
          },
          'smooth',
          root,
        ),
      );
    }
  }

  // The attacker strikes (COMBAT.lunge): resolves at the contact; it comes back on its own.
  async function lunge(c: 0 | 1, reach: number): Promise<void> {
    const s = sides[c];
    if (!s) return;
    const L = COMBAT.lunge,
      root = s.fighter.card.root;
    const x0 = P.fighterX[c]!,
      dir = c === 0 ? 1 : -1,
      dist = Math.abs(P.fighterX[1] - P.fighterX[0]);
    const k = root.scale.y,
      xb = x0 - dir * dist * L.pull,
      xc = x0 + dir * dist * reach;
    // drawn back, leaning away, gathered
    await tween(
      L.windup,
      (u) => {
        root.x = x0 + (xb - x0) * u;
        root.angle = -dir * L.lean * u;
        root.scale.set(k * (1 - 0.03 * u), k * (1 + 0.03 * u));
      },
      'out-cubic',
      root,
    );
    // the rush: faster and faster, stretched by its speed, leaning into the blow
    await tween(
      L.dash,
      (u) => {
        const v = Math.sin(Math.PI * Math.min(1, u * 1.2));
        root.x = xb + (xc - xb) * u;
        root.angle = dir * L.lean * (2 * u - 1);
        root.scale.set(k * (1 + L.stretch * v), k * (1 - L.stretch * 0.5 * v));
      },
      'in-2',
      root,
    );
    // back, after the hit has landed
    const a1 = root.angle;
    detach(
      wait(L.hold).then(() =>
        tween(
          L.back,
          (u) => {
            root.x = xc + (x0 - xc) * u;
            root.angle = a1 * (1 - u);
            root.scale.set(k);
          },
          'out-cubic',
          root,
        ),
      ),
    );
  }

  // The hit: fighter `c` is pushed back, away from the other, and flashes.
  function recoil(c: 0 | 1, strength: number): void {
    const s = sides[c];
    if (!s) return;
    const R = COMBAT.recoil,
      card = s.fighter.card,
      root = card.root;
    const x0 = P.fighterX[c]!,
      away = c === 0 ? -1 : 1;
    runFx({ fx: 'flash', strength: R.flash * strength }, card.fxContext({ app }));
    detach(
      tween(
        R.ms,
        (u) => {
          // out fast, back slowly
          const p = u < 0.15 ? u / 0.15 : 1 - easing('out-cubic')((u - 0.15) / 0.85);
          root.x = x0 + away * R.px * strength * p;
        },
        'linear',
        root,
      ),
    );
  }

  // A number struck on fighter `c` (scenes/combat-number.ts).
  const sparks = new Particles(scene);
  // blood (a bleeding card): drops in normal blending, over the cards (scenes/blood.ts)
  const blood = new Particles(scene, dropTexture());
  blood.box.blendMode = 'normal';
  const spurt = (c: number, cut = false) =>
    bloodSpurt(scene, blood, P.fighterX[c]!, P.y, P.fighter, cut);
  // the terrain behind everything, and the mechanics' statuses, marks and moves (scenes/combat-fx.ts)
  const terrainLayer = new Container({ label: 'terrain' });
  scene.addChildAt(terrainLayer, 0);
  const terrain = new CombatTerrain(terrainLayer, stage.width, stage.height);
  // the legacy's canvas over the screen, for the author's effects (original/)
  const legacyCanvas = new LegacyCanvas(app);
  const legacy = legacyEffects(app, legacyCanvas);
  const mechanics = mechanicsOf({
    legacy,
    app,
    sides: () => sides,
    terrain,
    sparks,
    at: (c) => ({ x: P.fighterX[c]!, y: P.y, h: P.fighter }),
  });
  function number(c: 0 | 1, label: string, matter: Matter, big: boolean): void {
    if (!sides[c]) return;
    strikeNumber(scene, sparks, {
      x: P.fighterX[c]! + (Math.random() - 0.5) * P.fighter * 0.12,
      y: P.y - P.fighter * 0.12,
      label,
      matter,
      big,
      resolution: Math.max(1, stage.scale * app.renderer.resolution),
    });
  }

  const B = COMBAT.banner;
  const banner = new Text({
    text: '',
    anchor: { x: 0.5, y: 0 },
    resolution: Math.max(1, stage.scale * app.renderer.resolution),
    style: {
      fontFamily: ['Rubik', 'Arial', 'sans-serif'],
      fontWeight: '600',
      fontSize: B.size,
      fill: 0xffffff,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: B.width,
      stroke: { color: 0x000000, width: 5, join: 'round' },
    },
  });
  banner.position.set((P.fighterX[0] + P.fighterX[1]) / 2, B.y);
  scene.addChild(banner);

  // the championship's belts: on each side's fighter, the title's banner (scenes/belts.ts)
  const belts =
    m.title || m.belts?.some((b) => b.length > 0)
      ? new CombatBelts({
          parent: scene,
          textures: ctx.deps.textures,
          title: m.title ?? null,
          belts: m.belts ?? [[], []],
          resolution,
        })
      : null;
  let pseudos: string[] = [];

  async function play(l: CombatLine): Promise<void> {
    banner.text = l.txt;
    if (l.players && (l.t === 'debut' || l.t === 'prolongation')) {
      await deal(l, l.players);
      sync(l);
      if (l.t === 'debut') {
        pseudos = l.players.map((p) => p.pseudo);
        belts?.show(pseudos);
      }
      return;
    }
    if (l.t === 'relais' && l.players && l.c !== null) {
      const of = num(l.raw['of']);
      if (of && l.n !== null) team(l.c, of, l.n);
      await relay(l, l.c, l.players[l.c]!);
      sync(l);
      return;
    }
    // a control (the threads): the puppeteer takes the card, the other player sends another fighter;
    // its end: the cards go back. The strings play, then the sides show who now fights for whom.
    if ((l.t === 'controle' || l.t === 'controle_fin') && l.players && l.c !== null) {
      const from = num(l.raw['from']) === 0 ? 0 : num(l.raw['from']) === 1 ? 1 : null;
      const taking = l.t === 'controle';
      const strung = taking ? from : l.c;
      if (strung !== null) await sides[strung]?.fighter.moves.play(taking ? 'seize' : 'release');
      for (const i of [0, 1] as const)
        if (l.players[i] && l.players[i].fighter.name !== shown[i]) await relay(l, i, l.players[i]);
      sync(l);
      const puppeteer = sides[l.c]?.fighter;
      if (taking && puppeteer) {
        puppeteer.statuses.set('puppet', true);
        detach(puppeteer.marks.set('threads', num(l.raw['n']) ?? 5));
      }
      return;
    }
    sync(l);
    await mechanics(l);
    const s = l.c === null ? null : sides[l.c];
    const f = s?.fighter;
    switch (l.t) {
      case 'tour':
        activate(l.c);
        return;
      case 'magie':
        if (s?.magic && !s.magic.faceUp) {
          s.magic = await revealed(s.magic, l);
          await s.magic.flip(app);
        }
        return;
      case 'piege':
        if (s?.trap && !s.trap.faceUp) {
          s.trap = await revealed(s.trap, l);
          await s.trap.flip(app);
        }
        return;
      case 'attaque':
        if (l.c !== null) await lunge(l.c, COMBAT.lunge.reach);
        return;
      case 'frappe':
        if (l.c !== null) await lunge(l.c, COMBAT.lunge.reach * 0.6);
        return;
      case 'degats': {
        if (!f || l.c === null || l.n === null) return;
        const k = l.k ?? '';
        const big = l.n / Math.max(1, l.max[l.c]!) >= 0.2 && !OVER_TIME.has(k);
        const kind = k in MATTERS ? (k as keyof typeof MATTERS) : big ? 'heavy' : 'hit';
        number(l.c, `−${l.n}`, MATTERS[kind], big);
        if (!OVER_TIME.has(k)) {
          recoil(l.c, big ? 1.4 : 1);
          f.card.shake(big ? 12 : 6, 200);
        }
        const acting = ACTS_DAMAGE[k];
        if (acting) detach(f.statuses.tick(acting));
        if (k === 'saignement') spurt(l.c);
        return;
      }
      case 'soin':
        if (l.c !== null && l.n !== null) number(l.c, `+${l.n}`, MATTERS.heal, false);
        return;
      case 'esquive':
        if (f) detach(f.moves.play('dodge'));
        return;
      case 'stat': {
        const acting = l.k && ACTS_STAT[l.k];
        if (f && acting) detach(f.statuses.tick(acting));
        return;
      }
      case 'statut':
      case 'finstatut': {
        if (!f || !l.k) return;
        const on = l.t === 'statut';
        // marque (the execution's blades): scenes/combat-fx.ts, as the legacy drew them
        if (l.k === 'marque') return;
        // the Knell's shadow on the life bar (combat.html, glasBarre)
        if (l.c !== null) {
          const bar = bars[l.c]!,
            threshold = num(l.raw['s']);
          if (l.k === 'glas') bar.knell(on ? {} : 'off');
          else if (on && (l.k === 'glas_monte' || l.k === 'glas_recul'))
            bar.knell({
              threshold,
              ...(l.k === 'glas_recul' && l.n !== null ? { skulls: l.n } : {}),
            });
          else if (on && l.k === 'glas_mort') bar.knell({ threshold: 100 });
          if (l.k === 'glas_monte' || l.k === 'glas_recul') return;
        }
        if (on && l.k === 'purif') {
          // a purification takes every status but the stun
          for (const kind of Object.values(STATUS_OF))
            if (kind !== 'stun') f.statuses.set(kind, false);
          return;
        }
        const ended = on ? ENDS[l.k] : undefined;
        if (ended) return f.statuses.set(ended, false);
        const acting = on ? ACTS_STATUS[l.k] : undefined;
        if (acting) return detach(f.statuses.tick(acting));
        const kind = STATUS_OF[l.k];
        if (!kind) return;
        const level = num(l.raw['niv']) ?? l.n ?? 1;
        f.statuses.set(kind, on, { level });
        // a bleed laid: the wound opens
        if (on && kind === 'bleed' && l.c !== null) spurt(l.c, true);
        return;
      }
      // reanim_mort, reanim: the card breaks, then comes back together (scenes/combat-fx.ts)
      case 'fin': {
        activate(null);
        const w = num(l.raw['gagnant']);
        belts?.end(w === 0 || w === 1 ? w : null, pseudos);
        for (const [i, side] of sides.entries()) {
          const root = side.fighter.card.root,
            s0 = root.scale.x;
          const won = i === w;
          // the winner glows gold, the loser breaks (legacy: the defeated card shatters; an executed card
          // already lies in two halves)
          if (w !== null && won) detach(side.fighter.moves.play('victory'));
          else if (w !== null && !legacy.isCut(side.fighter.card) && side.fighter.card.root.visible)
            detach(legacy.shatter(side.fighter.card));
          if (won)
            detach(tween(600, (u) => void root.scale.set(s0 * (1 + 0.1 * u)), 'smooth', root));
        }
        return;
      }
    }
  }

  try {
    // the fighters' numbers styles, before the first deal
    const ids = new Set<number>();
    for (const l of m.journal)
      for (const p of l.players ?? []) if (p.fighter.id !== null) ids.add(p.fighter.id);
    if (ctx.numberStyles && ids.size)
      numberStyles = await ctx.numberStyles([...ids]).catch(() => new Map<string, string>());
    for (const l of m.journal) {
      await play(l);
      await wait(COMBAT.pace[l.t] ?? COMBAT.pace.default);
    }
    // the cards go back to their players, the rest fades
    detach(tween(300, (u) => void (banner.alpha = 1 - u)));
    detach(tween(300, (u) => names.forEach((t) => (t.alpha = 1 - u))));
    await Promise.all([leave(sides), ...bars.map((b) => b.leave()), belts?.leave()]);
    sides = [];
  } finally {
    belts?.destroy();
    terrain.destroy();
    legacy.reset();
    legacyCanvas.destroy();
    for (const c of owned) if (!c.root.destroyed) c.destroy();
    scene.destroy({ children: true });
  }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
