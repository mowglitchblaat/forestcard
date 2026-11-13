// Encyclopédie · Terrains (packages/engine/src/mechanics/terrain.ts): the ground a combat is fought
// on, drawn at its start or invoked by a card. Each terrain as a button; the selected one plays its
// scenery and what it does in the preview panel beside the list (on top on a small screen).

import { TERRAIN_INFO } from '@forestcard/describe';
import { getRouteApi } from '@tanstack/react-router';
import { useRef } from 'react';
import { FxPreview } from '@/components/fx-preview';
import { useMediaQuery } from '@/hooks/use-media-query';

const route = getRouteApi('/encyclopedie/terrains');

export function TerrainsPage() {
  const { terrain } = route.useSearch();
  const navigate = route.useNavigate();
  const wide = useMediaQuery('(min-width: 1024px)');
  const panel = useRef<HTMLElement>(null);
  const selected = TERRAIN_INFO.find((t) => t.key === terrain) ?? TERRAIN_INFO[0];

  const pick = (key: string) => {
    void navigate({ search: { terrain: key }, replace: true, resetScroll: false });
    if (!wide) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="grid items-start gap-8 lg:layout-main-aside-26">
      <div className="flex min-w-0 flex-col gap-6">
        <p className="text-muted-foreground">
          Un combat peut se jouer sur un terrain : il est tiré au sort au début du combat, ou
          invoqué par une carte (une magie, un ultime, un piège, ou un passif quand la carte entre
          en jeu). Le terrain vaut pour les deux combattants jusqu'à la fin du combat, ou jusqu'à ce
          qu'une autre carte en invoque un autre. Chaque terrain a sa règle, et avantage les cartes
          de sa collection.
        </p>
        <div className="flex flex-col gap-3">
          {TERRAIN_INFO.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={t === selected}
              onClick={() => pick(t.key)}
              className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition hover:-translate-y-0.5 ${
                t === selected ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''
              }`}
            >
              <span className="font-semibold">
                {t.emoji} {t.titre} · {t.camp}
              </span>
              <span className="text-sm text-muted-foreground">
                Pour tous : {t.regle}. Avantage : {t.bonus}.
              </span>
            </button>
          ))}
        </div>
      </div>
      <aside
        ref={panel}
        aria-live="polite"
        className="order-first flex scroll-mt-4 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground lg:sticky lg:top-4 lg:order-none"
      >
        <h2 className="text-lg font-semibold">
          {selected.emoji} {selected.titre}
        </h2>
        {/* A new frame per terrain: the preview plays once its page is ready. */}
        <FxPreview
          key={selected.key}
          effect={`terrain_${selected.key}`}
          card={{ nom: 'Combattant', image: null, rar: null }}
          opponent={{ nom: 'Adversaire', image: null, rar: null }}
          className="h-72"
        />
        <p className="text-sm">
          <b>Pour tous :</b> {selected.regle}.
        </p>
        <p className="text-sm">
          <b>Avantage ({selected.camp}) :</b> {selected.bonus}.
        </p>
      </aside>
    </div>
  );
}
