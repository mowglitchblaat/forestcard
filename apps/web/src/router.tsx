// Routes: one per view of the legacy page, under the same anchors (hash history: `#/collection`,
// `#/admin/cartes`). An unknown view sends to the default one, as the legacy page does.

import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { AdminPage, PlayerPage, Shell } from '@/shell';
import { BacksPage } from '@/views/backs/page';
import { BacksSearch } from '@/views/backs/search';
import { CollectionPage } from '@/views/collection/page';
import { DeckPage } from '@/views/deck/page';
import { DeckSearch } from '@/views/deck/search';
import { CollectionSearch } from '@/views/collection/search';
import { CataloguePage } from '@/views/encyclopedia/catalogue-page';
import { EffectsPage } from '@/views/encyclopedia/effects-page';
import { RaritiesPage } from '@/views/encyclopedia/rarities-page';
import { EffectsSearch, RaritiesSearch } from '@/views/encyclopedia/search';
import { HistoryPage } from '@/views/history/page';
import { HistorySearch } from '@/views/history/search';
import { LeaderboardPage } from '@/views/leaderboard/page';
import { LivePage } from '@/views/live/page';
import { LeaderboardSearch } from '@/views/leaderboard/search';
import { PatchPage } from '@/views/patch/page';
import { ProfilePage } from '@/views/profile/page';
import { ProfileSearch } from '@/views/profile/search';
import { PatchSearch } from '@/views/patch/search';
import { RulesPage } from '@/views/rules/page';
import { RulesSearch } from '@/views/rules/search';
import { VotesPage } from '@/views/votes/page';
import { VotesSearch } from '@/views/votes/search';
import {
  ADMIN_VIEWS,
  type AdminView,
  DEFAULT_VIEW,
  FIRST_VIEW,
  PLAYER_VIEWS,
  type PlayerView,
} from '@/views';
import { rulesSeen, SEEN_KEYS } from '@/lib/seen';

const isPlayerView = (v: string): v is PlayerView => Object.hasOwn(PLAYER_VIEWS, v);
const isAdminView = (v: string): v is AdminView => Object.hasOwn(ADMIN_VIEWS, v);

const rootRoute = createRootRoute({ component: Shell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    const view = rulesSeen(localStorage.getItem(SEEN_KEYS.rules)) ? DEFAULT_VIEW : FIRST_VIEW;
    throw redirect({ to: '/$view', params: { view } });
  },
});

// Views with their own route: their state (filters, selection) is typed in the address.
const collectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'collection',
  validateSearch: (search) => CollectionSearch.parse(search),
  component: CollectionPage,
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'historique',
  validateSearch: (search) => HistorySearch.parse(search),
  component: HistoryPage,
});

const leaderboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'classement',
  validateSearch: (search) => LeaderboardSearch.parse(search),
  component: LeaderboardPage,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'profil',
  validateSearch: (search) => ProfileSearch.parse(search),
  component: ProfilePage,
});

const deckRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'deck',
  validateSearch: (search) => DeckSearch.parse(search),
  component: DeckPage,
});

const backsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'dos',
  validateSearch: (search) => BacksSearch.parse(search),
  component: BacksPage,
});

const patchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'patch',
  validateSearch: (search) => PatchSearch.parse(search),
  component: PatchPage,
});

const rulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'regles',
  validateSearch: (search) => RulesSearch.parse(search),
  component: RulesPage,
});

// The encyclopedia: pages that are not views of the legacy page (encyclopedie/<page>).
const catalogueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'encyclopedie/catalogue',
  validateSearch: (search) => CollectionSearch.omit({ dup: true }).parse(search),
  component: CataloguePage,
});

const raritiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'encyclopedie/raretes',
  validateSearch: (search) => RaritiesSearch.parse(search),
  component: RaritiesPage,
});

const effectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'encyclopedie/effets',
  validateSearch: (search) => EffectsSearch.parse(search),
  component: EffectsPage,
});

// Pages of the site alone (SITE_PAGES).
const liveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'live',
  component: LivePage,
});

const votesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'votes',
  validateSearch: (search) => VotesSearch.parse(search),
  component: VotesPage,
});

export const viewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$view',
  params: {
    parse: ({ view }) => {
      if (!isPlayerView(view)) throw redirect({ to: '/$view', params: { view: DEFAULT_VIEW } });
      return { view };
    },
    stringify: ({ view }) => ({ view }),
  },
  component: PlayerPage,
});

export const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'admin/$sub',
  params: {
    parse: ({ sub }) => {
      if (!isAdminView(sub)) throw redirect({ to: '/admin/$sub', params: { sub: 'cartes' } });
      return { sub };
    },
    stringify: ({ sub }) => ({ sub }),
  },
  component: AdminPage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    collectionRoute,
    historyRoute,
    rulesRoute,
    patchRoute,
    backsRoute,
    deckRoute,
    profileRoute,
    leaderboardRoute,
    catalogueRoute,
    raritiesRoute,
    effectsRoute,
    liveRoute,
    votesRoute,
    viewRoute,
    adminRoute,
  ]),
  history: createHashHistory(),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
