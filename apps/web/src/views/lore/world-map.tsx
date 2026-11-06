// Lore > Carte (64-lore-carte-calques.sql): the interactive world map. The blank map is covered by
// a drifting fog, except around the revealed places' layers (transparent images the size of the map,
// laid on it). Hovering a layer lights it up; a click opens the place's menu: its collection (the
// collection page filtered on it), the boosters of its collection (to the shop) and its chapter of
// the story. A place revealed since the player's last visit lifts its fog in front of them.
// The fog's holes and the hover test come from the layers' own transparency, read once in a canvas
// (the images are served with CORS). A place without a layer is a pin.

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type MouseEvent, type PointerEvent, useEffect, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { fetchWorldMap, loreKeys, type Place } from '@/data/lore';
import { fetchContents, fetchShop, shopKeys } from '@/data/shop';
import { ICONS } from '@/lib/icons';

// The places a player has seen revealed (this browser): a new one lifts its fog once.
const SEEN_KEY = 'fc-lore-lieux-vus';
const readSeen = (): number[] | null => {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as number[]) : null;
  } catch {
    return null;
  }
};
const writeSeen = (ids: number[]) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    // private window: the reveal plays again next time, no harm
  }
};

// The canvases work at a quarter of the map's size: enough for a soft fog edge and the hover test.
const SCALE = 0.25;

type Hit = { place: number; width: number; height: number; alpha: Uint8ClampedArray };
type Built = { mask: string; fresh: string | null; hits: Hit[] };

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((done, fail) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => done(img);
    img.onerror = () => fail(new Error('image'));
    img.src = src;
  });

// A seamless cloud texture (periodic value noise, a few octaves), drawn once.
function cloudTile(size = 256): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const data = ctx.createImageData(size, size);
  const octaves = [4, 8, 16, 32];
  const grids = octaves.map((g) => Array.from({ length: g * g }, () => Math.random()));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sample = (grid: number[], g: number, x: number, y: number) => {
    const gx = (x / size) * g;
    const gy = (y / size) * g;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smooth(gx - x0);
    const ty = smooth(gy - y0);
    const at = (i: number, j: number) => grid[((j + g) % g) * g + ((i + g) % g)] ?? 0;
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      let weight = 0.5;
      let total = 0;
      octaves.forEach((g, k) => {
        v += sample(grids[k] ?? [], g, x, y) * weight;
        total += weight;
        weight /= 2;
      });
      v /= total;
      const i = (y * size + x) * 4;
      const shade = 200 + v * 55;
      data.data[i] = shade;
      data.data[i + 1] = shade + 4;
      data.data[i + 2] = shade + 12;
      data.data[i + 3] = Math.max(0, Math.min(255, (v - 0.2) * 420));
    }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

// Reads the layers once: their alpha for the hover test, and the fog's mask (opaque where the fog
// stays, a soft hole around every layer, the frame of the map always clear). `fresh`: the mask of
// the places revealed since the last visit only, for the fog that lifts in front of the player.
async function build(
  layers: { place: number; url: string }[],
  freshPlaces: Set<number>,
  width: number,
  height: number,
): Promise<Built> {
  const w = Math.round(width * SCALE);
  const h = Math.round(height * SCALE);
  const images = await Promise.all(
    layers.map(async (l) => ({ ...l, img: await loadImage(l.url).catch(() => null) })),
  );
  const hits: Hit[] = [];
  const read = document.createElement('canvas');
  read.width = w;
  read.height = h;
  const rctx = read.getContext('2d', { willReadFrequently: true });
  for (const l of images) {
    if (!l.img || !rctx) continue;
    rctx.clearRect(0, 0, w, h);
    rctx.drawImage(l.img, 0, 0, w, h);
    const px = rctx.getImageData(0, 0, w, h).data;
    const alpha = new Uint8ClampedArray(w * h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3] ?? 0;
    hits.push({ place: l.place, width: w, height: h, alpha });
  }
  const holes = (ctx: CanvasRenderingContext2D, only?: Set<number>) => {
    ctx.filter = `blur(${Math.round(w / 90)}px)`;
    for (const l of images)
      if (l.img && (!only || only.has(l.place)))
        for (let k = 0; k < 3; k++) ctx.drawImage(l.img, 0, 0, w, h);
    ctx.filter = 'none';
  };
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext('2d');
  if (mctx) {
    mctx.fillStyle = '#fff';
    mctx.fillRect(0, 0, w, h);
    mctx.globalCompositeOperation = 'destination-out';
    // the frame, the title (top left) and the compass (bottom right) stay clear, softly
    const edge = Math.round(w * 0.012);
    mctx.fillRect(0, 0, w, edge);
    mctx.fillRect(0, h - edge, w, edge);
    mctx.fillRect(0, 0, edge, h);
    mctx.fillRect(w - edge, 0, edge, h);
    mctx.filter = `blur(${Math.round(w / 60)}px)`;
    mctx.beginPath();
    mctx.ellipse(w * 0.085, h * 0.065, w * 0.11, h * 0.09, 0, 0, Math.PI * 2);
    mctx.ellipse(w * 0.965, h * 0.9, w * 0.05, h * 0.11, 0, 0, Math.PI * 2);
    mctx.fill();
    mctx.filter = 'none';
    holes(mctx);
  }
  let fresh: string | null = null;
  if (freshPlaces.size) {
    const f = document.createElement('canvas');
    f.width = w;
    f.height = h;
    const fctx = f.getContext('2d');
    if (fctx) {
      holes(fctx, freshPlaces);
      fresh = f.toDataURL('image/png');
    }
  }
  return { mask: mask.toDataURL('image/png'), fresh, hits };
}

