// The admin's announcements (58-annonces.sql): a plain announcement (title, text, picture) or a
// vote (options, each with its picture). A player votes for one option and may change it while the
// vote is open; the counts come back once they voted, once the vote is closed, or for the admin.
// Or a shared puzzle (59-puzzle.sql): the picture cut in columns × rows; each player gets a few
// pieces a day and drops each one on its cell; a wrong cell sends it back to the hand.

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

const Puzzle = z.object({
  cols: Num,
  lignes: Num,
  par_jour: Num,
  ratio: z.union([z.number(), z.string()]).transform(Number).nullable(),
  posees: z.array(Num),
  participants: Num,
  miennes: Num,
});
export type Puzzle = z.infer<typeof Puzzle>;

const Announcement = z.object({
  id: Num,
  type: z.enum(['annonce', 'vote', 'puzzle']),
  titre: z.string(),
  texte: z.string(),
  image_path: z.string().nullable(),
  ouvert: z.boolean(),
  cree_le: z.string(),
  mon_vote: Num.nullable(),
  resultats: z.boolean(),
  total: Count,
  options: z.array(Option),
  puzzle: Puzzle.nullable().optional(),
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

// ── Puzzle (59-puzzle.sql) ──

const Hand = z.object({ pieces: z.array(Num), faites: Num, par_jour: Num });
export type PuzzleHand = z.infer<typeof Hand>;
export const puzzleHandKey = (id: number) => [...announcementKeys.all, 'puzzle', id] as const;

// The player's pieces of the day (topped up by the server), and how many they placed today.
export async function fetchPuzzleHand(id: number): Promise<PuzzleHand> {
  return Hand.parse(await call(supabase.rpc('puzzle_main', { p_annonce: id })));
}

const Placed = z.object({
  ok: z.boolean(),
  deja: z.boolean().optional(),
  complet: z.boolean().optional(),
});
export type PuzzlePlaced = z.infer<typeof Placed>;

// Drops a piece of the hand on a cell: ok when it is its cell (placed for everyone).
export async function placePuzzlePiece(id: number, piece: number, cell: number) {
  return Placed.parse(
    await call(supabase.rpc('puzzle_poser', { p_annonce: id, p_piece: piece, p_case: cell })),
  );
}

// A piece's column and row in the grid.
export const pieceAt = (piece: number, cols: number) => ({
  col: piece % cols,
  row: Math.floor(piece / cols),
});

// An option's share of the votes, in percent.
export const share = (voices: number | null | undefined, total: number | null | undefined) =>
  total ? Math.round(((voices ?? 0) * 100) / total) : 0;

// The newest announcements first: the ids, for the sidebar's "seen" mark.
export const announcementIds = (list: Announcement[]): string[] => list.map((a) => String(a.id));

// ── Admin ──

export type OptionDraft = { libelle: string; image: File | null };
export type AnnouncementDraft = {
  type: 'annonce' | 'vote' | 'puzzle';
  titre: string;
  texte: string;
  image: File | null;
  options: OptionDraft[];
  // puzzle: columns, rows, pieces per player and per day
  cols: number;
  lignes: number;
  parJour: number;
};

// Width / height of a picture, for the puzzle's grid.
async function ratioOf(file: File): Promise<number> {
  const bitmap = await createImageBitmap(file);
  const ratio = bitmap.width / bitmap.height;
  bitmap.close();
  return ratio;
}

const upload = (file: File | null) =>
  file ? uploadImage(file, { prefix: 'annonces/' }) : Promise.resolve(null);

export async function createAnnouncement(d: AnnouncementDraft): Promise<void> {
  if (!d.titre.trim()) throw new Error('Donne un titre à l’annonce.');
  const options = d.type === 'vote' ? d.options.filter((o) => o.libelle.trim()) : [];
  if (d.type === 'vote' && options.length < 2)
    throw new Error('Un vote a besoin d’au moins deux options.');
  if (d.type === 'puzzle' && !d.image) throw new Error('Un puzzle a besoin d’une image.');
  const between = (n: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Math.round(n) || lo));
  const puzzle =
    d.type === 'puzzle' && d.image
      ? {
          puzzle_cols: between(d.cols, 2, 20),
          puzzle_lignes: between(d.lignes, 2, 20),
          puzzle_jour: between(d.parJour, 1, 50),
          puzzle_ratio: await ratioOf(d.image),
        }
      : {};
  const image_path = await upload(d.image);
  const created = z.object({ id: Num }).parse(
    await call(
      supabase
        .from('annonces')
        .insert({
          type: d.type,
          titre: d.titre.trim(),
          texte: d.texte.trim(),
          image_path,
          ...puzzle,
        })
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
