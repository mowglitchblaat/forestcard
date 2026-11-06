// Lore > Carte (64-lore-carte-calques.sql): the interactive world map. The blank map is covered by
// a drifting fog, except around the revealed places' layers (transparent images the size of the map,
// laid on it). Hovering a layer lights it up; a click opens the place's menu: its collection (the
// collection page filtered on it), the boosters of its collection (to the shop) and its chapter of
// the story, read right there (./chapter-reader.tsx). A place revealed since the player's last
// visit lifts its fog in front of them.
// The fog's holes, the hover glow and the hover test come from what each layer really adds to the
// map: its transparency, minus the parts that copy the blank map (a layer cut out of a finished map
// carries sea and land around its drawing), read once in a canvas (the images are served with
// CORS). A place without a layer is a pin.

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type MouseEvent, type PointerEvent, useEffect, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { fetchChapters, fetchWorldMap, loreKeys, type Place } from '@/data/lore';
import { fetchContents, fetchShop, shopKeys } from '@/data/shop';
import { ICONS } from '@/lib/icons';
import { ChapterReader } from './chapter-reader';

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

// A rarity named common (« Commune »), whatever its case and accents.
const isCommon = (name: string) =>
  name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().startsWith('commun');

// The canvases work at a quarter of the map's size: enough for a soft fog edge and the hover test.
const SCALE = 0.25;

type Hit = { place: number; width: number; height: number; alpha: Uint8ClampedArray };
type Built = { mask: string; fresh: string | null; hits: Hit[]; glows: Map<number, string> };

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
      data.data[i + 3] = Math.max(0, Math.min(255, (v - 0.08) * 460));
    }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

