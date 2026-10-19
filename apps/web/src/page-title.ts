// The title of the page being shown, for the header: the view's label (without its emoji), or
// "Admin · <sub-view>". Read from the address.

import { useRouterState } from '@tanstack/react-router';
import {
  ADMIN_VIEWS,
  ENCYCLOPEDIA_PAGES,
  PLAYER_VIEWS,
  plainLabel,
  SITE_PAGES,
  viewLabel,
} from '@/views';

export function pageTitle(pathname: string): string {
  const [view, sub] = pathname.split('/').filter(Boolean);
  if (view === 'admin')
    return sub && Object.hasOwn(ADMIN_VIEWS, sub)
      ? `Admin · ${plainLabel(ADMIN_VIEWS[sub as keyof typeof ADMIN_VIEWS])}`
      : 'Admin';
  if (view === 'encyclopedie')
    return sub && Object.hasOwn(ENCYCLOPEDIA_PAGES, sub)
      ? `Encyclopédie · ${ENCYCLOPEDIA_PAGES[sub as keyof typeof ENCYCLOPEDIA_PAGES]}`
      : 'Encyclopédie';
  if (view && Object.hasOwn(SITE_PAGES, view)) return SITE_PAGES[view as keyof typeof SITE_PAGES];
  if (view && Object.hasOwn(PLAYER_VIEWS, view))
    return viewLabel(view as keyof typeof PLAYER_VIEWS);
  return 'Forest Card';
}

export const usePageTitle = (): string =>
  pageTitle(useRouterState({ select: (s) => s.location.pathname }));
