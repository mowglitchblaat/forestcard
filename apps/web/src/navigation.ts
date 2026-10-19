// The sidebar's sections: views grouped by what the player comes to do, not in the legacy page's
// order. "Comment jouer" sits at the bottom, with the player menu: help, not a destination.
// Every view appears exactly once (test/navigation.test.ts).

import type { AdminView, EncyclopediaPage, PlayerView, SitePage } from '@/views';

export type NavGroup<V> = { label: string; views: V[] };
// An entry of the player sections: a view of the legacy page, a page of the encyclopedia, or a
// page of the site alone.
export type NavItem = { view: PlayerView } | { page: EncyclopediaPage } | { site: SitePage };

const views = (...list: PlayerView[]): NavItem[] => list.map((view) => ({ view }));

export const PLAYER_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'Stream', items: [{ site: 'live' }] },
  { label: 'Mes cartes', items: views('collection', 'deck', 'dos') },
  { label: 'Gold', items: views('jeux', 'boutique') },
  { label: 'Combats', items: views('historique', 'classement') },
  {
    label: 'Encyclopédie',
    items: [{ page: 'catalogue' }, { page: 'raretes' }, { page: 'effets' }],
  },
  { label: 'Communauté', items: [...views('profil', 'propos', 'patch'), { site: 'votes' }] },
];

// At the bottom of the sidebar.
export const FOOTER_VIEWS: PlayerView[] = ['regles'];

export const ADMIN_GROUPS: NavGroup<AdminView>[] = [
  {
    label: 'Admin · Contenu',
    views: ['cartes', 'collections', 'raretes', 'effets', 'boosters', 'dos'],
  },
  { label: 'Admin · Joueurs', views: ['joueurs', 'cadeaux'] },
  { label: 'Admin · Communauté', views: ['votes', 'propos'] },
  { label: 'Admin · Réglages', views: ['reglages'] },
];
