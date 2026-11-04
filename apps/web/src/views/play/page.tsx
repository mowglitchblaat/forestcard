// Jouer (the legacy page's vJouer): shown to the players while the game is paused for a let's play
// (always to the admin, to test). Their boosters to open, the daily booster, the daily combat and a
// duel paid in gold, each played with the stream's animation in a full-screen scene.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchGameState, gameStateKey } from '@/data/admin';
import { dailyBooster, fetchStock, fight, openBooster, playKeys } from '@/data/play';
import { fetchIsAdmin, playerKeys } from '@/data/player';
import { useSession } from '@/lib/session';
import { ICONS } from '@/lib/icons';

type Scene = { page: string; message: unknown } | null;

// The animation in a frame over the page: sent its data once loaded, closed when it says it is done
// (a message ending in "-fini" from this site), or by the button.
function SceneFrame({ scene, onDone }: { scene: NonNullable<Scene>; onDone: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const listen = (e: MessageEvent<unknown>) => {
      const data = e.data as { fc?: unknown } | null;
      if (e.origin === location.origin && typeof data?.fc === 'string' && /-fini$/.test(data.fc))
        setTimeout(onDone, 600);
    };
    addEventListener('message', listen);
    document.body.style.overflow = 'hidden';
    return () => {
      removeEventListener('message', listen);
      document.body.style.overflow = '';
    };
  }, [onDone]);
  return (
    <div className="fixed inset-0 z-50 bg-background">
      <iframe
        ref={frame}
        src={scene.page}
        title="Animation"
        className="size-full border-0"
        onLoad={() =>
          setTimeout(
            () => frame.current?.contentWindow?.postMessage(scene.message, location.origin),
            400,
          )
        }
      />
      <Button variant="secondary" className="absolute top-3 right-3" onClick={onDone}>
        <ICONS.remove />
        Fermer
      </Button>
    </div>
  );
}

export function PlayPage() {
  const me = useSession()?.user.id ?? '';
  const admin = useQuery({
    queryKey: playerKeys.isAdmin(me),
    queryFn: fetchIsAdmin,
    enabled: me !== '',
  });
  const isAdmin = admin.data === true;
  const client = useQueryClient();
  const state = useQuery({ queryKey: gameStateKey, queryFn: fetchGameState });
  const stock = useQuery({
    queryKey: playKeys.stock(me),
    queryFn: () => fetchStock(me),
    enabled: me !== '',
  });
  const [scene, setScene] = useState<Scene>(null);
  const [message, setMessage] = useState('');
  const [opponent, setOpponent] = useState('');
  const refresh = () => client.invalidateQueries();
  const open = useMutation({
    mutationFn: openBooster,
    onSuccess: (res) => setScene({ page: 'overlay.html?site', message: { fc: 'booster', res } }),
    onSettled: refresh,
  });
  const daily = useMutation({
    mutationFn: dailyBooster,
    onSuccess: setMessage,
    onSettled: refresh,
  });
  const combat = useMutation({
    mutationFn: fight,
    onSuccess: (r) => {
      if ('replay' in r) {
        setScene({ page: 'combat.html?site', message: { fc: 'combat', res: r.replay } });
        setMessage(r.announce ?? '');
      } else setMessage(r.message);
    },
    onSettled: refresh,
  });

  if (state.error) return <p role="alert">{state.error.message}</p>;
  if (!state.data || !stock.data) return <PageSkeleton />;
  const g = state.data;
  if (!isAdmin && (g.live || g.closed))
    return (
      <p className="text-muted-foreground">
        Le jeu n'est pas en pause : on joue en live, dans le chat.
      </p>
    );
  const total = stock.data.reduce((a, x) => a + x.quantite, 0);
  const busy = open.isPending || daily.isPending || combat.isPending;
  const error = open.error ?? daily.error ?? combat.error;

  return (
    <div className="flex flex-col gap-6">
      {scene && <SceneFrame scene={scene} onDone={() => setScene(null)} />}
      <Alert variant={g.closed || g.live ? 'warning' : 'note'}>
        <ICONS.play />
        <AlertDescription>
          {g.closed
            ? '🔒 Le jeu est fermé : cette page n’est visible que par toi (admin), pour tester.'
            : g.live
              ? 'Le jeu est en live en ce moment : cette page n’est visible que par toi (admin), pour tester.'
              : '🎬 Le jeu est en pause pendant le let’s play : ouvre tes boosters et fais tes combats ici, avec les mêmes animations qu’en live.'}
        </AlertDescription>
      </Alert>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>🎁 Boosters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <span>
              {stock.data.length
                ? stock.data
                    .map((x) => `${x.types_boosters?.nom ?? 'Booster'} ×${x.quantite}`)
                    .join(' · ')
                : 'Aucun booster à ouvrir.'}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !total} onClick={() => open.mutate()}>
                Ouvrir un booster
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => daily.mutate()}>
                🎁 Booster du jour
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>⚔️ Combats</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <span className="text-muted-foreground">
              Les mêmes combats qu'en live : mêmes récompenses, même nombre de combats gratuits par
              jour.
            </span>
            <div>
              <Button disabled={busy} onClick={() => combat.mutate(null)}>
                Combat du jour
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="Pseudo du joueur à défier"
                className="min-w-40 flex-1"
              />
              <Button
                variant="outline"
                disabled={busy || !opponent.trim()}
                onClick={() => combat.mutate(opponent.trim().replace(/^@/, ''))}
              >
                ⚔️ Duel · 💰 {g.duelPrice}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      {message && <p className="text-sm">{message}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
    </div>
  );
}
