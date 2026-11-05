// The admin's announcements (58-annonces.sql): a plain announcement (title, text, picture) or a
// vote (options, each with its picture). A player votes for one option and may change it while the
// vote is open; the counts come back once they voted, once the vote is closed, or for the admin.
// Or a shared puzzle (59-puzzle.sql, 63-puzzle-pieces-secretes.sql): the picture cut in columns ×
// rows, each piece its own small image with a random name and token, so a piece never tells its
// cell; each player gets a few pieces a day and drops each one on its cell. A wrong cell sends it
// back to the hand and counts as a miss: at the 3rd miss of the day, the player waits 3 hours. The
// original picture stays in the private storage (bucket puzzles), read by the admin only.

import { z } from 'zod';
import { call, lighten, removeImages, uploadImage } from '@/data/admin';
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
  // the placed pieces' images, by cell
  images: z.record(z.string(), z.string()).optional(),
  decoupe: z.boolean().optional(),
  fond: z.string().nullable().optional(),
  // admin only: the original picture, to cut it again
  source: z.string().nullable().optional(),
  source_privee: z.boolean().nullable().optional(),
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

const HandPiece = z.object({ jeton: z.string(), image: z.string() });
export type HandPiece = z.infer<typeof HandPiece>;
const Hand = z.object({
  pieces: z.array(HandPiece),
  faites: Num,
  par_jour: Num,
  erreurs: Num,
  erreurs_max: Num,
  bloque_jusqua: z.string().nullable(),
});
export type PuzzleHand = z.infer<typeof Hand>;
export const puzzleHandKey = (id: number) => [...announcementKeys.all, 'puzzle', id] as const;

// The player's pieces of the day (topped up by the server), how many they placed today, and their
// misses of the day (blocked until bloque_jusqua once they reach the maximum).
export async function fetchPuzzleHand(id: number): Promise<PuzzleHand> {
  return Hand.parse(await call(supabase.rpc('puzzle_main', { p_annonce: id })));
}

const Placed = z.object({
  ok: z.boolean(),
  deja: z.boolean().optional(),
  complet: z.boolean().optional(),
  erreurs: Num.optional(),
  erreurs_max: Num.optional(),
  bloque_jusqua: z.string().nullable().optional(),
});
export type PuzzlePlaced = z.infer<typeof Placed>;

// Drops a piece of the hand (its token) on a cell: ok when it is its cell (placed for everyone).
export async function placePuzzlePiece(id: number, token: string, cell: number) {
  return Placed.parse(
    await call(supabase.rpc('puzzle_poser', { p_annonce: id, p_jeton: token, p_case: cell })),
  );
}

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

// ── Puzzle cutting (63-puzzle-pieces-secretes.sql) ──

const CACHE_ONE_YEAR = '31536000';

const webp = (canvas: HTMLCanvasElement, quality = 0.86) =>
  new Promise<Blob>((done, fail) => {
    const end = (b: Blob | null) => (b ? done(b) : fail(new Error('Découpe impossible.')));
    canvas.toBlob(end, 'image/webp', quality);
  });

// The original picture, lightened, into the private storage: never listed nor readable by players.
async function uploadSource(blob: Blob): Promise<string> {
  const file = blob instanceof File ? blob : new File([blob], 'source', { type: blob.type });
  const light = await lighten(file, 1600);
  const path = `${crypto.randomUUID()}.webp`;
  await call(
    supabase.storage
      .from('puzzles')
      .upload(path, light, { contentType: light.type || 'image/webp' }),
  );
  return path;
}

async function uploadPiece(blob: Blob): Promise<string> {
  const path = `puzzle/${crypto.randomUUID()}.webp`;
  await call(
    supabase.storage
      .from('cartes')
      .upload(path, blob, { contentType: 'image/webp', cacheControl: CACHE_ONE_YEAR }),
  );
  return path;
}

