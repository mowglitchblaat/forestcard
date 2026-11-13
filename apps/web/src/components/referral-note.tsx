// After the first sign-in of a player who came by a sponsor's link: links them (once, with a query
// so the strict mode's double effect asks only once) and says what they received.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { claimReferral, pendingReferral, referralKeys } from '@/data/referral';

export function ReferralNote({ userId }: { userId: string }) {
  const client = useQueryClient();
  const [pending] = useState(() => pendingReferral() !== null);
  const [open, setOpen] = useState(true);
  const claim = useQuery({
    queryKey: referralKeys.claim(userId),
    queryFn: claimReferral,
    enabled: pending,
    staleTime: Infinity,
    retry: false,
  });
  const answer = claim.data;
  const linked = answer && answer.ok ? answer : null;
  useEffect(() => {
    // The welcome gold: the gold shown in the sidebar is read again.
    if (linked) void client.invalidateQueries();
  }, [linked, client]);
  if (!linked) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🤝 Bienvenue de la part de {linked.parrain} !</DialogTitle>
          <DialogDescription>Tu es venu grâce à son lien de parrainage.</DialogDescription>
        </DialogHeader>
        <p className="text-lg">Tu reçois {linked.gain} gold de bienvenue.</p>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Merci !</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
