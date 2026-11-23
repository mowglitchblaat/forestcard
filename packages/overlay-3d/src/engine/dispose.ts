// What Pixi does not destroy with a display object: its filters (Container.destroy drops them) and a
// mesh's shader (Mesh.destroy drops it). Left alone, each keeps its uniform buffers, and its bind group
// keeps the textures it reads: an effect on every card shown, for hours of stream. Whatever is made for
// one object goes with it.

import type { Container } from 'pixi.js';

/** Destroys `items` once `owner` is destroyed. An item destroyed before is not hurt (destroy is idempotent). */
export function destroyWith(owner: Container, ...items: { destroy(): void }[]): void {
  owner.once('destroyed', () => {
    for (const it of items) it.destroy();
  });
}