// Reads the layers once: their alpha for the hover test, and the fog's mask (opaque where the fog
// stays, a soft hole around every layer, the frame of the map always clear). `fresh`: the mask of
// the places revealed since the last visit only, for the fog that lifts in front of the player.
async function build(
  baseUrl: string,
  layers: { place: number; url: string }[],
  freshPlaces: Set<number>,
  width: number,
  height: number,
): Promise<Built> {
  const w = Math.round(width * SCALE);
  const h = Math.round(height * SCALE);
  const [base, ...images] = await Promise.all([
    loadImage(baseUrl).catch(() => null),
    ...layers.map((l) => loadImage(l.url).catch(() => null)),
  ]);
  const read = document.createElement('canvas');
  read.width = w;
  read.height = h;
  const rctx = read.getContext('2d', { willReadFrequently: true });
  if (!rctx) return { mask: '', fresh: null, hits: [], glows: new Map() };
  let basePx: Uint8ClampedArray | null = null;
  if (base) {
    rctx.drawImage(base, 0, 0, w, h);
    basePx = rctx.getImageData(0, 0, w, h).data;
  }
  // each layer's own part: its alpha, faded where its colour is the blank map's
  const hits: Hit[] = [];
  layers.forEach((l, k) => {
    const img = images[k];
    if (!img) return;
    rctx.clearRect(0, 0, w, h);
    rctx.drawImage(img, 0, 0, w, h);
    const px = rctx.getImageData(0, 0, w, h).data;
    const alpha = new Uint8ClampedArray(w * h);
    for (let i = 0; i < alpha.length; i++) {
      const a = px[i * 4 + 3] ?? 0;
      if (!a) continue;
      let own = 1;
      if (basePx) {
        const diff = Math.max(
          Math.abs((px[i * 4] ?? 0) - (basePx[i * 4] ?? 0)),
          Math.abs((px[i * 4 + 1] ?? 0) - (basePx[i * 4 + 1] ?? 0)),
          Math.abs((px[i * 4 + 2] ?? 0) - (basePx[i * 4 + 2] ?? 0)),
        );
        own = Math.min(1, Math.max(0, (diff - 22) / 40));
      }
      alpha[i] = a * own;
    }
    hits.push({ place: l.place, width: w, height: h, alpha });
  });
  // a canvas of the places' own parts, in a colour (white for the fog's holes, gold for a glow)
  const paint = (places: Set<number> | null, rgb: [number, number, number]) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    const data = ctx.createImageData(w, h);
    for (const hit of hits)
      if (!places || places.has(hit.place))
        for (let i = 0; i < hit.alpha.length; i++) {
          const a = hit.alpha[i] ?? 0;
          if (a <= (data.data[i * 4 + 3] ?? 0)) continue;
          data.data[i * 4] = rgb[0];
          data.data[i * 4 + 1] = rgb[1];
          data.data[i * 4 + 2] = rgb[2];
          data.data[i * 4 + 3] = a;
        }
    ctx.putImageData(data, 0, 0);
    return c;
  };
  const soft = (ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, radius: number) => {
    ctx.filter = `blur(${radius}px)`;
    for (let k = 0; k < 4; k++) ctx.drawImage(source, 0, 0);
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
    // the frame, the title (top left) and the compass (bottom right) stay clear, with soft edges
    mctx.filter = `blur(${Math.round(w / 60)}px)`;
    const edge = Math.round(w * 0.012);
    mctx.fillRect(-edge, -edge, w + 2 * edge, 2 * edge);
    mctx.fillRect(-edge, h - edge, w + 2 * edge, 2 * edge);
    mctx.fillRect(-edge, -edge, 2 * edge, h + 2 * edge);
    mctx.fillRect(w - edge, -edge, 2 * edge, h + 2 * edge);
    mctx.beginPath();
    mctx.ellipse(w * 0.085, h * 0.065, w * 0.11, h * 0.09, 0, 0, Math.PI * 2);
    mctx.ellipse(w * 0.965, h * 0.9, w * 0.05, h * 0.11, 0, 0, Math.PI * 2);
    mctx.fill();
    mctx.filter = 'none';
    soft(mctx, paint(null, [255, 255, 255]), Math.round(w / 70));
  }
  let fresh: string | null = null;
  if (freshPlaces.size) {
    const f = document.createElement('canvas');
    f.width = w;
    f.height = h;
    const fctx = f.getContext('2d');
    if (fctx) {
      soft(fctx, paint(freshPlaces, [255, 255, 255]), Math.round(w / 70));
      fresh = f.toDataURL('image/png');
    }
  }
  // the hover glow of each place: a golden ring around its silhouette (shown by fading its opacity)
  const glows = new Map<number, string>();
  for (const place of new Set(hits.map((x) => x.place))) {
    const g = document.createElement('canvas');
    g.width = w;
    g.height = h;
    const gctx = g.getContext('2d');
    if (!gctx) continue;
    const silhouette = paint(new Set([place]), [255, 214, 120]);
    soft(gctx, silhouette, Math.max(3, Math.round(w / 110)));
    // a ring: the inside is cut out, so the glow can sit above the layers (whose opaque parts would
    // hide a glow placed behind them) without veiling the drawing
    gctx.globalCompositeOperation = 'destination-out';
    gctx.drawImage(silhouette, 0, 0);
    glows.set(place, g.toDataURL('image/png'));
  }
  return { mask: mask.toDataURL('image/png'), fresh, hits, glows };
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
  const chapters = useQuery({ queryKey: loreKeys.chapters, queryFn: fetchChapters });
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
  const [reading, setReading] = useState<number | null>(null);

  // Reads the layers again when the map, the places or the image addresses change.
  useEffect(() => {
    if (!size || !map.data) return;
    const shown = visible(map.data.places, (path) => imageUrl(path, mirror.data ?? new Set()));
    const ids = shown.places.map((p) => p.id);
    const seen = readSeen();
    // the very first visit lifts nothing: everything already there is just there
    const newly = new Set(seen ? ids.filter((id) => !seen.includes(id)) : []);
    let alive = true;
    const baseUrl = imageUrl(map.data.image, mirror.data ?? new Set());
    if (!baseUrl) return;
    void build(baseUrl, shown.layers, newly, size.width, size.height).then((b) => {
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
  // the boosters that give the place's collection from the rare cards up: the commons of every
  // collection are in every booster, so counting them listed them all
  const boosters = opened?.collection_id
    ? (shop.data ?? []).filter((b) =>
        (contents.data ?? []).some(
          (r) =>
            r.type_id === b.id &&
            r.collection_id === opened.collection_id &&
            !isCommon(r.rarete_nom) &&
            r.nb > 0,
        ),
      )
    : [];
  const chapterIndex = (chapters.data ?? []).findIndex((c) => c.id === opened?.chapitre_id);

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
              className={`lore-layer pointer-events-none absolute inset-0 size-full ${fresh.has(l.place) && !lifting ? 'opacity-0' : 'opacity-100'}`}
            />
          ))}
          {[...(built?.glows ?? [])].map(([place, glow]) => (
            <img
              key={`glow-${place}`}
              src={glow}
              alt=""
              draggable={false}
              className={`lore-glow pointer-events-none absolute inset-0 size-full ${hover === place || opened?.id === place ? 'opacity-100' : 'opacity-0'}`}
            />
          ))}
          {built && (
            <div
              aria-hidden
              className="lore-fog pointer-events-none absolute inset-0"
              style={{ '--fog-mask': `url("${built.mask}")`, '--fog-tile': `url("${tile}")` }}
            >
              <span className="lore-fog-clouds absolute" />
              <span className="lore-fog-clouds-slow absolute" />
            </div>
          )}
          {built?.fresh && (
            <div
              aria-hidden
              className={`lore-fog pointer-events-none absolute inset-0 transition-opacity duration-3000 ease-out ${lifting ? 'opacity-0' : 'opacity-100'}`}
              style={{ '--fog-mask': `url("${built.fresh}")`, '--fog-tile': `url("${tile}")` }}
            >
              <span className="lore-fog-clouds absolute" />
              <span className="lore-fog-clouds-slow absolute" />
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
                {chapterIndex >= 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      setReading(chapterIndex);
                      setMenu(null);
                    }}
                  >
                    <ICONS.lore />
                    Lore
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
      <ChapterReader
        chapters={chapters.data ?? []}
        index={reading}
        onIndex={setReading}
        img={img}
      />
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
