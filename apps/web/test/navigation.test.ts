// Every view of the site is in the sidebar exactly once: none lost, none twice.

import { expect, test } from 'vite-plus/test';
import { ADMIN_GROUPS, FOOTER_VIEWS, PLAYER_GROUPS } from '../src/navigation.ts';
import { ADMIN_VIEWS, ENCYCLOPEDIA_PAGES, PLAYER_VIEWS, SITE_PAGES } from '../src/views.ts';

const sorted = (list: string[]) => [...list].sort();

test('player views: each one in a section or at the bottom, once', () => {
  const placed = [
    ...PLAYER_GROUPS.flatMap((g) => g.items.flatMap((i) => ('view' in i ? [i.view] : []))),
    ...FOOTER_VIEWS,
  ];
  expect(sorted(placed)).toEqual(sorted(Object.keys(PLAYER_VIEWS)));
});

test('admin views: each one in an admin section, once', () => {
  const placed = ADMIN_GROUPS.flatMap((g) => g.views);
  expect(sorted(placed)).toEqual(sorted(Object.keys(ADMIN_VIEWS)));
});

test('encyclopedia pages: each one once', () => {
  const placed = PLAYER_GROUPS.flatMap((g) =>
    g.items.flatMap((i) => ('page' in i ? [i.page] : [])),
  );
  expect(sorted(placed)).toEqual(sorted(Object.keys(ENCYCLOPEDIA_PAGES)));
});

test('pages of the site alone: each one once', () => {
  const placed = PLAYER_GROUPS.flatMap((g) =>
    g.items.flatMap((i) => ('site' in i ? [i.site] : [])),
  );
  expect(sorted(placed)).toEqual(sorted(Object.keys(SITE_PAGES)));
});
