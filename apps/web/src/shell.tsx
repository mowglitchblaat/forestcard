// The page frame: sign-in, then the dashboard layout (inset sidebar, header with the theme
// switch, the current view). Views themselves are ported slice by slice (apps/web/README.md); until
// then they show a placeholder.

import { PageSkeleton, ShellSkeleton } from '@/components/skeletons';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, getRouteApi } from '@tanstack/react-router';
import type { Session } from '@supabase/supabase-js';
import { type ReactNode, useState } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { fetchIsAdmin, fetchPlayer, playerKeys, twitchAvatar, twitchNickname } from '@/data/player';
import { signIn, useSession } from '@/lib/session';
import { usePageTitle } from '@/page-title';
import { GamesPage } from '@/views/games/page';
import { ProposalsPage } from '@/views/proposals/page';
import { ShopPage } from '@/views/shop/page';
import { ADMIN_VIEWS, type PlayerView, plainLabel, viewLabel } from '@/views';

// The sidebar's open or collapsed state, as shadcn's provider stores it on every toggle (cookie
// sidebar_state, components/ui/sidebar.tsx). The provider expects the page to read it back (a
// server would): read here, so a reload keeps the sidebar as it was. Open when there is none.
function sidebarOpenAtStart(): boolean {
  const match = /(?:^|;\s*)sidebar_state=(true|false)/.exec(document.cookie);
  return match?.[1] !== 'false';
}

export function Shell() {
  const session = useSession();
  if (session === undefined) return <ShellSkeleton />;
  if (session === null) return <SignedOut />;
  return <SignedIn session={session} />;
}

function SignedOut() {
  const [signingIn, setSigningIn] = useState(false);
  return (
    <main className="mx-auto max-w-5xl p-4">
      <div className="flex justify-end gap-2">
        <ThemeToggle />
        {/* Until Twitch takes over the page: a second click would start a second sign-in. */}
        <Button
          disabled={signingIn}
          onClick={() => {
            setSigningIn(true);
            signIn();
          }}
        >
          {signingIn ? 'Connexion…' : 'Se connecter avec Twitch'}
        </Button>
      </div>
      <p className="mt-4">Connecte-toi avec ton compte Twitch pour voir ta collection.</p>
    </main>
  );
}

function SignedIn({ session }: { session: Session }) {
  const userId = session.user.id;
  // The legacy page re-reads the gold every 45 s while the tab is visible.
  const player = useQuery({
    queryKey: playerKeys.player(userId),
    queryFn: () => fetchPlayer(userId),
    refetchInterval: 45_000,
  });
  const isAdmin = useQuery({ queryKey: playerKeys.isAdmin(userId), queryFn: fetchIsAdmin });

  if (player.error) return <Failure error={player.error} />;
  if (isAdmin.error) return <Failure error={isAdmin.error} />;
  if (!player.data || isAdmin.data === undefined) return <ShellSkeleton />;

  return (
    <SidebarProvider defaultOpen={sidebarOpenAtStart()}>
      <AppSidebar
        player={player.data}
        avatar={twitchAvatar(session.user.user_metadata)}
        nickname={twitchNickname(session.user.user_metadata)}
        isAdmin={isAdmin.data}
      />
      <SidebarInset>
        <PageHeader />
        <div className="flex-1 p-4">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

// As the shadcn dashboard: a border under the header, a separator between the sidebar button and
// the page title.
function PageHeader() {
  const title = usePageTitle();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mx-2 data-vertical:h-4 data-vertical:self-center"
      />
      <h1 className="text-base font-medium">{title}</h1>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}

function Failure({ error }: { error: Error }) {
  return (
    <main className="mx-auto max-w-5xl p-4">
      <p role="alert">Erreur : {error.message}</p>
    </main>
  );
}

const viewApi = getRouteApi('/$view');
const adminApi = getRouteApi('/admin/$sub');

// The ported views; the others show a placeholder.
// (A view with its own route, like the collection, is not listed here: see router.tsx.)
const PORTED: Partial<Record<PlayerView, () => ReactNode>> = {
  boutique: ShopPage,
  propos: ProposalsPage,
  jeux: GamesPage,
};

export function PlayerPage() {
  const { view } = viewApi.useParams();
  const View = PORTED[view];
  return View ? <View /> : <Pending title={viewLabel(view)} />;
}

export function AdminPage() {
  const { sub } = adminApi.useParams();
  const session = useSession();
  const userId = session?.user.id ?? '';
  const isAdmin = useQuery({
    queryKey: playerKeys.isAdmin(userId),
    queryFn: fetchIsAdmin,
    enabled: userId !== '',
  });
  if (isAdmin.data === false) return <Navigate to="/" />;
  if (!isAdmin.data) return <PageSkeleton />;
  return <Pending title={`Admin · ${plainLabel(ADMIN_VIEWS[sub])}`} />;
}

// The page title is in the header (PageHeader).
function Pending({ title }: { title: string }) {
  return <p className="text-muted-foreground">{title} : pas encore portée.</p>;
}
