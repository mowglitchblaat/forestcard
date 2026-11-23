// The WebGL overlays for OBS, next to the legacy pages: combat-3d.html (combats, next to combat.html)
// and booster-3d.html (booster openings, next to overlay.html). The page's mode: <body data-mode>.
//
//   in OBS        it listens to Streamer.bot (ws://127.0.0.1:8080, General.Custom), like the legacy
//                 pages, and plays each combat (or opening) it receives, one after the other;
//   ?test         a panel to play combats computed here by the engine, or openings, with the cards of
//                 the snapshot (docs/legacy/cartes-*.json): to try the overlay without a live;
//   ?qualite=eco  the eco quality (packages/overlay-3d, config/quality.ts): lighter on the GPU.
//
// It only shows: it announces nothing to Streamer.bot (combat.html keeps doing that while both run).

import { Application, Container } from 'pixi.js';
import { CATEGORY_STYLES } from '@forestcard/describe';
import type { Card as EngineCard } from '@forestcard/engine';
import { simuler, simulerRelais } from '@forestcard/journal';
import { FONTS, TIERS, type CategoryStyles } from '@forestcard/layout';
import {
  TextureStore,
  capFrameRate,
  combatTextures,
  createStage,
  decodeImagesAsElements,
  lookupBoosterImage,
  playBooster,
  playCombat,
  qualityFromUrl,
  qualityLevel,
  readBoosterMessage,
  readCombatMessage,
  setErrorReporter,
  setQuality,
  texturesOf,
  toBoosterEvent,
  type BoosterMessage,
  type CombatMessage,
  type TextureKeys,
} from '@forestcard/overlay-3d';
import snapshot from '../../../docs/legacy/cartes-2026-10-19.json';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const MODE = document.body.dataset['mode'] === 'booster' ? 'booster' : 'combat';
// before anything is built: the shaders are compiled with it
setQuality(qualityFromUrl(location.search));

// ---- images: the GitHub mirror when the image is there (copied each night), else Supabase ----------
const SUPABASE = 'https://bjsvqikjnvaomyoifiml.supabase.co';
// the database's public key, like overlay.html: a booster's image is read by its name
const PUBLIC_KEY = 'sb_publishable_-3cPqDCyE-zhb3z5r6dPhg_DJFKGAI6';
const STORAGE = SUPABASE + '/storage/v1/object/public/cartes/';
const MIRROR = 'https://mowglitchblaat.github.io/forestcard/img/';
let mirrored = new Set<string>();
async function loadMirror(): Promise<void> {
  try {
    const r = await Promise.race([
      fetch(MIRROR + 'liste.json', { cache: 'no-cache' }),
      new Promise<null>((ok) => setTimeout(() => ok(null), 2500)),
    ]);
    if (r && r.ok) {
      const list: unknown = await r.json();
      if (Array.isArray(list))
        mirrored = new Set(list.filter((x): x is string => typeof x === 'string'));
    }
  } catch {
    // no mirror list: Supabase serves every image
  }
}
const imageUrl = (path: string) =>
  /^https?:/.test(path) ? path : mirrored.has(path) ? MIRROR + encodeURI(path) : STORAGE + path;
// a texture's key is its address: the frames and plaques are the site's own (cadres/…)
const keys: TextureKeys = { imageKey: imageUrl, drawingKey: imageUrl };
const store = new TextureStore((key) => key);

// the composer's frames and plaques, for every type and tier: kept for the page's life
function frameUrls(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const type of ['combattant', 'magie', 'piege'])
    for (const tier of TIERS)
      // no GGEZ magic or trap (config/rarities.ts, allowsType): no frame for them
      if (type === 'combattant' || tier !== 'ggez')
        out[`cadres/${type}-${tier}.png`] = `cadres/${type}-${tier}.png`;
  for (const tier of TIERS)
    if (tier !== 'commun') out[`cadres/ecriteau-${tier}.png`] = `cadres/ecriteau-${tier}.png`;
  return out;
}

async function loadFonts(): Promise<void> {
  const wanted = FONTS.filter((f) => f !== 'Arial Black').map((f) =>
    document.fonts.load(`80px "${f}"`),
  );
  await Promise.race([Promise.allSettled(wanted), new Promise((ok) => setTimeout(ok, 4000))]);
}

// a booster's image: the message's, else read by the booster's name (overlay.html, boosterImg)
const boosterImages = new Map<string, string | null>();
async function boosterImage(m: BoosterMessage): Promise<string | null> {
  if (m.image_path) return imageUrl(m.image_path);
  if (!boosterImages.has(m.booster)) {
    const rest = SUPABASE + '/rest/v1';
    boosterImages.set(m.booster, await lookupBoosterImage(m.booster, { rest, key: PUBLIC_KEY }));
  }
  const path = boosterImages.get(m.booster);
  return path ? imageUrl(path) : null;
}

