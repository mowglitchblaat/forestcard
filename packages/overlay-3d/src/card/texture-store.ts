// The card images a page has loaded, and when they go. A card's drawing or flattened image weighs about
// 14 MB once decoded (1035 x 1440: the decoded image in the page, its copy on the GPU, its mipmaps), and
// a stream shows hundreds of different cards: kept forever, they fill the memory card after card.
//
// Two kinds of textures:
//   kept   the frames, the plaques, the backs: every card reads them, they stay for the page's life;
//   held   a card's drawing or image: loaded when someone holds it, unloaded when the last holder lets
//          it go. A holder is whatever shows the card (a scene, a bench row) and lets go once the card
//          is destroyed: an unloaded texture still drawn would leave the card blank.
//
// `textures` is what the cards read (Deps.textures): a held texture is in it from its load to its unload.

import { Assets, type Texture } from 'pixi.js';
import { cardAsset } from './assets.ts';

/** Lets go of what a `hold` took; calling it again does nothing. */
export type Release = () => void;

export class TextureStore {
  readonly textures: Record<string, Texture> = {};
  private readonly urlOf: (key: string) => string;
  private readonly kept = new Set<string>();
  private readonly holders = new Map<string, number>();
  private readonly loading = new Map<string, Promise<void>>();
  // an unload under way: a new load of the same key waits for it, or Pixi's loader would hand back the
  // texture it is destroying
  private readonly unloading = new Map<string, Promise<void>>();

  constructor(urlOf: (key: string) => string) {
    this.urlOf = urlOf;
  }

  /** Loads textures that stay for the page's life, each from its own address (key -> url). */
  async keep(urls: Readonly<Record<string, string>>): Promise<void> {
    const keys = Object.keys(urls);
    for (const k of keys) this.kept.add(k);
    await Promise.all(keys.map((k) => this.load(k, urls[k])));
  }

  /**
   * Loads what is not loaded yet, and holds every key until the release. Counted from the call, before
   * the loads end: a release by someone else meanwhile does not unload them. A missing file (an image
   * not copied yet) is reported and left out: the card falls back on what it has (card.ts, Face).
   */
  async hold(keys: readonly string[]): Promise<Release> {
    const mine = [...new Set(keys)];
    for (const k of mine) this.holders.set(k, (this.holders.get(k) ?? 0) + 1);
    let released = false;
    const release: Release = () => {
      if (released) return;
      released = true;
      for (const k of mine) this.letGo(k);
    };
    try {
      await Promise.all(mine.map((k) => this.load(k)));
    } catch (err) {
      release();
      throw err;
    }
    return release;
  }

  /** How many keys are loaded, and how many of them are held (the bench shows it). */
  get size(): { loaded: number; held: number } {
    return { loaded: Object.keys(this.textures).length, held: this.holders.size };
  }

  private load(key: string, url = this.urlOf(key)): Promise<void> {
    if (this.textures[key]) return Promise.resolve();
    const running = this.loading.get(key);
    if (running) return running;
    const p = (async () => {
      await this.unloading.get(key);
      try {
        this.textures[key] = await Assets.load<Texture>(cardAsset(key, url));
      } catch (err) {
        console.warn(`texture ${key} (${url}) not loaded`, err);
      }
      // let go of while it loaded: nobody will draw it
      if (!this.kept.has(key) && !this.holders.has(key)) this.unload(key);
    })().finally(() => this.loading.delete(key));
    this.loading.set(key, p);
    return p;
  }

  private letGo(key: string): void {
    const n = (this.holders.get(key) ?? 0) - 1;
    if (n > 0) return void this.holders.set(key, n);
    this.holders.delete(key);
    // still loading: its load unloads it at the end
    if (!this.kept.has(key) && !this.loading.has(key)) this.unload(key);
  }

  private unload(key: string): void {
    if (!this.textures[key]) return;
    delete this.textures[key];
    const p = Assets.unload(key)
      .catch((err: unknown) => console.warn(`texture ${key} not unloaded`, err))
      .finally(() => this.unloading.delete(key));
    this.unloading.set(key, p);
  }
}
