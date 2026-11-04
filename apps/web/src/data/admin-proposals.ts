// Admin · Propositions (aPropos): the players' card proposals (12-propositions.sql, complete since
// 30-propositions-completes.sql: effects, composed card, drawing and settings), their status and
// the admin's note, deleting one with its images, and « Créer la carte »: the proposal becomes a
// real card, not published, with its images composed from the player's drawing.

import { z } from 'zod';
import { type ComposerSettings, getComposer } from '@/lib/composer';
import { supabase } from '@/lib/supabase';
import { call, type RarityRow, uploadImage } from './admin';
import { createCard, type CardWrite, saveComposed } from './admin-cards';

const NumOrNull = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => (v === null ? null : Number(v)));

export const STATUSES = {
  attente: '⏳ En attente',
  acceptee: '✅ Acceptée',
  refusee: '❌ Refusée',
} as const;
export type Status = keyof typeof STATUSES;

const AdminProposal = z.looseObject({
  id: z.number(),
  pseudo: z.string().nullable().optional(),
  image_path: z.string(),
  image_carte: z.string().nullable().optional(),
  nom: z.string(),
  type: z.string(),
  rarete_id: NumOrNull.optional(),
  collection_id: NumOrNull.optional(),
  collection_idee: z.string().nullable().optional(),
  idee: z.string().nullable().optional(),
  atq: NumOrNull.optional(),
  pv: NumOrNull.optional(),
  statut: z.enum(['attente', 'acceptee', 'refusee']),
  note_admin: z.string().nullable().optional(),
  cree_le: z.string(),
  carte_id: NumOrNull.optional(),
  ultime: z.unknown().optional(),
  passif: z.unknown().optional(),
  effet: z.unknown().optional(),
  compo: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type AdminProposal = z.infer<typeof AdminProposal>;

export const proposalImage = (path: string): string =>
  supabase.storage.from('propositions').getPublicUrl(path).data.publicUrl;

// filter: a status, or 'toutes'.
export async function fetchAdminProposals(filter: Status | 'toutes'): Promise<AdminProposal[]> {
  let request = supabase.from('propositions').select('*').order('cree_le', { ascending: false });
  if (filter !== 'toutes') request = request.eq('statut', filter);
  return z.array(AdminProposal).parse(await call(request));
}

export async function setProposalStatus(id: number, statut: Status, note: string): Promise<void> {
  await call(
    supabase
      .from('propositions')
      .update({ statut, note_admin: note.trim() || null })
      .eq('id', id),
  );
}

export async function setProposalNote(id: number, note: string): Promise<void> {
  await call(
    supabase
      .from('propositions')
      .update({ note_admin: note.trim() || null })
      .eq('id', id),
  );
}

export async function deleteProposal(p: AdminProposal): Promise<void> {
  await call(supabase.from('propositions').delete().eq('id', p.id));
  await supabase.storage
    .from('propositions')
    .remove([p.image_path, p.image_carte ?? ''].filter(Boolean));
}

// Returns the message for the admin.
export async function createCardFromProposal(
  p: AdminProposal,
  rarity: RarityRow | undefined,
): Promise<string> {
  const fighter = p.type === 'combattant';
  const row: CardWrite = {
    nom: p.nom,
    type: p.type,
    collection_id: p.collection_id ?? null,
    rarete_id: p.rarete_id ?? rarity?.id ?? 0,
    atq: fighter ? (p.atq ?? null) : null,
    pv: fighter ? (p.pv ?? null) : null,
    description: null,
    actif: false,
    ultime: fighter ? (p.ultime ?? null) : null,
    passif: fighter ? (p.passif ?? null) : null,
    effet: fighter ? null : (p.effet ?? null),
  };
  const id = await createCard(row);
  const cpo = getComposer();
  const url = proposalImage(p.image_path);
  const response = await fetch(url);
  const blob = response.ok ? await response.blob() : null;
  const drawing = blob ? await cpo.dessinDe(url) : null;
  let warning = '';
  if (drawing && blob) {
    const file = new File([blob], `dessin.${blob.type.split('/')[1] ?? 'png'}`, {
      type: blob.type || 'image/png',
    });
    const drawingPath = await uploadImage(file, {
      maxHeight: 2070,
      quality: 0.92,
      prefix: 'dessins/',
    });
    const settings = { ...cpo.DEF, ...(p.compo ?? {}) } as ComposerSettings;
    await saveComposed(id, row, cpo.tierDe(rarity), drawing, null, drawingPath, settings, true);
  } else
    warning =
      " Le dessin n'a pas pu être chargé : ajoute-le dans Admin · Cartes (modifier la carte).";
  const { error } = await supabase
    .from('propositions')
    .update({ statut: 'acceptee', carte_id: id })
    .eq('id', p.id);
  if (error && /carte_id/.test(error.message))
    await supabase.from('propositions').update({ statut: 'acceptee' }).eq('id', p.id);
  return `Carte « ${p.nom} » créée (non publiée).${warning}${
    p.collection_id
      ? ''
      : ` Elle est sans collection pour l'instant (le joueur proposait : « ${p.collection_idee ?? ''} »).`
  } Règle-la dans Admin · Cartes, puis publie-la.`;
}
