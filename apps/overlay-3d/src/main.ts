// The WebGL combat overlay (combat-3d.html), for an OBS browser source next to the legacy combat.html.
//
//   in OBS        it listens to Streamer.bot (ws://127.0.0.1:8080, General.Custom), like combat.html,
//                 and plays each combat it receives, one after the other;
//   ?test         a panel to play combats computed here, by the engine, with the cards of the snapshot
//                 (docs/legacy/cartes-*.json): to try the overlay without a live;
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
  playCombat,
  qualityFromUrl,
  readCombatMessage,
  setErrorReporter,
  setQuality,
  type CombatMessage,
  type TextureKeys,
} from '@forestcard/overlay-3d';
import snapshot from '../../../docs/legacy/cartes-2026-10-19.json';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
// before anything is built: the shaders are compiled with it
setQuality(qualityFromUrl(location.search));

// ---- images: the GitHub mirror when the image is there (copied each night), else Supabase ----------
const STORAGE = 'https://bjsvqikjnvaomyoifiml.supabase.co/storage/v1/object/public/cartes/';
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
      if (Array.isArray(list)) mirrored = new Set(list.filter((x): x is string => typeof x === 'string'));
    }
  } catch {
    // no mirror list: Supabase serves every image
  }
}
const imageUrl = (path: string) => (mirrored.has(path) ? MIRROR + encodeURI(path) : STORAGE + path);
// a texture's key is its address: the frames and plaques are the site's own (cadres/…)
const keys: TextureKeys = { imageKey: imageUrl, drawingKey: imageUrl };
const store = new TextureStore((key) => key);

// the composer's frames and plaques, for every type and tier: kept for the page's life
function frameUrls(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const type of ['combattant', 'magie', 'piege'])
    for (const tier of TIERS)
      // no GGEZ magic or trap (config/rarities.ts, allowsType): no frame for them
      if (type === 'combattant' || tier !== 'ggez') out[`cadres/${type}-${tier}.png`] = `cadres/${type}-${tier}.png`;
  for (const tier of TIERS) if (tier !== 'commun') out[`cadres/ecriteau-${tier}.png`] = `cadres/ecriteau-${tier}.png`;
  return out;
}

async function loadFonts(): Promise<void> {
  const wanted = FONTS.filter((f) => f !== 'Arial Black').map((f) => document.fonts.load(`80px "${f}"`));
  await Promise.race([Promise.allSettled(wanted), new Promise((ok) => setTimeout(ok, 4000))]);
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
  const layer = new Container({ label: 'combats' });
  stage.root.addChild(layer);
  await Promise.all([loadFonts(), loadMirror()]);
  // a missing frame is reported and left out: the card falls back on the next one (packages/layout)
  await store.keep(frameUrls()).catch((err: unknown) => console.warn('frames', err));
  const styles = CATEGORY_STYLES as CategoryStyles;

  // the combats, one after the other
  const queue: CombatMessage[] = [];
  let playing = false;
  async function play(m: CombatMessage): Promise<void> {
    queue.push(m);
    if (playing) return;
    playing = true;
    try {
      while (queue.length) {
        const next = queue.shift()!;
        await loadMirror();
        const release = await store.hold(combatTextures(next, keys));
        try {
          await playCombat({ app, stage, layer, deps: { textures: store.textures, styles }, keys }, next);
        } finally {
          release();
        }
      }
    } finally {
      playing = false;
    }
  }

  // Streamer.bot, like combat.html: General.Custom events carry the combat
  if (!params.has('local')) {
    const connect = () => {
      const ws = new WebSocket('ws://127.0.0.1:8080/');
      ws.onopen = () =>
        ws.send(JSON.stringify({ request: 'Subscribe', id: 'sub-combat-3d', events: { General: ['Custom'] } }));
      ws.onmessage = (e) => {
        const m = readCombatMessage(e.data);
        if (m) void play(m);
      };
      ws.onclose = () => setTimeout(connect, 3000);
      ws.onerror = () => ws.close();
    };
    connect();
  }

  if (TEST) {
    const cards = snapshot.map((c): EngineCard & { rarete: string } => {
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
      };
    });
    const pick = (type: string) => {
      const list = cards.filter((c) => c.type === type);
      return list[Math.floor(Math.random() * list.length)]!;
    };
    // a deck: n fighters, n magics, n traps (a relay draws a new trio for each fighter)
    const player = (pseudo: string, n = 1) => ({
      pseudo,
      deck: (['combattant', 'magie', 'piege'] as const).flatMap((t) => Array.from({ length: n }, () => pick(t))),
    });
    const run = (relay: boolean) => {
      const r = relay
        ? simulerRelais(player('Joueur A', 3), player('Joueur B', 3))
        : simuler(player('Joueur A'), player('Joueur B'));
      const m = readCombatMessage({ journal: r.journal, gagnant: r.gagnant });
      if (m) {
        say(queue.length || playing ? 'Combat ajouté à la file' : '');
        void play(m);
      } else say('Combat illisible');
    };
    document.getElementById('fight')?.addEventListener('click', () => run(false));
    document.getElementById('relay')?.addEventListener('click', () => run(true));
    run(false);
  }
}

void main();