// The place under a point of the map (0..1), topmost layer first.
const placeAt = (hits: Hit[], u: number, v: number): number | null => {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (!h) continue;
    const x = Math.floor(u * h.width);
    const y = Math.floor(v * h.height);
    if (x < 0 || y < 0 || x >= h.width || y >= h.height) continue;
    if ((h.alpha[y * h.width + x] ?? 0) > 60) return h.place;
  }
  return null;
};

// What the players see, even for the admin (who also gets the hidden places): the revealed places,
// their public layers, and each layer's address.
function visible(places: Place[], img: (path: string | null) => string | null) {
  const shown = places
    .filter((p) => p.revele)
    .map((p) => ({ ...p, lore_calques: p.lore_calques.filter((l) => !l.prive) }));
  const layers = shown.flatMap((p) =>
    p.lore_calques.flatMap((l) => {
      const url = img(l.image_path);
      return url ? [{ id: l.id, place: p.id, url }] : [];
    }),
  );
  return { places: shown, layers };
}

export function WorldMap() {
  const map = useQuery({ queryKey: loreKeys.map, queryFn: fetchWorldMap });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const shop = useQuery({ queryKey: shopKeys.offers, queryFn: fetchShop });
  const contents = useQuery({ queryKey: shopKeys.contents, queryFn: fetchContents });
  const images = mirror.data ?? new Set<string>();
  const img = (path: string | null) => imageUrl(path, images);

  const { places, layers } = visible(map.data?.places ?? [], img);
  const picture = img(map.data?.image ?? null);

  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [built, setBuilt] = useState<Built | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [lifting, setLifting] = useState(false);
  // drawn once, on the first render
  const [tile] = useState(cloudTile);
  const [hover, setHover] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ place: Place; x: number; y: number } | null>(null);
  const [details, setDetails] = useState<Place | null>(null);
  const [boostersOpen, setBoostersOpen] = useState(false);

  // Reads the layers again when the map, the places or the image addresses change.
  useEffect(() => {
    if (!size || !map.data) return;
    const shown = visible(map.data.places, (path) => imageUrl(path, mirror.data ?? new Set()));
    const ids = shown.places.map((p) => p.id);
    const seen = readSeen();
    // the very first visit lifts nothing: everything already there is just there
    const newly = new Set(seen ? ids.filter((id) => !seen.includes(id)) : []);
    let alive = true;
    void build(shown.layers, newly, size.width, size.height).then((b) => {
      if (!alive) return;
      setBuilt(b);
      setFresh(newly);
      setLifting(false);
      writeSeen(ids);
      if (newly.size) setTimeout(() => alive && setLifting(true), 700);
    });
    return () => {
      alive = false;
    };
  }, [size, map.data, mirror.data]);

  if (map.error) return <p className="text-destructive">{map.error.message}</p>;
  if (!map.data) return <PageSkeleton />;
  if (!picture)
    return <p className="text-muted-foreground">La carte du monde n'a pas encore été dessinée…</p>;

  const point = (e: PointerEvent | MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height };
  };
  const placeOf = (id: number | null) => places.find((p) => p.id === id) ?? null;
  const open = (place: Place, u: number, v: number) => {
    setBoostersOpen(false);
    setMenu({ place, x: u * 100, y: v * 100 });
  };
  const pins = places.filter((p) => p.lore_calques.length === 0);
  const hovered = placeOf(hover);
  const opened = menu?.place ?? null;
  const boosters = opened?.collection_id
    ? (shop.data ?? []).filter((b) =>
        (contents.data ?? []).some(
          (r) => r.type_id === b.id && r.collection_id === opened.collection_id,
        ),
      )
    : [];
  const chapter = opened?.chapitre_id ?? null;

  return (
    <div className="flex flex-col gap-3">
      <Popover open={!!menu} onOpenChange={(o) => !o && setMenu(null)}>
        <div
          className={`relative overflow-hidden rounded-xl select-none ${hover !== null ? 'cursor-pointer' : ''}`}
          onPointerMove={(e) => {
            if (!built || e.pointerType !== 'mouse') return;
            const { u, v } = point(e);
            setHover(placeAt(built.hits, u, v));
          }}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            if (!built) return;
            const { u, v } = point(e);
            const place = placeOf(placeAt(built.hits, u, v));
            if (place) open(place, u, v);
          }}
        >
          <img
            src={picture}
            alt="Carte du monde"
            draggable={false}
            className="block w-full"
            onLoad={(e) =>
              setSize({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
          />
          {layers.map((l) => (
            <img
              key={l.id}
              src={l.url}
              alt=""
              draggable={false}
              className={`lore-layer pointer-events-none absolute inset-0 size-full ${hover === l.place || opened?.id === l.place ? 'lore-layer-lit' : ''} ${fresh.has(l.place) && !lifting ? 'opacity-0' : 'opacity-100'}`}
            />
          ))}
          {built && (
            <div
              aria-hidden
              className="lore-fog pointer-events-none absolute inset-0"
              style={{ '--fog-mask': `url("${built.mask}")`, '--fog-tile': `url("${tile}")` }}
            >
              <span className="lore-fog-clouds absolute inset-0" />
              <span className="lore-fog-clouds lore-fog-clouds-slow absolute inset-0" />
            </div>
          )}
          {built?.fresh && (
            <div
              aria-hidden
              className={`lore-fog pointer-events-none absolute inset-0 transition-opacity duration-3000 ease-out ${lifting ? 'opacity-0' : 'opacity-100'}`}
              style={{ '--fog-mask': `url("${built.fresh}")`, '--fog-tile': `url("${tile}")` }}
            >
              <span className="lore-fog-clouds absolute inset-0" />
              <span className="lore-fog-clouds lore-fog-clouds-slow absolute inset-0" />
            </div>
          )}
          {pins.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.nom}
              onClick={(e) => {
                e.stopPropagation();
                open(p, p.x / 100, p.y / 100);
              }}
              style={{ '--x': `${p.x}%`, '--y': `${p.y}%` }}
              className="absolute top-(--y) left-(--x) flex -translate-x-1/2 -translate-y-full cursor-pointer flex-col items-center"
            >
              <span className="rounded-full border-2 border-foreground bg-background p-1.5 shadow-lg transition hover:scale-125">
                <ICONS.position className="size-4" />
              </span>
            </button>
          ))}
          {hovered && !menu && (
            <span
              style={{ '--x': `${hovered.x}%`, '--y': `${hovered.y}%` }}
              className="pointer-events-none absolute top-(--y) left-(--x) -translate-x-1/2 -translate-y-1/2 rounded-md bg-background/90 px-2 py-0.5 text-sm font-semibold shadow-lg"
            >
              {hovered.nom}
            </span>
          )}
          {menu && (
            <PopoverAnchor asChild>
              <span
                style={{ '--x': `${menu.x}%`, '--y': `${menu.y}%` }}
                className="pointer-events-none absolute top-(--y) left-(--x) size-0"
              />
            </PopoverAnchor>
          )}
        </div>
        <PopoverContent className="w-64" onOpenAutoFocus={(e) => e.preventDefault()}>
          {opened && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col">
                <b>{opened.nom}</b>
                {opened.collections && (
                  <small className="text-muted-foreground">{opened.collections.nom}</small>
                )}
              </div>
              {opened.texte && (
                <p className="line-clamp-3 text-xs text-muted-foreground">{opened.texte}</p>
              )}
              <div className="flex flex-col gap-1">
                {opened.collections && (
                  <Button asChild variant="ghost" size="sm" className="justify-start">
                    <Link to="/collection" search={{ group: opened.collections.nom }}>
                      <ICONS.collection />
                      Collection
                    </Link>
                  </Button>
                )}
                {boosters.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => setBoostersOpen(!boostersOpen)}
                  >
                    <ICONS.shop />
                    Boosters ({boosters.length})
                  </Button>
                )}
                {boostersOpen && (
                  <div className="flex flex-col gap-1 pl-6">
                    {boosters.map((b) => {
                      const src = img(b.image_path);
                      return (
                        <Link
                          key={b.id}
                          to="/$view"
                          params={{ view: 'boutique' }}
                          search={{ booster: b.id }}
                          className="flex items-center gap-2 rounded-md p-1 text-xs hover:bg-muted"
                        >
                          {src && <img src={src} alt="" className="h-8 w-6 object-contain" />}
                          <span className="flex-1">{b.nom}</span>
                          <ICONS.externalLink className="size-3" />
                        </Link>
                      );
                    })}
                  </div>
                )}
                {chapter !== null && (
                  <Button asChild variant="ghost" size="sm" className="justify-start">
                    <Link to="/lore" search={{ onglet: 'histoire', chapitre: chapter }}>
                      <ICONS.lore />
                      Lore
                    </Link>
                  </Button>
                )}
                {(opened.image_path || opened.texte.length > 140) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      setDetails(opened);
                      setMenu(null);
                    }}
                  >
                    <ICONS.externalLink />
                    En savoir plus
                  </Button>
                )}
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <p className="text-sm text-muted-foreground">
        Clique sur un lieu de la carte. Le brouillard cache ce qui n'a pas encore été découvert…
      </p>
      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-h-dialog overflow-y-auto sm:max-w-lg">
          <DialogTitle>{details?.nom}</DialogTitle>
          {details?.collections && (
            <DialogDescription>Collection : {details.collections.nom}</DialogDescription>
          )}
          {details?.image_path && (
            <img src={img(details.image_path) ?? ''} alt="" className="w-full rounded-lg" />
          )}
          {details?.texte && <p className="text-sm whitespace-pre-line">{details.texte}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
