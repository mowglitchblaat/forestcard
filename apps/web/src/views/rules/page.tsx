// "Comment jouer": the author's rules (content.tsx), with an inner sidebar to jump to a section.
// While scrolling, the sidebar shows the section being read; the section is kept in the address
// (`#/regles?section=deck`), so a link points straight at it.

import { getRouteApi } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { markSeen, SEEN_KEYS } from '@/lib/seen';
import { INTRO, SECTIONS, STEPS } from './content';

const route = getRouteApi('/regles');

export function RulesPage() {
  const { section } = route.useSearch();
  const navigate = route.useNavigate();
  const [current, setCurrent] = useState<string>(SECTIONS[0]?.id ?? '');
  const refs = useRef(new Map<string, HTMLElement>());

  // Opening "Comment jouer" removes the dot on its sidebar entry.
  useEffect(() => markSeen(SEEN_KEYS.rules, '1'), []);

  // Arriving with a section in the address: scroll to it. Only on arrival: later changes come
  // from scrolling or the sidebar, which already shows them.
  const [arrival] = useState(section);
  useEffect(() => {
    if (arrival) refs.current.get(arrival)?.scrollIntoView({ block: 'start' });
  }, [arrival]);

  // The section being read: the last one whose top has passed the upper third of the screen.
  useEffect(() => {
    const onScroll = () => {
      const line = innerHeight / 3;
      let reading = SECTIONS[0]?.id ?? '';
      for (const s of SECTIONS) {
        const el = refs.current.get(s.id);
        if (el && el.getBoundingClientRect().top <= line) reading = s.id;
      }
      setCurrent(reading);
    };
    onScroll();
    // Capture: whichever element scrolls (the window, or the layout's content area).
    addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  const go = (id: string) => {
    refs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Without resetScroll: false, the router scrolls back to the top and cancels the jump.
    void navigate({ search: { section: id }, replace: true, resetScroll: false });
  };

  return (
    <div className="grid gap-8 lg:layout-aside-main-13">
      <nav aria-label="Sections" className="lg:sticky lg:top-4 lg:self-start">
        <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {SECTIONS.map(({ id, title, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => go(id)}
                aria-current={current === id ? 'location' : undefined}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm whitespace-nowrap transition hover:bg-accent ${
                  current === id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{title}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <article className="flex min-w-0 flex-col gap-10">
        <header className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold">Forest Card — Comment jouer</h2>
          <p className="text-muted-foreground">{INTRO}</p>
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={i} className="flex gap-3 rounded-xl border bg-card p-4 text-card-foreground">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <b>{step.title}</b>
                  <span className="text-sm text-muted-foreground">{step.body}</span>
                </div>
              </li>
            ))}
          </ol>
        </header>

        {SECTIONS.map(({ id, title, icon: Icon, subtitle, blocks, after }) => (
          <section
            key={id}
            id={id}
            ref={(el) => {
              if (el) refs.current.set(id, el);
              else refs.current.delete(id);
            }}
            className="flex scroll-mt-4 flex-col gap-4"
          >
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Icon className="size-5" /> {title}
              </h2>
              {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
            </div>
            {blocks && (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {blocks.map((b, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <CardTitle className="text-base">{b.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm">{b.body}</CardContent>
                  </Card>
                ))}
              </div>
            )}
            {after}
          </section>
        ))}
      </article>
    </div>
  );
}
