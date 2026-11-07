// Lore > Événements, the boss scene (70-evenements-boss.sql): an event with an attacking card (the
// boss) or an attacked place is played out as a scene. Behind, the world map and its revealed
// layers, zoomed on the attacked place (the whole map without one) under a dark red veil; the boss
// hovers in its red aura; under it, the defence line: the fighters the players placed (a key one
// framed in green, a harmful one in red, once the keys are shown) and the barrier, the chance of
// success. `outcome` plays the end: the boss charges, the line shakes, then the loser shatters (the
// boss if the defence held, the defenders one after the other if not).

import { useQuery } from '@tanstack/react-query';
import { Progress } from '@/components/ui/progress';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { type Defender, fetchWorldMap, type LoreEvent, loreKeys } from '@/data/lore';
import { ICONS } from '@/lib/icons';
import { TONES } from '@/lib/tones';
import { visible } from './world-map';

export type SceneOutcome = 'idle' | 'clash' | 'won' | 'lost';

// The scene is shown when the event has a boss or a place.
export const hasScene = (e: LoreEvent) => e.attaquant_nom !== null || e.lieu_id !== null;

// How much the map is enlarged around the attacked place.
const ZOOM = '2.2';
// Defenders shown in the line; the others are counted.
const SHOWN = 16;
// Between two defenders falling.
const FALL_STEP_MS = 90;

const ringOf = (d: Defender) =>
  d.role === 'cle'
    ? `ring-2 ${TONES.success.ring}`
    : d.role === 'nuisible'
      ? `ring-2 ${TONES.danger.ring}`
      : 'ring-1 ring-border';

export function EventScene({
  event: e,
  outcome = 'idle',
}: {
  event: LoreEvent;
  outcome?: SceneOutcome;
}) {
  const map = useQuery({ queryKey: loreKeys.map, queryFn: fetchWorldMap });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const images = mirror.data ?? new Set<string>();
  const img = (path: string | null) => imageUrl(path, images);

  const { places, layers } = visible(map.data?.places ?? [], img);
  const base = img(map.data?.image ?? null);
  const place = places.find((p) => p.id === e.lieu_id) ?? null;
  const focus = place
    ? { '--x': `${place.x}%`, '--y': `${place.y}%`, '--zoom': ZOOM }
    : { '--x': '50%', '--y': '50%', '--zoom': '1' };
  const boss = img(e.attaquant_image);
  const open = e.statut === 'ouvert';
  const chance = open ? e.chance : e.chance_finale;
  const shown = e.defenseurs.slice(0, SHOWN);
  const more = e.participants - shown.length;

  const bossMotion =
    outcome === 'clash'
      ? 'animate-boss-charge'
      : outcome === 'won'
        ? 'animate-card-shatter'
        : 'animate-boss-float';

  return (
    <div className="dark relative isolate overflow-hidden rounded-xl bg-background text-foreground">
      <div aria-hidden className="absolute inset-0 -z-10">
        {base && (
          <img
            src={base}
            alt=""
            draggable={false}
            style={focus}
            className="event-map-layer absolute inset-0 size-full"
          />
        )}
        {layers.map((l) => (
          <img
            key={l.id}
            src={l.url}
            alt=""
            draggable={false}
            style={focus}
            className="event-map-layer absolute inset-0 size-full"
          />
        ))}
        <div className="event-scene-veil absolute inset-0" />
      </div>
      <div className="flex flex-col items-center gap-4 p-4 text-center sm:p-6">
        {(e.attaquant_nom || e.lieu_nom) && (
          <p className="flex flex-wrap items-center justify-center gap-1.5 text-lg font-semibold">
            {e.attaquant_nom ? (
              <>
                <span className={TONES.danger.text}>{e.attaquant_nom}</span>
                {e.lieu_nom ? (
                  <>
                    attaque
                    <ICONS.position className="size-4" />
                    {e.lieu_nom}
                  </>
                ) : (
                  'attaque !'
                )}
              </>
            ) : (
              <>
                Menace sur
                <ICONS.position className="size-4" />
                {e.lieu_nom}
              </>
            )}
          </p>
        )}
        {e.attaquant_nom && (
          <div className="py-2">
            {/* the motion on the wrapper, the aura (an animation too) on the card */}
            <div className={bossMotion}>
              {boss ? (
                <img
                  src={boss}
                  alt={e.attaquant_nom}
                  className="boss-aura aspect-5/7 w-36 rounded-lg object-cover sm:w-44"
                />
              ) : (
                <div className="boss-aura aspect-5/7 w-36 rounded-lg bg-muted sm:w-44" />
              )}
            </div>
          </div>
        )}
        {e.type === 'defense' && chance !== null && (
          <div className="flex w-64 max-w-full flex-col gap-1 text-sm">
            <span className="text-muted-foreground">
              Barrière : <b className="text-foreground">{chance} %</b> de chances de repousser
              l'attaque
            </span>
            <Progress value={chance} />
          </div>
        )}
        {e.type === 'defense' && (
          <div
            className={`flex flex-wrap justify-center gap-2 ${outcome === 'clash' ? 'animate-line-shake' : ''}`}
          >
            {shown.map((d, i) => {
              const src = img(d.image_path);
              return (
                <figure
                  key={d.pseudo}
                  style={{ '--delay': `${i * FALL_STEP_MS}ms` }}
                  title={`${d.pseudo} · ${d.nom}`}
                  className={`flex w-14 flex-col items-center gap-1 sm:w-16 ${outcome === 'lost' ? 'animate-card-shatter' : ''}`}
                >
                  {src ? (
                    <img
                      src={src}
                      alt={d.nom}
                      loading="lazy"
                      className={`aspect-5/7 w-full rounded-md object-cover ${ringOf(d)}`}
                    />
                  ) : (
                    <div className={`aspect-5/7 w-full rounded-md bg-muted ${ringOf(d)}`} />
                  )}
                  <figcaption className="w-full truncate text-2xs text-muted-foreground">
                    {d.pseudo}
                  </figcaption>
                </figure>
              );
            })}
            {more > 0 && (
              <div className="flex aspect-5/7 w-14 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground sm:w-16">
                +{more}
              </div>
            )}
            {!shown.length && (
              <p className="text-sm text-muted-foreground">
                Aucun défenseur pour l'instant : la forêt attend ses héros.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
