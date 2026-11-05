// The shared puzzle of an announcement (59-puzzle.sql): the picture cut in columns × rows. The board
// shows the pieces placed by everyone; each player gets a few pieces a day (their hand) and drops
// each one on a cell, by dragging it or by picking it then the cell (phones). The right cell places
// it for everyone; a wrong one sends it back to the hand, to try again. Once the last piece is
// placed, the whole picture shows. Behind the board, the picture very blurred guides the first pieces.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  type Announcement,
  announcementKeys,
  fetchPuzzleHand,
  pieceAt,
  placePuzzlePiece,
  type Puzzle,
  puzzleHandKey,
} from '@/data/announcements';
import { ICONS } from '@/lib/icons';
import { useSession } from '@/lib/session';

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

// The board's proportions (width / height of the picture).
const ratioOf = (p: Puzzle) => (p.ratio && p.ratio > 0 ? p.ratio : 1);

function Piece({ piece, cols }: { piece: number; cols: number }) {
  const { col, row } = pieceAt(piece, cols);
  return (
    <span
      className="puzzle-piece relative block size-full"
      style={{ '--col': col, '--row': row }}
    />
  );
}

export function PuzzleGame({
  announcement: a,
  picture,
}: {
  announcement: Announcement;
  picture: string;
}) {
  const p = a.puzzle as Puzzle;
  const client = useQueryClient();
  const signedIn = !!useSession();
  const total = p.cols * p.lignes;
  const placed = new Set(p.posees);
  const complete = placed.size >= total;
  const playing = signedIn && a.ouvert && !complete;
  const hand = useQuery({
    queryKey: puzzleHandKey(a.id),
    queryFn: () => fetchPuzzleHand(a.id),
    enabled: playing,
  });
  const [held, setHeld] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; wrong: boolean } | null>(null);
  const place = useMutation({
    mutationFn: ({ piece, cell }: { piece: number; cell: number }) =>
      placePuzzlePiece(a.id, piece, cell),
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
      } else
        setMessage({
          text: 'Pas ici ! La pièce revient dans ta main, essaie une autre case.',
          wrong: true,
        });
    },
    onError: (e) => setMessage({ text: e.message, wrong: true }),
    onSettled: () => client.invalidateQueries({ queryKey: announcementKeys.all }),
  });
  const drop = (cell: number, piece: number | null) => {
    if (piece === null || place.isPending || placed.has(cell)) return;
    place.mutate({ piece, cell });
  };
  const pieces = hand.data?.pieces ?? [];
  const left = hand.data ? Math.max(0, hand.data.par_jour - hand.data.faites) : 0;

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

      {complete ? (
        <img src={picture} alt="" className="w-full rounded-lg" />
      ) : (
        <div
          className="puzzle-board relative grid w-full overflow-hidden rounded-lg border bg-muted"
          style={{
            '--cols': p.cols,
            '--rows': p.lignes,
            '--ratio': ratioOf(p),
            '--puzzle-img': `url("${picture}")`,
          }}
        >
          <span aria-hidden className="puzzle-ghost pointer-events-none absolute inset-0" />
          {Array.from({ length: total }, (_, cell) =>
            placed.has(cell) ? (
              <Piece key={cell} piece={cell} cols={p.cols} />
            ) : (
              <button
                key={cell}
                type="button"
                aria-label={`Case ${cell + 1}`}
                disabled={!playing || held === null || place.isPending}
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
              style={{
                '--cols': p.cols,
                '--rows': p.lignes,
                '--ratio': ratioOf(p),
                '--puzzle-img': `url("${picture}")`,
              }}
            >
              {pieces.map((piece) => (
                <button
                  key={piece}
                  type="button"
                  draggable
                  onDragStart={() => setHeld(piece)}
                  onClick={() => setHeld(held === piece ? null : piece)}
                  aria-label="Pièce du puzzle"
                  className={`puzzle-cell w-16 cursor-grab overflow-hidden rounded-md border shadow-sm transition hover:-translate-y-0.5 ${held === piece ? 'ring-2 ring-primary' : ''}`}
                >
                  <Piece piece={piece} cols={p.cols} />
                </button>
              ))}
            </div>
          )}
          <small className="text-muted-foreground">
            Fais glisser une pièce sur sa case, ou touche la pièce puis la case. Une mauvaise case
            ne coûte rien : la pièce revient dans ta main.
          </small>
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
