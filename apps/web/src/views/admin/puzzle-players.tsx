// Admin · Annonces, under a puzzle: its players (69-admin-puzzle-joueurs.sql). For each one, the
// pieces placed today on today's hand, the misses of the day and a running block; two gestures:
// give pieces for today (on top of the daily ones) and clear the misses (which lifts the block).

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  fetchPuzzlePlayers,
  givePuzzlePieces,
  puzzlePlayersKey,
  resetPuzzleMisses,
} from '@/data/announcements';
import { ICONS } from '@/lib/icons';
import { AdminError, NoticeView, useAction } from './kit';

const hour = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function PuzzlePlayers({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(5);
  const client = useQueryClient();
  const players = useQuery({
    queryKey: puzzlePlayersKey(id),
    queryFn: () => fetchPuzzlePlayers(id),
    enabled: open,
  });
  const action = useAction();
  const refresh = () => client.invalidateQueries({ queryKey: puzzlePlayersKey(id) });
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ICONS.players />
        Joueurs du puzzle
      </Button>
    );
  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm">Joueurs du puzzle</b>
        <span className="text-xs text-muted-foreground">Pièces à donner :</span>
        <Input
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
          className="w-20"
        />
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Fermer
        </Button>
      </div>
      {players.error && <AdminError error={players.error} />}
      {players.data && players.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Personne n'a encore joué à ce puzzle.</p>
      )}
      {players.data && players.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Joueur</TableHead>
              <TableHead>Aujourd'hui</TableHead>
              <TableHead>Essais ratés</TableHead>
              <TableHead>Au total</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.data.map((p) => (
              <TableRow key={p.joueur}>
                <TableCell>{p.pseudo ?? '?'}</TableCell>
                <TableCell>
                  {p.aujourdhui} / {p.quota}{' '}
                  {p.aujourdhui >= p.quota && <Badge variant="success">Fini</Badge>}
                </TableCell>
                <TableCell>
                  {p.erreurs}{' '}
                  {p.bloque_jusqua && (
                    <Badge variant="danger">Bloqué jusqu'à {hour(p.bloque_jusqua)}</Badge>
                  )}
                </TableCell>
                <TableCell>{p.total}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <HoldButton
                      size="sm"
                      variant="outline"
                      disabled={action.pending}
                      onConfirm={() =>
                        action.run(async () => {
                          await givePuzzlePieces(id, p.joueur, count);
                          await refresh();
                          return `${p.pseudo ?? '?'} : ${count} pièce(s) de plus pour aujourd'hui.`;
                        })
                      }
                    >
                      <ICONS.puzzle />+{count} pièces
                    </HoldButton>
                    <HoldButton
                      size="sm"
                      variant="outline"
                      disabled={action.pending || (p.erreurs === 0 && !p.bloque_jusqua)}
                      onConfirm={() =>
                        action.run(async () => {
                          await resetPuzzleMisses(id, p.joueur);
                          await refresh();
                          return `${p.pseudo ?? '?'} : essais remis à zéro.`;
                        })
                      }
                    >
                      <ICONS.reset />
                      Essais à zéro
                    </HoldButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <NoticeView notice={action.notice} />
    </div>
  );
}
