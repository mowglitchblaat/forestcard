// "Le live" (the site alone): the streamer's player and chat, embedded, and beside them what the
// chat commands act on: the boosters waiting for !booster, the combat deck, the daily games left.
// Whether the channel is live is not known here: off air, the player shows Twitch's own offline
// screen. Knowing it everywhere (sidebar, boosters) needs the channel's state in the database
// (apps/web/README.md, backlog).

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ICONS } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dailyGamesKeys, fetchDailyGames, gamesLeft } from '@/data/daily-games';
import { deckKeys, fetchCombatDeck, fetchDecks } from '@/data/decks';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { fetchStock, shopKeys } from '@/data/shop';
import { channelUrl, chatUrl, playerUrl, popoutChatUrl } from '@/data/twitch';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { combatDeckId, DECK_SIZE } from '@/views/deck/model';
import { BoosterPack, MAX_SHOWN } from '@/views/shop/page';

export function LivePage() {
  const host = location.hostname;
  const { theme } = useTheme();
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <div className="grid items-start gap-4 lg:layout-main-aside-22">
      <div className="flex flex-col gap-4">
        <iframe
          title="Le live de la chaîne"
          src={playerUrl(host)}
          allowFullScreen
          className="aspect-video w-full rounded-xl border bg-black"
        />
        <ForTheLive />
      </div>
      <div className="flex flex-col gap-2 lg:sticky lg:top-4">
        {/* A new frame when the theme changes: the chat's theme is in its address. */}
        <iframe
          key={String(dark)}
          title="Le chat de la chaîne"
          src={chatUrl(host, dark)}
          className="h-128 w-full rounded-xl border lg:h-live"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={popoutChatUrl} target="_blank" rel="noreferrer">
              <ICONS.externalLink /> Chat dans Twitch
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={channelUrl} target="_blank" rel="noreferrer">
              <ICONS.externalLink /> La chaîne
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Pour écrire dans le chat, connecte-toi à Twitch dans ce navigateur. Si le chat reste en
          lecture seule (cookies tiers bloqués), ouvre-le dans Twitch.
        </p>
      </div>
    </div>
  );
}

// What the chat commands act on, as it stands now.
function ForTheLive() {
  const userId = useSession()?.user.id ?? '';
  const stock = useQuery({
    queryKey: shopKeys.stock(userId),
    queryFn: () => fetchStock(userId),
    enabled: userId !== '',
  });
  const decks = useQuery({ queryKey: deckKeys.saved, queryFn: fetchDecks });
  const combat = useQuery({
    queryKey: deckKeys.combat(userId),
    queryFn: () => fetchCombatDeck(userId),
    enabled: userId !== '',
  });
  const games = useQuery({ queryKey: dailyGamesKeys.state, queryFn: fetchDailyGames });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const images = mirror.data ?? new Set<string>();
  const boosters = (stock.data ?? []).reduce((n, s) => n + s.quantite, 0);
  const deckName =
    decks.data && combat.data
      ? (decks.data.find((d) => d.id === combatDeckId(decks.data, combat.data))?.nom ?? 'Sans nom')
      : null;
  const left = games.data ? gamesLeft(games.data) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ICONS.booster className="size-4" /> Pour le live
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <section className="flex flex-col gap-2">
          <p>
            {stock.data === undefined ? (
              <span className="text-muted-foreground">Boosters…</span>
            ) : boosters > 0 ? (
              <>
                <b>
                  {boosters} booster{boosters > 1 ? 's' : ''} à ouvrir
                </b>{' '}
                : tape <code>!booster</code> dans le chat.
              </>
            ) : (
              <>
                Aucun booster à ouvrir.{' '}
                <Link to="/$view" params={{ view: 'boutique' }} className="underline">
                  La boutique
                </Link>
              </>
            )}
          </p>
          {boosters > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              {(stock.data ?? []).flatMap((s, i) =>
                Array.from({ length: Math.min(s.quantite, MAX_SHOWN) }, (_, n) => (
                  <BoosterPack
                    key={`${i}-${n}`}
                    name={s.types_boosters?.nom ?? 'Booster'}
                    image={imageUrl(s.types_boosters?.image_path ?? null, images)}
                    more={n === MAX_SHOWN - 1 ? s.quantite - MAX_SHOWN : 0}
                  />
                )),
              )}
            </div>
          )}
        </section>
        <p>
          Deck de combat :{' '}
          {combat.data === undefined || deckName === null ? (
            <span className="text-muted-foreground">…</span>
          ) : combat.data.length === 0 ? (
            <>
              aucun.{' '}
              <Link to="/deck" className="underline">
                Compose-le
              </Link>
            </>
          ) : (
            <Link to="/deck" className="underline">
              <b>{deckName}</b> ({combat.data.length}/{DECK_SIZE})
            </Link>
          )}
        </p>
        <p>
          Jeux du jour :{' '}
          {left === null ? (
            <span className="text-muted-foreground">…</span>
          ) : left === 0 ? (
            'tous joués.'
          ) : (
            <Link to="/$view" params={{ view: 'jeux' }} className="underline">
              {left} à jouer
            </Link>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
