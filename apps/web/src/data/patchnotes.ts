// The patch notes, from two sources: the technical notes (patchnotes.json, served next to the
// site, written by the author) and the balance log (table `equilibrage`, one row per card edit in
// the admin, readable by everyone). Validated on arrival.
//
// Their fingerprint flags "Patch notes" in the sidebar when either changes: the notes file's
// SHA-256 and the latest balance row. Re-read every 5 minutes, so a note published while the page
// is open shows up too.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

export const PatchNote = z.object({
  date: z.string(),
  intro: z.string().optional(),
  groupes: z.array(z.object({ titre: z.string(), points: z.array(z.string()) })).default([]),
});
export type PatchNote = z.infer<typeof PatchNote>;

// One changed field of a card, as the admin page records it (legacy noteEquilibrage):
// avant null: a field that did not exist (a new card); avant '' or apres '': none.
// sens: +1 / -1 for a number going up / down (ATQ, PV), 0 or absent otherwise.
export const Change = z.object({
  champ: z.string(),
  avant: z.string().nullable(),
  apres: z.string().nullable(),
  sens: z.number().optional(),
});
export type Change = z.infer<typeof Change>;

export const BalanceRow = z.object({
  id: z.number(),
  carte_id: z.number().nullable(),
  carte_nom: z.string(),
  carte_type: z.string().nullable(),
  changements: z.array(Change),
  cree_le: z.string(),
});
export type BalanceRow = z.infer<typeof BalanceRow>;

async function readNotesFile(): Promise<Response> {
  const response = await fetch('patchnotes.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`patchnotes.json: HTTP ${response.status}`);
  return response;
}

export async function fetchPatchNotes(): Promise<PatchNote[]> {
  return z.array(PatchNote).parse(await (await readNotesFile()).json());
}

// The latest 300 rows, as the legacy page shows.
export async function fetchBalance(): Promise<BalanceRow[]> {
  const { data, error } = await supabase
    .from('equilibrage')
    .select('id,carte_id,carte_nom,carte_type,changements,cree_le')
    .order('cree_le', { ascending: false })
    .limit(300);
  if (error) throw new Error(`equilibrage: ${error.message}`);
  return z.array(BalanceRow).parse(data);
}

async function latestBalanceId(): Promise<number> {
  const { data, error } = await supabase
    .from('equilibrage')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);
  if (error) throw new Error(`equilibrage: ${error.message}`);
  return z.array(z.object({ id: z.number() })).parse(data)[0]?.id ?? 0;
}

// "<notes file hash>.<latest balance id>". The balance log unreadable: '-' in its place, so the
// notes alone still flag.
export async function fetchPatchNotesFingerprint(): Promise<string> {
  const [file, balance] = await Promise.all([
    readNotesFile().then((r) => r.arrayBuffer()),
    latestBalanceId().catch(() => '-'),
  ]);
  // Only a file that reads as patch notes is fingerprinted. Anything else answered with a 200 (the
  // app's own index.html as a fallback, an error page) would change at every deploy and flag notes
  // that do not exist: it throws instead, so there is no fingerprint and no flag.
  z.array(PatchNote).parse(JSON.parse(new TextDecoder().decode(file)));
  const digest = await crypto.subtle.digest('SHA-256', file);
  const hash = [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hash}.${balance}`;
}

export const patchNotesKeys = {
  fingerprint: ['patchNotesFingerprint'] as const,
  notes: ['patchNotes'] as const,
  balance: ['balance'] as const,
};
export const PATCH_NOTES_REFRESH = 5 * 60 * 1000;
