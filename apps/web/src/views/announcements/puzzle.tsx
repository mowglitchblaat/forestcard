// The shared puzzle of an announcement (59-puzzle.sql, 63-puzzle-pieces-secretes.sql): the picture
// cut in columns × rows, each piece its own small image with a random token, so nothing in the page
// tells where a piece of the hand goes. The board shows the pieces placed by everyone; each player
// gets a few pieces a day (their hand) and drops each one on a cell, by dragging it or by picking it
// then the cell (phones). The right cell places it for everyone; a wrong one sends it back to the
// hand and counts as a miss: at the last miss allowed in a day, the player waits a few hours. Behind
// the board, a tiny copy of the picture, very blurred, guides the first pieces. Once the last piece
// is placed, the board shows every piece.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  type Announcement,
  announcementKeys,
  fetchPuzzleHand,
  placePuzzlePiece,
  type Puzzle,
  puzzleHandKey,
} from '@/data/announcements';
import { imageUrl } from '@/data/images';
import { ICONS } from '@/lib/icons';
import { useSession } from '@/lib/session';

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
const hour = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

// The board's proportions (width / height of the picture).
const ratioOf = (p: Puzzle) => (p.ratio && p.ratio > 0 ? p.ratio : 1);

function Piece({ src }: { src: string | null }) {
  return src ? (
    <img src={src} alt="" draggable={false} className="block size-full select-none" />
  ) : (
    <span className="block size-full bg-muted" />
  );
}

