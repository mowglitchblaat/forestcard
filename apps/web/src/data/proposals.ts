// Card proposals (db/migrations/12-propositions.sql): the rarities and collections to choose from,
// the player's proposals, sending one (the drawing lightened and uploaded, the assembled card
// uploaded, then proposer_carte, which applies the limits; on refusal the images are removed) and
// withdrawing one while it waits (the row, then its images).
//
// Local preview only (`vp run build:demo`): sending and withdrawing go to an in-memory store that
// applies proposer_carte's rules, the images stay in the browser. The published build is in
// 'production' mode: that branch is dropped, and nothing reaches the database while testing.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const DEMO = import.meta.env.MODE === 'demo';
const BUCKET = 'propositions';
const ONE_YEAR = '31536000';
export const MAX_WAITING = 3;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const CARD_TYPE_LABELS = {
  combattant: 'Combattant',
  magie: 'Magie',
  piege: 'Piège',
} as const;
export type ProposalType = keyof typeof CARD_TYPE_LABELS;

const RefRarity = z.object({
  id: z.number(),
  nom: z.string(),
  couleur: z.string().nullable(),
  poids: z.number().nullable(),
});
const RefCollection = z.object({ id: z.number(), nom: z.string() });
export type RefRarity = z.infer<typeof RefRarity>;
export type RefCollection = z.infer<typeof RefCollection>;

// Rarities as the legacy page orders them (by weight, descending), collections by name.
export async function fetchRefs(): Promise<{
  rarities: RefRarity[];
  collections: RefCollection[];
}> {
  const [r, c] = await Promise.all([
    supabase.from('raretes').select('id,nom,couleur,poids'),
    supabase.from('collections').select('id,nom'),
  ]);
  if (r.error) throw new Error(`raretes: ${r.error.message}`);
  if (c.error) throw new Error(`collections: ${c.error.message}`);
  return {
    rarities: z
      .array(RefRarity)
      .parse(r.data)
      .sort((a, b) => (b.poids ?? 0) - (a.poids ?? 0)),
    collections: z
      .array(RefCollection)
      .parse(c.data)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
  };
}

export const Proposal = z.object({
  id: z.number(),
  image_path: z.string(),
  image_carte: z.string().nullable(),
  nom: z.string(),
  type: z.enum(['combattant', 'magie', 'piege']),
  rarete_id: z.number().nullable(),
  collection_id: z.number().nullable(),
  collection_idee: z.string().nullable(),
  idee: z.string().nullable(),
  atq: z.number().nullable(),
  pv: z.number().nullable(),
  statut: z.enum(['attente', 'acceptee', 'refusee']),
  note_admin: z.string().nullable(),
  cree_le: z.string(),
});
export type Proposal = z.infer<typeof Proposal>;

export type ProposalInput = {
  drawing: File;
  card: Blob | null; // the assembled card (drawing, frame, name, stats)
  nom: string;
  type: ProposalType;
  rarityId: number | null;
  collectionId: number | null; // null: a collection idea
  collectionIdea: string;
  idea: string;
  atq: number | null; // fighters only
  pv: number | null;
};

// In-memory proposals of the demo build, and its images (object URLs).
const demo: Proposal[] = [];
const demoUrls = new Map<string, string>();

export async function fetchMine(userId: string): Promise<Proposal[]> {
  if (DEMO) return [...demo];
  const { data, error } = await supabase
    .from('propositions')
    .select('*')
    .eq('joueur_id', userId)
    .order('cree_le', { ascending: false });
  if (error) throw new Error(`propositions: ${error.message}`);
  return z.array(Proposal).parse(data);
}

export const imageUrl = (path: string | null): string | null =>
  !path
    ? null
    : DEMO
      ? (demoUrls.get(path) ?? null)
      : supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

// The drawing lightened before upload (legacy alleger): 1600 px high at most, WebP, if smaller.
// An animated GIF or another format is sent as it is.
export async function lighten(file: File, maxHeight = 1600, quality = 0.9): Promise<Blob> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, maxHeight / bmp.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * s);
    canvas.height = Math.round(bmp.height * s);
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

