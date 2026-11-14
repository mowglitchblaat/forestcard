// The navigation: an inset sidebar (the content beside it is a rounded card) that collapses to icons.
// Views grouped by section (src/navigation.ts); the admin sections only for admins; "Comment jouer"
// and the player menu at the bottom.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { TONES } from '@/lib/tones';
import { ICONS, type LucideIcon } from '@/lib/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import type { Player } from '@/data/player';
import { Fragments, Gold, TierFragments } from '@/components/money';
import { signOut } from '@/lib/session';
import { usePatchNotesFingerprint } from '@/data/patchnotes-query';
import { patchNotesNew, rulesSeen, SEEN_KEYS, unseen, useSeen } from '@/lib/seen';
import { BACKS_REFRESH, backIds, backKeys, fetchBacks } from '@/data/backs';
import {
  fetchShop,
  fetchStock,
  offerKeys,
  SHOP_REFRESH,
  shopKeys,
  STOCK_REFRESH,
} from '@/data/shop';
import { fetchGameState, gameStateKey } from '@/data/admin';
import { EVENTS_REFRESH, eventTodo, fetchEvents, loreKeys } from '@/data/lore';
import {
  ANNOUNCEMENTS_REFRESH,
  announcementIds,
  announcementKeys,
  fetchAnnouncements,
} from '@/data/announcements';
import { useSession } from '@/lib/session';
import {
  countdown,
  dailyGamesKeys,
  fetchDailyGames,
  gamesOver,
  minutesToMidnight,
} from '@/data/daily-games';
import { ADMIN_GROUPS, FOOTER_VIEWS, PLAYER_GROUPS } from '@/navigation';
import {
  ADMIN_VIEWS,
  type AdminView,
  ENCYCLOPEDIA_PAGES,
  type EncyclopediaPage,
  type PlayerView,
  plainLabel,
  SITE_PAGES,
  type SitePage,
  viewLabel,
} from '@/views';

const PLAYER_ICONS: Record<PlayerView, LucideIcon> = {
  collection: ICONS.collection,
  boutique: ICONS.shop,
  jeux: ICONS.dailyGames,
  deck: ICONS.deck,
  echanges: ICONS.exchanges,
  dos: ICONS.backs,
  historique: ICONS.history,
  profil: ICONS.profile,
  classement: ICONS.leaderboard,
  ceintures: ICONS.belts,
  tournois: ICONS.tournaments,
  regles: ICONS.rules,
  propos: ICONS.proposals,
  patch: ICONS.patchNotes,
};

const ADMIN_ICONS: Record<AdminView, LucideIcon> = {
  cartes: ICONS.cards,
  collections: ICONS.collections,
  boosters: ICONS.booster,
  effets: ICONS.effects,
  raretes: ICONS.rarities,
  cadeaux: ICONS.gifts,
  dos: ICONS.backs,
  reglages: ICONS.settings,
  joueurs: ICONS.players,
  tournois: ICONS.tournaments,
  recompenses: ICONS.rewards,
  annonces: ICONS.announcements,
  lore: ICONS.lore,
  votes: ICONS.votes,
  propos: ICONS.proposals,
};