// Cuts the picture in cols × rows pieces (cell = row × cols + column) and a tiny copy for the
// blurred background, then uploads the pieces in a random order (the storage lists them by date).
async function cutAndStore(
  id: number,
  picture: Blob,
  cols: number,
  rows: number,
  source: string | null,
): Promise<void> {
  const bitmap = await createImageBitmap(picture);
  const { width, height } = bitmap;
  const cut = async (cell: number) => {
    const col = cell % cols;
    const row = Math.floor(cell / cols);
    const x0 = Math.round((col * width) / cols);
    const x1 = Math.round(((col + 1) * width) / cols);
    const y0 = Math.round((row * height) / rows);
    const y1 = Math.round(((row + 1) * height) / rows);
    const canvas = document.createElement('canvas');
    canvas.width = x1 - x0;
    canvas.height = y1 - y0;
    canvas.getContext('2d')?.drawImage(bitmap, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
    return webp(canvas);
  };
  const tiny = document.createElement('canvas');
  tiny.width = 12;
  tiny.height = Math.max(1, Math.round((12 * height) / width));
  tiny.getContext('2d')?.drawImage(bitmap, 0, 0, tiny.width, tiny.height);
  const background = await uploadPiece(await webp(tiny, 0.6));

  const cells = Array.from({ length: cols * rows }, (_, cell) => cell);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j] as number, cells[i] as number];
  }
  const pieces: { piece: number; image: string }[] = [];
  for (let i = 0; i < cells.length; i += 6)
    pieces.push(
      ...(await Promise.all(
        cells.slice(i, i + 6).map(async (cell) => ({
          piece: cell,
          image: await uploadPiece(await cut(cell)),
        })),
      )),
    );
  bitmap.close();
  const old = z.array(z.string()).parse(
    await call(
      supabase.rpc('admin_puzzle_decoupe', {
        p_annonce: id,
        p_fond: background,
        p_source: source,
        p_pieces: pieces,
      }),
    ),
  );
  if (old.length) await removeImages(old);
}

// Cuts again a puzzle already published (its placed pieces keep their cells): from its original
// in the private storage, or the public one of a puzzle made before, which then moves there.
export async function recutPuzzle(a: Announcement): Promise<void> {
  const p = a.puzzle;
  if (!p?.source) throw new Error('Ce puzzle n’a plus son image d’origine.');
  let picture: Blob;
  let source: string | null = null;
  if (p.source_privee) {
    const file = await call(supabase.storage.from('puzzles').download(p.source));
    picture = z.instanceof(Blob).parse(file);
  } else {
    const url = supabase.storage.from('cartes').getPublicUrl(p.source).data.publicUrl;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Image d’origine introuvable.');
    picture = await response.blob();
    source = await uploadSource(picture);
  }
  await cutAndStore(a.id, picture, p.cols, p.lignes, source);
}

export async function createAnnouncement(d: AnnouncementDraft): Promise<void> {
  if (!d.titre.trim()) throw new Error('Donne un titre à l’annonce.');
  const options = d.type === 'vote' ? d.options.filter((o) => o.libelle.trim()) : [];
  if (d.type === 'vote' && options.length < 2)
    throw new Error('Un vote a besoin d’au moins deux options.');
  if (d.type === 'puzzle' && !d.image) throw new Error('Un puzzle a besoin d’une image.');
  const between = (n: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Math.round(n) || lo));
  const cols = between(d.cols, 2, 20);
  const lines = between(d.lignes, 2, 20);
  const puzzle =
    d.type === 'puzzle' && d.image
      ? {
          puzzle_cols: cols,
          puzzle_lignes: lines,
          puzzle_jour: between(d.parJour, 1, 50),
          puzzle_ratio: await ratioOf(d.image),
        }
      : {};
  // a puzzle's picture never goes to the public storage
  const image_path = d.type === 'puzzle' ? null : await upload(d.image);
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
          // a puzzle stays closed until cut, so nobody draws pieces without their images
          ouvert: d.type !== 'puzzle',
        })
        .select('id')
        .single(),
    ),
  );
  if (d.type === 'puzzle' && d.image) {
    const source = await uploadSource(d.image);
    await cutAndStore(created.id, d.image, cols, lines, source);
    await setAnnouncementOpen(created.id, true);
  }
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
