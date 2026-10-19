// Encyclopédie · Effets: every effect as a button in its category colour, grouped as the author's
// rules group them; the selected one plays in a single preview panel beside the list (on top on a
// small screen), with the card that shows it. One frame for the page, not one per effect.

import { getRouteApi } from '@tanstack/react-router';
import { useRef } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { EFFECT_GROUPS, effectId, RULE_EFFECTS, STATUS_RULES } from './content';
import { Example, effectStyle, type RuleEffect } from './effects';

const route = getRouteApi('/encyclopedie/effets');

export function EffectsPage() {
  const { effet } = route.useSearch();
  const navigate = route.useNavigate();
  const wide = useMediaQuery('(min-width: 1024px)');
  const panel = useRef<HTMLElement>(null);
  const selected = RULE_EFFECTS.find((e) => effectId(e) === effet) ?? RULE_EFFECTS[0];
  if (!selected) return null;

  const pick = (e: RuleEffect) => {
    void navigate({ search: { effet: effectId(e) }, replace: true, resetScroll: false });
    // On a small screen the panel is above the list: bring it back into view.
    if (!wide) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="grid items-start gap-8 lg:layout-main-aside-26">
      <div className="flex min-w-0 flex-col gap-8">
        <p className="text-muted-foreground">
          Chaque effet a sa propre animation à l'écran. Choisis-en un pour le voir joué sur une
          carte du jeu qui l'a.
        </p>
        {EFFECT_GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-3">
            <h2 className="border-b pb-2 text-lg font-semibold">{group.title}</h2>
            {group.intro && <p className="text-sm">{group.intro}</p>}
            <div className="flex flex-wrap gap-2">
              {group.effects.map((e) => {
                const style = effectStyle(e);
                const on = e === selected;
                return (
                  <button
                    key={effectId(e)}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pick(e)}
                    className={`rounded-full px-3 py-1 text-sm font-medium text-(--chip-ink) transition hover:-translate-y-0.5 ${
                      style?.background.startsWith('linear-gradient')
                        ? 'bg-(image:--chip)'
                        : 'bg-(--chip)'
                    } ${style?.border ? 'border border-(--chip-edge)' : ''} ${
                      on ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''
                    }`}
                    style={{
                      '--chip': style?.background,
                      '--chip-ink': style?.color,
                      // The category's border is written "1px solid <colour>": its colour.
                      '--chip-edge': style?.border?.split(' ').pop(),
                    }}
                  >
                    {e.label}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <section className="flex flex-col gap-3">
          <h2 className="border-b pb-2 text-lg font-semibold">Comment les statuts s'appliquent</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {STATUS_RULES.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>
        </section>
      </div>
      <aside
        ref={panel}
        aria-live="polite"
        className="order-first flex scroll-mt-4 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground lg:sticky lg:top-4 lg:order-none"
      >
        <h2 className="text-lg font-semibold">{selected.label}</h2>
        {/* A new frame per effect: the preview plays once its page is ready. */}
        <Example key={effectId(selected)} effect={selected} />
      </aside>
    </div>
  );
}