export function AppSidebar({
  player,
  avatar,
  nickname,
  isAdmin,
}: {
  player: Player;
  avatar: string | null;
  nickname: string | null;
  isAdmin: boolean;
}) {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Collapsed to icons, the button is 32 px wide with no padding: the name hides, the tree
                centres (else the F of the name showed beside it). */}
            <SidebarMenuButton
              size="lg"
              className="group-data-[collapsible=icon]:justify-center"
              asChild
            >
              <Link to="/">
                <ICONS.brand />
                <span className="font-semibold group-data-[collapsible=icon]:hidden">
                  Forest Card
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {PLAYER_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) =>
                  'view' in item ? (
                    <PlayerLink key={item.view} view={item.view} />
                  ) : 'page' in item ? (
                    <EncyclopediaLink key={item.page} page={item.page} />
                  ) : (
                    <SiteLink key={item.site} page={item.site} isAdmin={isAdmin} />
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        {isAdmin &&
          ADMIN_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.views.map((sub) => {
                    const Icon = ADMIN_ICONS[sub];
                    const label = plainLabel(ADMIN_VIEWS[sub]);
                    return (
                      <SidebarMenuItem key={sub}>
                        <SidebarMenuButton asChild tooltip={label}>
                          <Link
                            to="/admin/$sub"
                            params={{ sub }}
                            activeProps={{ 'data-active': true }}
                          >
                            <Icon />
                            <span>{label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {FOOTER_VIEWS.map((view) => (
            <PlayerLink key={view} view={view} />
          ))}
        </SidebarMenu>
        <PlayerMenu player={player} avatar={avatar} nickname={nickname} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

const ENCYCLOPEDIA_ICONS: Record<EncyclopediaPage, LucideIcon> = {
  catalogue: ICONS.catalogue,
  raretes: ICONS.rarities,
  effets: ICONS.effects,
  terrains: ICONS.terrains,
};

function EncyclopediaLink({ page }: { page: EncyclopediaPage }) {
  const Icon = ENCYCLOPEDIA_ICONS[page];
  const label = ENCYCLOPEDIA_PAGES[page];
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={label}>
        <Link to={`/encyclopedie/${page}`} activeProps={{ 'data-active': true }}>
          <Icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

const SITE_ICONS: Record<SitePage, LucideIcon> = {
  jouer: ICONS.play,
  annonces: ICONS.announcements,
  lore: ICONS.lore,
  live: ICONS.live,
  votes: ICONS.votes,
  atelier: ICONS.workshop,
};

function SiteLink({ page, isAdmin }: { page: SitePage; isAdmin: boolean }) {
  const game = useQuery({ queryKey: gameStateKey, queryFn: fetchGameState, staleTime: 60_000 });
  const Icon = SITE_ICONS[page];
  // « Jouer » only while the game is paused on the site; the admin always sees it, to test.
  if (page === 'jouer' && !isAdmin && (!game.data || game.data.live || game.data.closed))
    return null;
  const label = SITE_PAGES[page];
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={label}>
        <Link to={`/${page}`} activeProps={{ 'data-active': true }}>
          <span className="relative">
            <Icon />
            {page === 'annonces' && <AnnouncementsDot />}
            {page === 'lore' && <LoreDot />}
          </span>
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// An open event the player has not joined (blue), or a result not seen yet (yellow).
function LoreDot() {
  const list = useQuery({
    queryKey: loreKeys.events,
    queryFn: fetchEvents,
    staleTime: EVENTS_REFRESH,
    refetchInterval: 5 * EVENTS_REFRESH,
    retry: false,
  }).data;
  const todo = list ? eventTodo(list) : null;
  return todo === 'news' ? (
    <NewDot kind="news" />
  ) : todo === 'todo' ? (
    <NewDot kind="event" />
  ) : null;
}

// Announcements not seen yet (yellow), or an open vote not answered yet (blue).
function AnnouncementsDot() {
  const seen = useSeen(SEEN_KEYS.announcements);
  const list = useQuery({
    queryKey: announcementKeys.all,
    queryFn: fetchAnnouncements,
    staleTime: ANNOUNCEMENTS_REFRESH,
    refetchInterval: ANNOUNCEMENTS_REFRESH,
    retry: false,
  }).data;
  if (!list) return null;
  if (unseen(seen, announcementIds(list)).length > 0) return <NewDot kind="news" />;
  if (list.some((a) => a.type === 'vote' && a.ouvert && a.mon_vote === null))
    return <NewDot kind="vote" />;
  return null;
}

function PlayerLink({ view }: { view: PlayerView }) {
  const Icon = PLAYER_ICONS[view];
  const label = viewLabel(view);
  const rules = useSeen(SEEN_KEYS.rules);
  const patchSeen = useSeen(SEEN_KEYS.patchNotes);
  const patchNotes = usePatchNotesFingerprint();
  const backsSeen = useSeen(SEEN_KEYS.backs);
  const backs = useQuery({
    queryKey: backKeys.mine,
    queryFn: fetchBacks,
    staleTime: BACKS_REFRESH,
    refetchInterval: BACKS_REFRESH,
    retry: false,
  }).data;
  // The player may play on the legacy page too: re-read every 5 minutes.
  const daily = useQuery({
    queryKey: dailyGamesKeys.state,
    queryFn: fetchDailyGames,
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  }).data;
  const userId = useSession()?.user.id ?? '';
  const shopSeen = useSeen(SEEN_KEYS.shop);
  const offers = useQuery({
    queryKey: shopKeys.offers,
    queryFn: fetchShop,
    staleTime: SHOP_REFRESH,
    refetchInterval: SHOP_REFRESH,
    retry: false,
  }).data;
  const stock = useQuery({
    queryKey: shopKeys.stock(userId),
    queryFn: () => fetchStock(userId),
    enabled: userId !== '',
    refetchInterval: STOCK_REFRESH,
    retry: false,
  }).data;
  const dot =
    view === 'regles' && !rulesSeen(rules)
      ? 'rules'
      : (view === 'patch' && patchNotesNew(patchSeen, patchNotes)) ||
          (view === 'dos' && unseen(backsSeen, backs && backIds(backs)).length > 0) ||
          (view === 'boutique' && unseen(shopSeen, offers && offerKeys(offers)).length > 0)
        ? 'news'
        : view === 'jeux' && daily && !gamesOver(daily)
          ? 'todo'
          : // Boosters bought and not opened yet (live, !booster).
            view === 'boutique' && stock && stock.length > 0
            ? 'stock'
            : null;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={label}>
        <Link to="/$view" params={{ view }} activeProps={{ 'data-active': true }}>
          <span className="relative">
            <Icon />
            {dot && <NewDot kind={dot} />}
          </span>
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
      {view === 'jeux' && daily && gamesOver(daily) && <UntilMidnight />}
    </SidebarMenuItem>
  );
}

// Every daily game over: the time left until they open again, at midnight in Paris. Past
// midnight, the games' state is re-read (the dot comes back).
function UntilMidnight() {
  const client = useQueryClient();
  const [minutes, setMinutes] = useState(() => minutesToMidnight(new Date()));
  const last = useRef(minutes);
  useEffect(() => {
    const tick = setInterval(() => {
      const now = minutesToMidnight(new Date());
      if (now > last.current) void client.invalidateQueries({ queryKey: dailyGamesKeys.state });
      last.current = now;
      setMinutes(now);
    }, 30_000);
    return () => clearInterval(tick);
  }, [client]);
  const left = countdown(minutes);
  return (
    // A pill, like a label: the time left reads apart from the entry's name.
    <SidebarMenuBadge title={`Nouveaux jeux dans ${left}`}>
      <span className="flex items-center gap-1 rounded-full border border-sidebar-border bg-sidebar-accent px-2 text-sidebar-accent-foreground">
        <ICONS.wait className="size-3" />
        {left}
      </span>
    </SidebarMenuBadge>
  );
}

// A small dot whose border pulses: blue, not read or not played yet; yellow, something new since
// the last visit.
const DOTS = {
  rules: { ring: TONES.info.border, fill: TONES.info.fill, label: 'Pas encore lu' },
  todo: { ring: TONES.info.border, fill: TONES.info.fill, label: "Encore à jouer aujourd'hui" },
  stock: { ring: TONES.info.border, fill: TONES.info.fill, label: 'Des boosters à ouvrir en live' },
  event: { ring: TONES.info.border, fill: TONES.info.fill, label: 'Un événement attend ton aide' },
  vote: { ring: TONES.info.border, fill: TONES.info.fill, label: 'Un vote attend ta voix' },
  news: { ring: TONES.new.border, fill: TONES.new.fill, label: 'Du nouveau' },
};

function NewDot({ kind }: { kind: keyof typeof DOTS }) {
  const { ring, fill, label } = DOTS[kind];
  return (
    <span aria-label={label} className="absolute -top-1 -right-1 flex size-2.5">
      <span
        className={`absolute inline-flex size-full animate-ping rounded-full border-2 ${ring}`}
      />
      <span className={`relative inline-flex size-2.5 rounded-full ${fill}`} />
    </span>
  );
}

function PlayerMenu({
  player,
  avatar,
  nickname,
}: {
  player: Player;
  avatar: string | null;
  nickname: string | null;
}) {
  const { monnaie, fragments } = player;
  // The atelier's rarity fragments the player has.
  const tiers = (
    [
      ['epique', player.fragments_epique],
      ['legendaire', player.fragments_legendaire],
      ['ggez', player.fragments_ggez],
    ] as const
  ).filter(([, n]) => (n ?? 0) > 0);
  const wallet = (
    <>
      <Gold n={monnaie} />
      {fragments !== null && fragments > 0 && (
        <>
          {' · '}
          <Fragments n={fragments} />
        </>
      )}
      {tiers.map(([tier, n]) => (
        <span key={tier}>
          {' · '}
          <TierFragments tier={tier} n={n ?? 0} />
        </span>
      ))}
    </>
  );
  // The Twitch display name, with its capitals; the pseudo of `joueurs` when absent.
  const pseudo = nickname ?? player.pseudo;
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <Avatar className="size-8 rounded-lg">
                {avatar && <AvatarImage src={avatar} alt={pseudo} />}
                <AvatarFallback className="rounded-lg">
                  {pseudo.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{pseudo}</span>
                <span className="truncate text-xs text-muted-foreground">{wallet}</span>
              </div>
              <ICONS.menu className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end">
            <DropdownMenuLabel>{wallet}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <ICONS.logOut />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
