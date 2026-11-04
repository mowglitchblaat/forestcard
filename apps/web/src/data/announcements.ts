// The admin's announcements (58-annonces.sql): a plain announcement (title, text, picture) or a
// vote (options, each with its picture). A player votes for one option and may change it while the
// vote is open; the counts come back once they voted, once the vote is closed, or for the admin.

import { z } from 'zod';
import { call, uploadImage } from '@/data/admin';
import { supabase } from '@/lib/supabase';

const Num = z.union([z.number(), z.string()]).transform(Number);
const Count = z.union([z.number(), z.string()]).transform(Number).nullable().optional();

const Option = z.object({
  id: Num,
  libelle: z.string(),
  image_path: z.string().nullable(),
  voix: Count,
});
export type AnnouncementOption = z.infer<typeof Option>;

const Announcement = z.object({
  id: Num,
  type: z.enum(['annonce', 'vote']),
  titre: z.string(),
  texte: z.string(),
  image_path: z.string().nullable(),
  ouvert: z.boolean(),
  cree_le: z.string(),
  mon_vote: Num.nullable(),
  resultats: z.boolean(),
  total: Count,
  options: z.array(Option),
});
export type Announcement = z.infer<typeof Announcement>;

export const announcementKeys = { all: ['announcements'] as const };
export const ANNOUNCEMENTS_REFRESH = 5 * 60 * 1000;

export async function fetchAnnouncements(): Promise<Announcement[]> {
  return z.array(Announcement).parse(await call(supabase.rpc('annonces_liste')));
}

export async function voteAnnouncement(option: number): Promise<void> {
  await call(supabase.rpc('voter_annonce', { p_option: option }));
}

// An option's share of the votes, in percent.
export const share = (voices: number | null | undefined, total: number | null | undefined) =>
  total ? Math.round(((voices ?? 0) * 100) / total) : 0;

// The newest announcements first: the ids, for the sidebar's "seen" mark.
export const announcementIds = (list: Announcement[]): string[] => list.map((a) => String(a.id));

// ── Admin ──

export type OptionDraft = { libelle: string; image: File | null };
export type AnnouncementDraft = {
  type: 'annonce' | 'vote';
  titre: string;
  texte: string;
  image: File | null;
  options: OptionDraft[];
};

const upload = (file: File | null) =>
  file ? uploadImage(file, { prefix: 'annonces/' }) : Promise.resolve(null);

export async function createAnnouncement(d: AnnouncementDraft): Promise<void> {
  if (!d.titre.trim()) throw new Error('Donne un titre à l’annonce.');
  const options = d.type === 'vote' ? d.options.filter((o) => o.libelle.trim()) : [];
  if (d.type === 'vote' && options.length < 2)
    throw new Error('Un vote a besoin d’au moins deux options.');
  const image_path = await upload(d.image);
  const created = z
    .object({ id: Num })
    .parse(
      await call(
        supabase
          .from('annonces')
          .insert({ type: d.type, titre: d.titre.trim(), texte: d.texte.trim(), image_path })
          .select('id')
          .single(),
      ),
    );
  const rows = [];
  for (const [i, o] of options.entries())
    rows.push({
      annonce_id: created.id,
      libelle: o.libelle.trim(),
      image_path: await upload(o.image),
      ordre: i,
    });
  if (rows.length) await call(supabase.from('annonces_options').insert(rows));
}

export async function setAnnouncementOpen(id: number, open: boolean): Promise<void> {
  await call(supabase.from('annonces').update({ ouvert: open }).eq('id', id));
}

export async function deleteAnnouncement(id: number): Promise<void> {
  await call(supabase.from('annonces').delete().eq('id', id));
}
