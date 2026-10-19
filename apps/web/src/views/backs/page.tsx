// Card backs, reimagined: the player's backs in a grid; the one picked shows large, swaying in 3D
// and leaning toward the pointer, and a button puts it in use. Trying a back writes nothing; only
// "Utiliser ce dos" does. The game's own back is drawn as the overlay draws it (green, the tree),
// not as the legacy page's tile did.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { ICONS } from '@/lib/icons';
import { useEffect, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { Glare, useTilt } from '@/components/tilt-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { backIds, backKeys, type CardBack, chooseBack, fetchBacks } from '@/data/backs';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { listMark, markSeen, SEEN_KEYS, unseen } from '@/lib/seen';
import { STANDARD } from './search';

const route = getRouteApi('/dos');

// The game's back and the player's, as one list: id null for the game's.
type Back = {
  key: string;
  id: CardBack['id'] | null;
  name: string;
  image: string | null;
  inUse: boolean;
  label: string;
};

export function toBacks(list: CardBack[]): Back[] {
  return [
    {
      key: STANDARD,
      id: null,
      name: 'Dos standard',
      image: null,
      inUse: !list.some((b) => b.actif),
      label: 'Dos du jeu',
    },
    ...list.map((b) => ({
      key: String(b.id),
      id: b.id,
      name: b.nom,
      image: b.image,
      inUse: b.actif,
      label: b.par_defaut ? 'Dos de base' : 'Offert',
    })),
  ];
}

export function BacksPage() {
  const { dos } = route.useSearch();
  const navigate = route.useNavigate();
  const client = useQueryClient();
  const backs = useQuery({ queryKey: backKeys.mine, queryFn: fetchBacks });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  // The backs seen at the previous visit, read once on arrival: marking this visit must not remove
  // the "Nouveau" badges while the player looks at them. A first visit badges nothing.
  const [seenBefore] = useState(() => localStorage.getItem(SEEN_KEYS.backs));
  useEffect(() => {
    if (backs.data) markSeen(SEEN_KEYS.backs, listMark(backIds(backs.data)));
  }, [backs.data]);
  const use = useMutation({
    mutationFn: chooseBack,
    onSuccess: () => client.invalidateQueries({ queryKey: backKeys.mine }),
  });

  if (backs.error)
    return <p role="alert">Dos de cartes indisponibles pour le moment : {backs.error.message}</p>;
  if (!backs.data) return <PageSkeleton />;

  const list = toBacks(backs.data);
  const fresh = new Set(seenBefore === null ? [] : unseen(seenBefore, backIds(backs.data)));
  const picked = list.find((b) => b.key === dos) ?? list.find((b) => b.inUse) ?? list[0];
  if (!picked) return null;
  const images = mirror.data ?? new Set<string>();
  const pick = (b: Back) =>
    void navigate({ search: { dos: b.key }, replace: true, resetScroll: false });

  return (
    <div className="grid items-start gap-8 lg:layout-aside-main-22">
      <aside className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground lg:sticky lg:top-4">
        <h2 className="text-lg font-semibold">{picked.name}</h2>
        <SwayingBack back={picked} image={imageUrl(picked.image, images)} />
        <p className="text-sm text-muted-foreground">
          Sur le stream, ton combattant, ta magie et ton piège restent face cachée sous ce dos
          jusqu'à leur révélation.
        </p>
        {picked.inUse ? (
          <Button disabled variant="secondary">
            <ICONS.done /> Utilisé
          </Button>
        ) : (
          <Button disabled={use.isPending} onClick={() => use.mutate(picked.id)}>
            {use.isPending ? 'Enregistrement…' : 'Utiliser ce dos'}
          </Button>
        )}
        {use.error && (
          <p role="alert" className="text-sm text-destructive">
            {use.error.message}
          </p>
        )}
      </aside>

      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground">
          Choisis un dos pour le voir en grand. Les dos spéciaux sont offerts par le streamer.
        </p>
        <div className="grid grid-tiles gap-3">
          {list.map((b) => (
            <button
              key={b.key}
              type="button"
              aria-pressed={b === picked}
              onClick={() => pick(b)}
              className="group flex flex-col gap-1.5 text-left"
            >
              <span
                className={`relative block rounded-lg transition group-hover:-translate-y-1 ${
                  b === picked ? 'ring-4 ring-primary' : ''
                }`}
              >
                <BackImage back={b} image={imageUrl(b.image, images)} />
                {fresh.has(b.key) && (
                  <Badge variant="new" className="absolute top-1.5 left-1.5">
                    Nouveau
                  </Badge>
                )}
                {b.inUse && (
                  <Badge variant="success" className="absolute top-1.5 right-1.5">
                    <ICONS.done /> Utilisé
                  </Badge>
                )}
              </span>
              <b className="text-sm leading-tight">{b.name}</b>
              <span className="text-xs text-muted-foreground">{b.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// The back picked: a slow sway at rest, and the lean toward the pointer on top of it (two nested
// transforms). With reduced motion, it stays still.
function SwayingBack({ back, image }: { back: Back; image: string | null }) {
  const { ref, handlers } = useTilt();
  return (
    <div className="flex justify-center py-4 perspective-card" {...handlers}>
      <div className="w-48 animate-back-sway transform-3d motion-reduce:animate-none">
        <div
          ref={ref}
          className="relative tilt overflow-hidden rounded-lg shadow-xl transition-transform duration-120 ease-out transform-3d"
        >
          <BackImage back={back} image={image} />
          <Glare />
        </div>
      </div>
    </div>
  );
}

// The overlay's own colours for the game's back (.dosf in combat.html): green, the tree.
function BackImage({ back, image }: { back: Back; image: string | null }) {
  return image ? (
    <img
      loading="lazy"
      src={image}
      alt={back.name}
      className="aspect-5/7 w-full rounded-lg object-cover shadow-sm group-hover:shadow-lg"
    />
  ) : (
    <span
      role="img"
      aria-label={back.name}
      className="flex aspect-5/7 w-full items-center justify-center rounded-lg border-2 border-white/40 back-game text-4xl shadow-sm group-hover:shadow-lg"
    >
      {'\u{1F332}'}
    </span>
  );
}
