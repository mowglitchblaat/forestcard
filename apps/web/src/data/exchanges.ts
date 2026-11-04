// Card exchanges between players (db/migrations/28-echanges.sql): each card exchanged adds its
// value to a pot of fragments both players fill as they like; when the pot is full and both have
// accepted, the cards change hands. Limits: exchanges a day, account age, boosters opened, an offer's
// expiry, cards per side. As the legacy page's vEchanges, exChoisirJoueur, exComposer.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const Num = z.union([z.number(), z.string()]).transform(Number);
const NumOrNull = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => (v === null ? null : Number(v)));
const Text = z.string().nullable().optional();

export const RANKS = ['commun', 'rare', 'epique', 'legendaire', 'ggez'] as const;
export const RANK_LABELS: Record<string, string> = {
  commun: 'Commune',
  rare: 'Rare',
  epique: 'Épique',
  legendaire: 'Légendaire',
  ggez: 'GGEZ',
};

const Info = z.looseObject({
  fragments: Num,
  ok: z.boolean(),
  raisons: z.array(z.string()).nullable().optional(),
  prix: z.record(z.string(), Num),
  par_jour: NumOrNull.optional(),
  age_min: NumOrNull.optional(),
  age_jours: NumOrNull.optional(),
  boosters_min: NumOrNull.optional(),
  boosters: NumOrNull.optional(),
  expiration_h: NumOrNull.optional(),
  max_cartes: NumOrNull.optional(),
});
export type ExchangeInfo = z.infer<typeof Info>;

export const ExchangeCard = z.looseObject({
  variante_id: Num,
  carte_id: NumOrNull.optional(),
  nom: z.string(),
  variante: Text,
  rarete: Text,
  couleur: Text,
  image: Text,
  image_path: Text,
  prix: Num,
  quantite: Num,
  au_deck: z.boolean().nullable().optional(),
});
export type ExchangeCard = z.infer<typeof ExchangeCard>;

const Exchange = z.looseObject({
  id: Num,
  moi_propose: z.boolean(),
  autre: z.string(),
  ouvert: z.boolean(),
  ok_pour: z.boolean().nullable().optional(),
  statut: z.string(),
  raison: Text,
  pot: Num,
  ma_part: Num,
  sa_part: Num,
  je_donne: z.array(ExchangeCard),
  je_recois: z.array(ExchangeCard),
  expire_le: Text,
  fini_le: Text,
  cree_le: z.string(),
});
export type Exchange = z.infer<typeof Exchange>;

const Partner = z.looseObject({
  id: z.string(),
  pseudo: z.string(),
  peut: z.boolean(),
  raisons: z.array(z.string()).nullable().optional(),
});
export type Partner = z.infer<typeof Partner>;

// The database's messages, without their technical prefix; a missing function says what to run.
const message = (e: { message: string }): string =>
  /does not exist|Could not find the function|schema cache/i.test(e.message)
    ? "Les échanges ne sont pas encore installés : l'admin doit lancer 28-echanges.sql dans Supabase."
    : e.message.replace(/^ECHANGE(_IMPOSSIBLE)?:\s*/, '');

async function rpc(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(message(error));
  return data;
}

export async function fetchExchangeInfo(): Promise<ExchangeInfo> {
  return Info.parse(await rpc('echange_infos'));
}

export async function fetchExchanges(): Promise<Exchange[]> {
  return z.array(Exchange).parse((await rpc('mes_echanges')) ?? []);
}

export async function searchPartners(query: string): Promise<Partner[]> {
  return z.array(Partner).parse((await rpc('echange_joueurs', { p_recherche: query })) ?? []);
}

// A player's cards that can be exchanged, the most valuable first.
export async function fetchExchangeCollection(player: string): Promise<ExchangeCard[]> {
  return z
    .array(ExchangeCard)
    .parse((await rpc('echange_collection', { p_joueur: player })) ?? [])
    .sort((x, y) => y.prix - x.prix || x.nom.localeCompare(y.nom));
}

// Card ids repeated by quantity, as echange_proposer takes them.
const flat = (chosen: Map<number, number>) =>
  [...chosen].flatMap(([variant, n]) => Array<number>(n).fill(variant));

export async function proposeExchange(
  partner: string,
  give: Map<number, number>,
  receive: Map<number, number>,
  share: number,
): Promise<void> {
  await rpc('echange_proposer', {
    p_pour: partner,
    p_donne: flat(give),
    p_recoit: flat(receive),
    p_part: share,
  });
}

// Returns the outcome: 'valide' (done), 'annule' (a card is gone), else the pot is still short.
export async function contribute(id: number, amount: number): Promise<string> {
  const r = await rpc('echange_contribuer', { p_id: id, p_montant: amount });
  return typeof r === 'string' ? r : '';
}

export async function cancelExchange(id: number): Promise<void> {
  await rpc('echange_annuler', { p_id: id });
}

// The cards that would leave the player's combat deck (the last copy given).
export function leavingDeck(
  mine: ExchangeCard[],
  give: { variante_id: number; quantite: number }[],
): string[] {
  const left = new Map<number, number>();
  for (const c of mine)
    left.set(
      c.carte_id ?? -c.variante_id,
      (left.get(c.carte_id ?? -c.variante_id) ?? 0) + c.quantite,
    );
  const out = new Set<string>();
  for (const g of give) {
    const c = mine.find((x) => x.variante_id === g.variante_id);
    if (!c?.au_deck) continue;
    const key = c.carte_id ?? -c.variante_id;
    const n = (left.get(key) ?? 0) - g.quantite;
    left.set(key, n);
    if (n <= 0) out.add(c.nom);
  }
  return [...out];
}

export const exchangeKeys = {
  all: ['exchanges'] as const,
  info: ['exchanges', 'info'] as const,
  list: ['exchanges', 'list'] as const,
  partners: (q: string) => ['exchanges', 'partners', q] as const,
  collection: (player: string) => ['exchanges', 'collection', player] as const,
};