async function main(): Promise<void> {
  if (TEST) document.body.classList.add('test');
  const status = document.getElementById('status');
  const say = (t: string) => {
    if (status) status.textContent = t;
  };
  setErrorReporter((err) => {
    console.error('[overlay-3d]', err);
    if (TEST) say('Erreur : ' + String(err instanceof Error ? err.message : err));
  });
  decodeImagesAsElements();
  const app = new Application();
  await app.init({
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
  });
  document.body.appendChild(app.canvas);
  capFrameRate(app);
  const stage = createStage(app);
  const layer = new Container({ label: MODE });
  stage.root.addChild(layer);
  await Promise.all([loadFonts(), loadMirror()]);
  // a missing frame is reported and left out: the card falls back on the next one (packages/layout)
  await store.keep(frameUrls()).catch((err: unknown) => console.warn('frames', err));
  const deps = { textures: store.textures, styles: CATEGORY_STYLES as CategoryStyles };

  async function show(m: CombatMessage | BoosterMessage): Promise<void> {
    await loadMirror();
    if ('journal' in m) {
      const release = await store.hold(combatTextures(m, keys));
      try {
        await playCombat({ app, stage, layer, deps, keys }, m);
      } finally {
        release();
      }
      return;
    }
    // an image that does not load: the generic pack
    let image = await boosterImage(m);
    const release = await store.hold(texturesOf(m, keys));
    let releaseImage = () => {};
    if (image)
      releaseImage = await store.hold([image]).catch(() => {
        image = null;
        return () => {};
      });
    try {
      // the faces keep moving during a flip in full quality only (one more render per card)
      const live = () => qualityLevel() === 'full';
      await playBooster(
        { app, stage, layer, deps, live },
        toBoosterEvent(m, { ...keys, boosterImage: image }),
      );
    } finally {
      releaseImage();
      release();
    }
  }

  // one after the other
  const queue: (CombatMessage | BoosterMessage)[] = [];
  let playing = false;
  async function play(m: CombatMessage | BoosterMessage): Promise<void> {
    queue.push(m);
    if (playing) return;
    playing = true;
    try {
      while (queue.length) await show(queue.shift()!);
    } finally {
      playing = false;
    }
  }

  // Streamer.bot, like the legacy pages: General.Custom events carry the combat or the opening
  if (!params.has('local')) {
    const connect = () => {
      const ws = new WebSocket('ws://127.0.0.1:8080/');
      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            request: 'Subscribe',
            id: `sub-${MODE}-3d`,
            events: { General: ['Custom'] },
          }),
        );
      ws.onmessage = (e) => {
        const m = MODE === 'booster' ? readBoosterMessage(e.data) : readCombatMessage(e.data);
        if (m) void play(m);
      };
      ws.onclose = () => setTimeout(connect, 3000);
      ws.onerror = () => ws.close();
    };
    connect();
  }

  if (TEST) {
    const cards = snapshot.map((c): EngineCard & { rarete: string; couleur: string | null } => {
      const v = c.variantes_carte.find((x) => x.nom === 'Standard') ?? c.variantes_carte[0];
      return {
        id: c.id,
        type: c.type,
        nom: c.nom,
        atq: c.atq ?? undefined,
        pv: c.pv ?? undefined,
        passif: c.passif as EngineCard['passif'],
        ultime: c.ultime as EngineCard['ultime'],
        effet: c.effet as EngineCard['effet'],
        image: v?.image_path ?? null,
        rar: c.raretes ?? null,
        rarete: c.raretes?.nom ?? '—',
        couleur: c.raretes?.couleur ?? null,
      };
    });
    // ?carte=<nom>: Joueur A's fighter, to watch one card's effects
    const forced = cards.find((c) => c.nom === params.get('carte'));
    const pick = (type: string, forceable = false) => {
      if (forceable && forced?.type === type) return forced;
      const list = cards.filter((c) => c.type === type);
      return list[Math.floor(Math.random() * list.length)]!;
    };
    // a deck: n fighters, n magics, n traps (a relay draws a new trio for each fighter)
    const player = (pseudo: string, n = 1) => ({
      pseudo,
      deck: (['combattant', 'magie', 'piege'] as const).flatMap((t) =>
        Array.from({ length: n }, (_, i) => pick(t, pseudo === 'Joueur A' && i === 0)),
      ),
    });
    const fight = (relay: boolean) => {
      const r = relay
        ? simulerRelais(player('Joueur A', 3), player('Joueur B', 3))
        : simuler(player('Joueur A'), player('Joueur B'));
      const m = readCombatMessage({ journal: r.journal, gagnant: r.gagnant });
      if (m) {
        say(queue.length || playing ? 'Combat ajouté à la file' : '');
        void play(m);
      } else say('Combat illisible');
    };
    // an opening of n random cards of the snapshot (?cartes=n, 5 by default), with their rarities
    const open = () => {
      const n = Math.max(1, Math.min(10, Number(params.get('cartes')) || 5));
      const m = readBoosterMessage({
        pseudo: 'Test',
        booster: params.get('booster') ?? 'Booster de test',
        cartes: Array.from({ length: n }, () => {
          const c = cards[Math.floor(Math.random() * cards.length)]!;
          return { carte: c.nom, rarete: c.rarete, couleur: c.couleur, image: c.image };
        }),
      });
      if (m) {
        say(queue.length || playing ? 'Ouverture ajoutée à la file' : '');
        void play(m);
      } else say('Ouverture illisible');
    };
    document.getElementById('fight')?.addEventListener('click', () => fight(false));
    document.getElementById('relay')?.addEventListener('click', () => fight(true));
    document.getElementById('open')?.addEventListener('click', open);
    if (MODE === 'booster') open();
    else fight(false);
  }
}

void main();
