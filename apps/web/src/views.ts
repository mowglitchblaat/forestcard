// The views of the site, with the labels and anchors of the legacy page (TABS, VUES, and the admin
// sub-views of vAdmin). Anchors stay the same so links and bookmarks keep working at cutover.

export const PLAYER_VIEWS = {
  collection: 'Ma collection',
  boutique: 'Boutique',
  jeux: '\u{1F3B2} Jeux du jour',
  deck: 'Mon deck',
  dos: 'Dos de cartes',
  historique: 'Historique',
  profil: 'Profils',
  classement: '\u{1F3C6} Classement',
  regles: 'Comment jouer',
  propos: '\u{1F3A8} Propositions',
  patch: '\u{1F4DC} Patch notes',
} as const;
export type PlayerView = keyof typeof PLAYER_VIEWS;

// Pages of the encyclopedia: not in the legacy page, where they were parts of "Comment jouer"
// (rarities, effects) or a separate printable page (catalogue.html).
export const ENCYCLOPEDIA_PAGES = {
  catalogue: 'Catalogue',
  raretes: 'Raretés',
  effets: 'Effets',
} as const;
export type EncyclopediaPage = keyof typeof ENCYCLOPEDIA_PAGES;

// Pages of the site alone, not in the legacy page.
export const SITE_PAGES = {
  live: 'Le live',
  votes: 'Votes',
} as const;
export type SitePage = keyof typeof SITE_PAGES;

export const ADMIN_LABEL = '\u{2699}\u{FE0F} Admin';

export const ADMIN_VIEWS = {
  cartes: 'Cartes',
  collections: 'Collections',
  boosters: 'Boosters',
  effets: 'Effets',
  raretes: 'Raretés',
  cadeaux: 'Cadeaux',
  dos: 'Dos de cartes',
  reglages: 'Réglages',
  joueurs: 'Joueurs',
  votes: '\u{1F5F3}\u{FE0F} Votes',
  propos: '\u{1F3A8} Propositions',
} as const;
export type AdminView = keyof typeof ADMIN_VIEWS;

// A label without its leading emoji, for places that show an icon instead (the sidebar).
export const plainLabel = (label: string): string =>
  label.replace(/^\p{Extended_Pictographic}\u{FE0F}?\s*/u, '');

// Where the site names a view differently from the legacy page (PLAYER_VIEWS stays the legacy's,
// checked by test/views.test.ts against upstream). "Mes decks": a player keeps several.
const SITE_LABELS: Partial<Record<PlayerView, string>> = { deck: 'Mes decks' };

// A player view's name on the site, without emoji.
export const viewLabel = (view: PlayerView): string =>
  plainLabel(SITE_LABELS[view] ?? PLAYER_VIEWS[view]);

// The view the app opens on: the collection. The legacy page opened on the profile, to load no card
// images and save Supabase quota; here images come from the GitHub mirror first (data/images.ts).
export const DEFAULT_VIEW: PlayerView = 'collection';
// A first visit opens on the rules instead: until the player has seen them (lib/seen.ts, the key
// the rules page sets).
export const FIRST_VIEW: PlayerView = 'regles';

// Legacy anchors (`#collection`, `#admin/cartes`) to the router's (`#/collection`, `#/admin/cartes`).
// Only exact view anchors are rewritten: the OAuth return (`#access_token=…`, `#error=…`) is left for
// the Supabase client to read.
export function routerHash(hash: string): string | null {
  const match = /^#([a-z]+)(?:\/([a-z]+))?$/.exec(hash);
  if (!match) return null;
  const [, view, sub] = match;
  if (view === 'admin') return sub && sub in ADMIN_VIEWS ? `#/admin/${sub}` : '#/admin/cartes';
  return view !== undefined && view in PLAYER_VIEWS && sub === undefined ? `#/${view}` : null;
}
