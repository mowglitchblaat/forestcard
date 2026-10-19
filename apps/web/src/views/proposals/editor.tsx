// The card editor: the assembled card drawn live (render.ts); the drawing moved by dragging (mouse or
// finger) and zoomed with the wheel or the slider (100 to 400 %), "Recentrer" puts it back.

import { ICONS } from '@/lib/icons';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { type Placement, render, type Scene } from './render';

export const SCREEN = { width: 744, height: 1035 };
export const CENTRED: Placement = { zoom: 1, x: 0, y: 0 };

// The first of srcs that loads (in order), or null. The state remembers which list it loaded: a
// new list shows nothing until one of its images loads (no state set inside the effect itself).
export function useFirstImage(srcs: string[]): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ key: string; image: HTMLImageElement | null } | null>(
    null,
  );
  const key = srcs.join('|');
  useEffect(() => {
    if (!key) return;
    const list = key.split('|');
    let cancelled = false;
    let i = 0;
    const img = new Image();
    img.onload = () => !cancelled && setLoaded({ key, image: img });
    img.onerror = () => {
      if (cancelled) return;
      if (++i < list.length) img.src = list[i] as string;
      else setLoaded({ key, image: null });
    };
    img.src = list[0] as string;
    return () => {
      cancelled = true;
    };
  }, [key]);
  return loaded && loaded.key === key ? loaded.image : null;
}

// A chosen file as an image, or null.
export function useFileImage(file: File | null): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ file: File; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setLoaded({ file, image: img });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return loaded && loaded.file === file ? loaded.image : null;
}

export function Editor({
  scene,
  onPlacement,
}: {
  scene: Scene;
  onPlacement: (p: Placement) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  // While dragging, at most one placement per frame: each one re-renders the whole proposal form.
  const frame = useRef<number | null>(null);
  const next = useRef<Placement | null>(null);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const { placement } = scene;

  useEffect(() => {
    if (canvas.current) render(canvas.current, SCREEN.width, SCREEN.height, scene);
  }, [scene]);

  const zoomTo = (z: number) =>
    onPlacement({ ...placement, zoom: Math.max(1, Math.min(4, Math.round(z * 10) / 10)) });

  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvas}
        width={SCREEN.width}
        height={SCREEN.height}
        aria-label="Aperçu de ta carte"
        className={`aspect-proposal w-full touch-none rounded-xl shadow-lg ${
          scene.drawing ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        onPointerDown={(e) => {
          if (!scene.drawing) return;
          drag.current = { x: e.clientX, y: e.clientY, ox: placement.x, oy: placement.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const r = e.currentTarget.getBoundingClientRect();
          next.current = {
            ...placement,
            x: d.ox + (e.clientX - d.x) / r.width,
            y: d.oy + (e.clientY - d.y) / r.height,
          };
          frame.current ??= requestAnimationFrame(() => {
            frame.current = null;
            if (next.current) onPlacement(next.current);
          });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => {
          if (!scene.drawing) return;
          zoomTo(placement.zoom - Math.sign(e.deltaY) * 0.1);
        }}
      />
      {scene.drawing ? (
        <div className="flex items-center gap-3">
          <label className="flex flex-1 items-center gap-2 text-sm">
            Zoom
            <input
              type="range"
              min={100}
              max={400}
              value={Math.round(placement.zoom * 100)}
              onChange={(e) => zoomTo(+e.target.value / 100)}
              className="flex-1 accent-primary"
            />
          </label>
          <Button
            variant="ghost"
            size="sm"
            disabled={
              placement.zoom === CENTRED.zoom &&
              placement.x === CENTRED.x &&
              placement.y === CENTRED.y
            }
            onClick={() => onPlacement(CENTRED)}
          >
            <ICONS.recenter /> Recentrer
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ajoute ton dessin : tu pourras le déplacer à la souris (ou au doigt) et zoomer pour le
          placer dans le cadre.
        </p>
      )}
    </div>
  );
}
