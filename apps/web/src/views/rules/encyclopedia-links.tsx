// From "Comment jouer" to the pages that explain more: the encyclopedia (every card, the
// rarities, the effects) and the daily games (their rules).

import { Link } from '@tanstack/react-router';
import { ICONS, type LucideIcon } from '@/lib/icons';
import { ENCYCLOPEDIA_PAGES, type EncyclopediaPage, viewLabel } from '@/views';

const LINKS: { page: EncyclopediaPage; icon: LucideIcon; what: string }[] = [
  { page: 'catalogue', icon: ICONS.catalogue, what: 'Toutes les cartes du jeu' },
  { page: 'raretes', icon: ICONS.rarities, what: 'Raretés, collections et versions alternatives' },
  { page: 'effets', icon: ICONS.effects, what: 'Chaque effet et son animation' },
];

export function EncyclopediaLinks() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {LINKS.map(({ page, icon: Icon, what }) => (
        <Link
          key={page}
          to={`/encyclopedie/${page}`}
          className="group flex items-center gap-3 rounded-xl border bg-card p-4 text-card-foreground transition hover:bg-accent"
        >
          <Icon className="size-5 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-col">
            <b className="text-sm">Encyclopédie · {ENCYCLOPEDIA_PAGES[page]}</b>
            <span className="text-sm text-muted-foreground">{what}</span>
          </span>
          <ICONS.next className="ml-auto size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
        </Link>
      ))}
    </div>
  );
}

export function GamesLink() {
  return (
    <Link
      to="/$view"
      params={{ view: 'jeux' }}
      className="group flex items-center gap-3 rounded-xl border bg-card p-4 text-card-foreground transition hover:bg-accent md:max-w-sm"
    >
      <ICONS.dailyGames className="size-5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col">
        <b className="text-sm">{viewLabel('jeux')}</b>
        <span className="text-sm text-muted-foreground">
          Champignons, duel d'ATQ, plus ou moins, ticket à gratter
        </span>
      </span>
      <ICONS.next className="ml-auto size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
    </Link>
  );
}
