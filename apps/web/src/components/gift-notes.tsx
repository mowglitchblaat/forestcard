// The admin's notes joined to a gift, shown once at sign-in, one after the other.

import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { fetchGiftNotes, giftKeys, markGiftNotesRead } from '@/data/gifts';

export function GiftNotes() {
  const client = useQueryClient();
  const notes = useQuery({
    queryKey: giftKeys.unread,
    queryFn: fetchGiftNotes,
    staleTime: Infinity,
  });
  const [index, setIndex] = useState(0);
  const list = notes.data ?? [];
  const note = list[index];
  if (!note) return null;
  const close = () => {
    if (index + 1 < list.length) {
      setIndex(index + 1);
      return;
    }
    void markGiftNotesRead(list.map((n) => n.id)).then(() => client.invalidateQueries());
    setIndex(list.length);
  };
  const n = note.quantite ?? 1;
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🎁 Un cadeau t'attend !</DialogTitle>
          <DialogDescription>
            {note.booster && `${n > 1 ? `${n}× ` : ''}${note.booster}`}
            {note.carte &&
              `🃏 ${n > 1 ? `${n}× ` : ''}${note.carte}${note.version ? ` · ${note.version}` : ''} (déjà dans ta collection)`}
          </DialogDescription>
        </DialogHeader>
        <p className="text-lg italic">« {note.message} »</p>
        <DialogFooter>
          <Button onClick={close}>Merci !</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