export function PuzzleGame({
  announcement: a,
  images,
}: {
  announcement: Announcement;
  images: Set<string>;
}) {
  const p = a.puzzle as Puzzle;
  const client = useQueryClient();
  const signedIn = !!useSession();
  const total = p.cols * p.lignes;
  const placed = new Set(p.posees);
  const complete = placed.size >= total;
  const ready = p.decoupe === true;
  const playing = signedIn && a.ouvert && !complete && ready;
  const hand = useQuery({
    queryKey: puzzleHandKey(a.id),
    queryFn: () => fetchPuzzleHand(a.id),
    enabled: playing,
  });
  const [held, setHeld] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; wrong: boolean } | null>(null);
  const blockedUntil = hand.data?.bloque_jusqua ?? null;
  const blocked = !!blockedUntil && new Date(blockedUntil) > new Date();
  const place = useMutation({
    mutationFn: ({ token, cell }: { token: string; cell: number }) =>
      placePuzzlePiece(a.id, token, cell),
    onSuccess: (r) => {
      if (r.ok) {
        setHeld(null);
        setMessage({
          text: r.complet
            ? 'Dernière pièce posée : le puzzle est terminé !'
            : 'Bien vu, la pièce est posée !',
          wrong: false,
        });
      } else if (r.deja) {
        setHeld(null);
        setMessage({
          text: 'Quelqu’un a posé cette pièce juste avant toi : tu en reçois une autre.',
          wrong: false,
        });
      } else if (r.bloque_jusqua) {
        setHeld(null);
        setMessage({
          text: `Pas ici ! ${r.erreurs_max ?? ''} essais ratés : tu pourras reposer des pièces à ${hour(r.bloque_jusqua)}.`,
          wrong: true,
        });
      } else
        setMessage({
          text: `Pas ici ! La pièce revient dans ta main (essai raté ${r.erreurs ?? '?'} / ${r.erreurs_max ?? '?'} aujourd’hui).`,
          wrong: true,
        });
    },
    onError: (e) => setMessage({ text: e.message, wrong: true }),
    onSettled: () => client.invalidateQueries({ queryKey: announcementKeys.all }),
  });
  const drop = (cell: number, token: string | null) => {
    if (token === null || place.isPending || blocked || placed.has(cell)) return;
    place.mutate({ token, cell });
  };
  const pieces = hand.data?.pieces ?? [];
  const left = hand.data ? Math.max(0, hand.data.par_jour - hand.data.faites) : 0;
  const placedImage = (cell: number) => {
    const path = p.images?.[String(cell)];
    return path ? imageUrl(path, images) : null;
  };
  const background = p.fond ? imageUrl(p.fond, images) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <ICONS.puzzle className="size-4" />
        <span>
          {placed.size} / {total} pièces posées · {plural(p.participants, 'joueur')}
          {p.miennes > 0 &&
            ` · ${plural(p.miennes, 'pièce')} posée${p.miennes > 1 ? 's' : ''} par toi`}
        </span>
        {complete && <Badge variant="success">Puzzle terminé</Badge>}
      </div>
      <Progress value={(placed.size * 100) / total} />

      <div
        className={`puzzle-board relative grid w-full overflow-hidden rounded-lg ${complete ? '' : 'border bg-muted'}`}
        style={{
          '--cols': p.cols,
          '--rows': p.lignes,
          '--ratio': ratioOf(p),
          '--puzzle-img': background ? `url("${background}")` : 'none',
        }}
      >
        {!complete && (
          <span aria-hidden className="puzzle-ghost pointer-events-none absolute inset-0" />
        )}
        {Array.from({ length: total }, (_, cell) =>
          placed.has(cell) ? (
            <span key={cell} className="relative block">
              <Piece src={placedImage(cell)} />
            </span>
          ) : (
            <button
              key={cell}
              type="button"
              aria-label="Case libre"
              disabled={!playing || blocked || held === null || place.isPending}
              onClick={() => drop(cell, held)}
              onDragOver={(e) => playing && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                drop(cell, held);
              }}
              className="relative border border-dashed border-border/50 transition enabled:cursor-pointer enabled:hover:bg-primary/15"
            />
          ),
        )}
      </div>

      {signedIn && a.ouvert && !complete && !ready && (
        <small className="text-muted-foreground">
          Le puzzle se prépare : reviens dans quelques minutes.
        </small>
      )}

      {playing && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <b className="text-sm">
            Tes pièces du jour
            {hand.data && ` · encore ${plural(left, 'pièce')} à poser aujourd’hui`}
          </b>
          {hand.error ? (
            <small className="text-destructive">{hand.error.message}</small>
          ) : pieces.length === 0 ? (
            <small className="text-muted-foreground">
              {hand.data ? 'Tu as posé toutes tes pièces du jour. Reviens demain !' : 'Pioche…'}
            </small>
          ) : (
            <div
              className="flex flex-wrap gap-2"
              style={{ '--cols': p.cols, '--rows': p.lignes, '--ratio': ratioOf(p) }}
            >
              {pieces.map((piece) => (
                <button
                  key={piece.jeton}
                  type="button"
                  draggable={!blocked}
                  disabled={blocked}
                  onDragStart={() => setHeld(piece.jeton)}
                  onClick={() => setHeld(held === piece.jeton ? null : piece.jeton)}
                  aria-label="Pièce du puzzle"
                  className={`puzzle-cell w-16 cursor-grab overflow-hidden rounded-md border shadow-sm transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${held === piece.jeton ? 'ring-2 ring-primary' : ''}`}
                >
                  <Piece src={imageUrl(piece.image, images)} />
                </button>
              ))}
            </div>
          )}
          {blocked && blockedUntil ? (
            <small className="text-destructive">
              Trop d’essais ratés : tu pourras reposer des pièces à {hour(blockedUntil)}.
            </small>
          ) : (
            <small className="text-muted-foreground">
              Fais glisser une pièce sur sa case, ou touche la pièce puis la case. Attention : au{' '}
              {hand.data?.erreurs_max ?? 3}e essai raté de la journée, tu attends 3 heures
              {hand.data && hand.data.erreurs > 0
                ? ` (essais ratés aujourd’hui : ${hand.data.erreurs} / ${hand.data.erreurs_max})`
                : ''}
              .
            </small>
          )}
          {message && (
            <small
              role="status"
              className={message.wrong ? 'text-destructive' : 'text-success-ink'}
            >
              {message.text}
            </small>
          )}
        </div>
      )}
      {!signedIn && a.ouvert && !complete && (
        <small className="text-muted-foreground">Connecte-toi pour poser tes pièces du jour.</small>
      )}
    </div>
  );
}