async function upload(path: string, blob: Blob): Promise<void> {
  if (DEMO) {
    demoUrls.set(path, URL.createObjectURL(blob));
    return;
  }
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type, cacheControl: ONE_YEAR });
  if (error) throw new Error(error.message);
}

async function removeImages(paths: string[]): Promise<void> {
  if (DEMO) {
    paths.forEach((p) => URL.revokeObjectURL(demoUrls.get(p) ?? ''));
    paths.forEach((p) => demoUrls.delete(p));
    return;
  }
  await supabase.storage.from(BUCKET).remove(paths);
}

// proposer_carte's rules, for the demo store (the database applies them for real).
function demoPropose(p: Omit<Proposal, 'id' | 'statut' | 'note_admin' | 'cree_le'>): number {
  if (demo.filter((x) => x.statut === 'attente').length >= MAX_WAITING)
    throw new Error("Tu as déjà 3 propositions en attente : attends que l'admin les regarde");
  if (p.collection_id === null && !p.collection_idee?.trim())
    throw new Error('Choisis une collection ou écris ton idée de collection');
  const id = (demo[0]?.id ?? 0) + 1;
  demo.unshift({
    ...p,
    id,
    nom: p.nom.trim(),
    atq: p.type === 'combattant' ? p.atq : null,
    pv: p.type === 'combattant' ? p.pv : null,
    statut: 'attente',
    note_admin: null,
    cree_le: new Date().toISOString(),
  });
  return id;
}

export async function propose(userId: string, input: ProposalInput): Promise<void> {
  const drawing = await lighten(input.drawing);
  const ext =
    drawing.type === 'image/webp'
      ? 'webp'
      : (input.drawing.name.split('.').pop() || 'png').toLowerCase();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  await upload(path, drawing);
  // The assembled card is a plus: if its upload fails, the proposal goes without it.
  let cardPath: string | null = null;
  if (input.card) {
    cardPath = `${userId}/${crypto.randomUUID()}-carte.webp`;
    try {
      await upload(cardPath, input.card);
    } catch {
      cardPath = null;
    }
  }
  const fighter = input.type === 'combattant';
  const row = {
    image_path: path,
    image_carte: cardPath,
    nom: input.nom,
    type: input.type,
    rarete_id: input.rarityId,
    collection_id: input.collectionId,
    collection_idee: input.collectionId === null ? input.collectionIdea : null,
    idee: input.idea.trim() || null,
    atq: fighter ? input.atq : null,
    pv: fighter ? input.pv : null,
  };
  const images = [path, ...(cardPath ? [cardPath] : [])];
  try {
    if (DEMO) demoPropose(row);
    else {
      const args: Record<string, unknown> = {
        p_image: path,
        p_nom: input.nom,
        p_type: input.type,
        p_rarete: input.rarityId,
        p_collection: input.collectionId,
        p_collection_idee: row.collection_idee,
        p_idee: input.idea,
      };
      if (cardPath) args.p_image_carte = cardPath;
      if (fighter) {
        if (input.atq !== null) args.p_atq = input.atq;
        if (input.pv !== null) args.p_pv = input.pv;
      }
      const { error } = await supabase.rpc('proposer_carte', args);
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    await removeImages(images); // refused: nothing left behind
    throw e;
  }
}

// While it waits (the database allows nothing else): the row, then its images.
export async function withdraw(p: Proposal): Promise<void> {
  if (DEMO) {
    const i = demo.findIndex((x) => x.id === p.id);
    if (i >= 0) demo.splice(i, 1);
  } else {
    const { error } = await supabase.from('propositions').delete().eq('id', p.id);
    if (error) throw new Error(error.message);
  }
  await removeImages([p.image_path, p.image_carte].filter((x): x is string => !!x));
}

export const proposalKeys = {
  refs: ['proposalRefs'] as const,
  mine: (userId: string) => ['proposals', userId] as const,
};
