// The admin's short notes sent with a gift (55-cadeaux-messages.sql, 56-cadeaux-cartes.sql): shown
// once, at sign-in, then marked read.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const Num = z.union([z.number(), z.string()]).transform(Number);

const GiftNote = z.looseObject({
  id: Num,
  message: z.string(),
  booster: z.string().nullable().optional(),
  carte: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  quantite: Num.nullable().optional(),
});
export type GiftNote = z.infer<typeof GiftNote>;

// Unread notes; none when the function is missing.
export async function fetchGiftNotes(): Promise<GiftNote[]> {
  const { data, error } = await supabase.rpc('cadeaux_non_lus');
  if (error || !Array.isArray(data)) return [];
  return z.array(GiftNote).parse(data);
}

export async function markGiftNotesRead(ids: number[]): Promise<void> {
  await supabase.rpc('cadeaux_lus', { p_ids: ids });
}

export const giftKeys = { unread: ['giftNotes'] as const };
