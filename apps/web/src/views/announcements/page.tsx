// Announcements (58-annonces.sql): the admin's news, newest first, and the votes, where a player
// picks one option (each with its picture) and may change it while the vote is open. The counts
// show once the player voted, once the vote is closed, and always to the admin. A shared puzzle
// (59-puzzle.sql, puzzle.tsx) shows its board instead of its picture. Opening the page
// marks every announcement seen (the sidebar's dot).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  type Announcement,
  announcementIds,
  announcementKeys,
  ANNOUNCEMENTS_REFRESH,
  fetchAnnouncements,
  share,
  voteAnnouncement,
} from '@/data/announcements';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { ICONS } from '@/lib/icons';
import { listMark, markSeen, SEEN_KEYS } from '@/lib/seen';
import { useSession } from '@/lib/session';
import { PuzzleGame } from './puzzle';

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function AnnouncementsPage() {
  const list = useQuery({
    queryKey: announcementKeys.all,
    queryFn: fetchAnnouncements,
    refetchInterval: ANNOUNCEMENTS_REFRESH,
  });
  useEffect(() => {
    if (list.data) markSeen(SEEN_KEYS.announcements, listMark(announcementIds(list.data)));
  }, [list.data]);

  if (list.error) return <p className="text-destructive">{list.error.message}</p>;
  if (!list.data) return <PageSkeleton />;
  if (!list.data.length)
    return <p className="text-muted-foreground">Aucune annonce pour l'instant.</p>;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {list.data.map((a) => (
        <AnnouncementCard key={a.id} announcement={a} />
      ))}
    </div>
  );
}

export function AnnouncementCard({
  announcement: a,
  children,
}: {
  announcement: Announcement;
  children?: ReactNode;
}) {
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const images = mirror.data ?? new Set<string>();
  const picture = imageUrl(a.image_path, images);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {a.type === 'vote' ? (
            <ICONS.votes />
          ) : a.type === 'puzzle' ? (
            <ICONS.puzzle />
          ) : (
            <ICONS.announcements />
          )}
          {a.titre}
          {a.type === 'vote' &&
            (a.ouvert ? (
              <Badge variant="info">Vote ouvert</Badge>
            ) : (
              <Badge variant="secondary">
                <ICONS.closed />
                Vote clos
              </Badge>
            ))}
        </CardTitle>
        <CardDescription>{dateOf(a.cree_le)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {picture && a.type !== 'puzzle' && (
          <img src={picture} alt="" className="w-full rounded-lg" />
        )}
        {a.texte && <p className="whitespace-pre-line">{a.texte}</p>}
        {a.type === 'vote' && <VoteOptions announcement={a} images={images} />}
        {a.type === 'puzzle' && a.puzzle && <PuzzleGame announcement={a} images={images} />}
        {children}
      </CardContent>
    </Card>
  );
}

function VoteOptions({
  announcement: a,
  images,
}: {
  announcement: Announcement;
  images: Set<string>;
}) {
  const client = useQueryClient();
  const signedIn = !!useSession();
  const vote = useMutation({
    mutationFn: voteAnnouncement,
    onSettled: () => client.invalidateQueries({ queryKey: announcementKeys.all }),
  });
  const best = Math.max(0, ...a.options.map((o) => o.voix ?? 0));
  const canVote = a.ouvert && signedIn && !vote.isPending;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {a.options.map((o) => {
          const mine = a.mon_vote === o.id;
          const picture = imageUrl(o.image_path, images);
          const pct = share(o.voix, a.total);
          const winner = !a.ouvert && best > 0 && (o.voix ?? 0) === best;
          return (
            <button
              key={o.id}
              type="button"
              disabled={!canVote}
              onClick={() => vote.mutate(o.id)}
              className={`flex flex-col gap-2 rounded-xl border p-2 text-left transition enabled:cursor-pointer enabled:hover:-translate-y-0.5 enabled:hover:bg-muted ${mine ? 'bg-primary/10 ring-2 ring-primary' : ''}`}
            >
              {picture && (
                <img
                  src={picture}
                  alt=""
                  loading="lazy"
                  className="aspect-4/3 w-full rounded-lg bg-muted object-contain"
                />
              )}
              <span className="flex items-center gap-2 font-medium">
                {mine && <ICONS.done className="size-4" />}
                {winner && <ICONS.leaderboard className="size-4" />}
                {o.libelle}
              </span>
              {a.resultats && (
                <span className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <Progress value={pct} />
                  {pct} % · {o.voix ?? 0} voix
                </span>
              )}
            </button>
          );
        })}
      </div>
      <small className="text-muted-foreground">
        {!a.ouvert
          ? `Vote clos · ${a.total ?? 0} votant${(a.total ?? 0) > 1 ? 's' : ''}.`
          : !signedIn
            ? 'Connecte-toi pour voter.'
            : a.mon_vote === null
              ? 'Clique sur ton choix pour voter. Les résultats s’affichent après ton vote.'
              : `Merci pour ton vote ! Tu peux changer d’avis tant que le vote est ouvert · ${a.total ?? 0} votant${(a.total ?? 0) > 1 ? 's' : ''}.`}
      </small>
      {vote.error && (
        <small role="alert" className="text-destructive">
          {vote.error.message}
        </small>
      )}
    </div>
  );
}
