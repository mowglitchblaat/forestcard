// At sign-in, once per tournament: tells a player who has not registered yet that the tournament
// is open for registration. Closed, it is not shown again for that tournament (in this browser).

import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DIVISIONS, fetchTournament, isDivision, tournamentKeys } from '@/data/tournaments';
import { markSeen, SEEN_KEYS } from '@/lib/seen';

export function TournamentNote({ userId }: { userId: string }) {
  const state = useQuery({
    queryKey: tournamentKeys.one(null),
    queryFn: () => fetchTournament(null),
  });
  const [seen] = useState(() => localStorage.getItem(SEEN_KEYS.tournament));
  const [open, setOpen] = useState(true);
  const t = state.data?.tournament;
  if (!t || t.statut !== 'inscriptions' || seen === String(t.id)) return null;
  if ((t.inscrits ?? []).some((p) => p.id === userId)) return null;
  const close = () => {
    markSeen(SEEN_KEYS.tournament, String(t.id));
    setOpen(false);
  };
  const division = isDivision(t.division) ? DIVISIONS[t.division] : null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🏆 Le tournoi est prêt !</DialogTitle>
          <DialogDescription>
            {t.nom}
            {division && ` · ${division.icon} ${division.name}`}
          </DialogDescription>
        </DialogHeader>
        <p className="text-lg">
          Les inscriptions sont ouvertes : prépare ton deck et inscris-toi avant le lancement.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Plus tard
          </Button>
          <Button asChild onClick={close}>
            <Link to="/$view" params={{ view: 'tournois' }}>
              Voir le tournoi
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
