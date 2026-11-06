// Admin · Cartes: the game's cards, their Standard version (images, kept drawing and composer
// settings: 29-composition-cartes.sql), alternative versions, publishing and deleting, the
// balance notes written on every change (table equilibrage, read by the patch notes), and the
// re-rendering of every composed card. As the legacy page's aCartes and noteEquilibrage.

import { fxCond, fxEffet, fxPassif, fxTrigUlt, nz } from '@forestcard/describe';
import { z } from 'zod';
import { type ComposerCard, type ComposerSettings, getComposer } from '@/lib/composer';
import { supabase } from '@/lib/supabase';
import { call, rarityRank, uploadImage, uploadReady } from './admin';

const Num = z.union([z.number(), z.string()]).transform(Number);
const NumOrNull = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => (v === null ? null : Number(v)));

const CardListRow = z.object({
  id: Num,
  nom: z.string(),
  type: z.string(),
  actif: z.boolean().nullable(),
  raretes: z.object({ nom: z.string(), poids: NumOrNull }).nullable(),
  collections: z.object({ nom: z.string() }).nullable(),
  variantes_carte: z.array(z.object({ id: Num })),
});
export type CardListRow = z.infer<typeof CardListRow>;

export async function fetchCardList(): Promise<CardListRow[]> {
  const list = z
    .array(CardListRow)
    .parse(
      await call(
        supabase
          .from('cartes')
          .select('id,nom,type,actif,raretes(nom,poids),collections(nom),variantes_carte(id)')
          .order('id', { ascending: false }),
      ),
    );
  // Légendaire first, then épique, rare, commun; by name for the same rarity.
  return list.sort((a, b) => {
    const x = rarityRank(a.raretes);
    const y = rarityRank(b.raretes);
    return x[0] - y[0] || x[1] - y[1] || a.nom.localeCompare(b.nom, 'fr');
  });
}

// A card as stored: its effects stay JSON (the editor reads them).
const CardRow = z.looseObject({
  id: Num,
  nom: z.string(),
  type: z.string(),
  collection_id: NumOrNull.optional(),
  rarete_id: NumOrNull.optional(),
  atq: NumOrNull.optional(),
  pv: NumOrNull.optional(),
  description: z.string().nullable().optional(),
  actif: z.boolean().nullable().optional(),
  ultime: z.unknown().optional(),
  passif: z.unknown().optional(),
  effet: z.unknown().optional(),
});
export type CardRow = z.infer<typeof CardRow>;

export async function fetchCard(id: number): Promise<CardRow> {
  return CardRow.parse(await call(supabase.from('cartes').select('*').eq('id', id).single()));
}

const StandardRow = z.looseObject({
  id: Num,
  image_path: z.string().nullable().optional(),
  image_combat: z.string().nullable().optional(),
  dessin_path: z.string().nullable().optional(),
  compo: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type StandardRow = z.infer<typeof StandardRow>;

export async function fetchStandard(cardId: number): Promise<StandardRow | null> {
  const rows = z
    .array(StandardRow)
    .parse(
      await call(
        supabase
          .from('variantes_carte')
          .select('*')
          .eq('carte_id', cardId)
          .eq('nom', 'Standard')
          .limit(1),
      ),
    );
  return rows[0] ?? null;
}

export const publicImage = (path: string): string =>
  supabase.storage.from('cartes').getPublicUrl(path).data.publicUrl;

// The card's row as written: what the editor gives.
export type CardWrite = {
  nom: string;
  type: string;
  collection_id: number | null;
  rarete_id: number;
  atq: number | null;
  pv: number | null;
  description: string | null;
  actif: boolean;
  ultime: unknown;
  passif: unknown;
  effet: unknown;
};

// Updates the Standard version (insert: a new card's), its images and kept drawing. Without
// 29-composition-cartes.sql the images are saved without the drawing.
export async function updateStandard(
  cardId: number,
  change: Record<string, unknown>,
  insert: boolean,
): Promise<string> {
  const attempt = async (c: Record<string, unknown>) => {
    const current = insert ? null : await fetchStandard(cardId);
    return current
      ? supabase.from('variantes_carte').update(c).eq('id', current.id)
      : supabase
          .from('variantes_carte')
          .insert({ carte_id: cardId, nom: 'Standard', poids: 100, ...c });
  };
  let result = await attempt(change);
  if (result.error && /dessin_path|compo/.test(result.error.message)) {
    const { dessin_path: _drawing, compo: _compo, ...rest } = change;
    result = await attempt(rest);
    if (!result.error)
      return 'Images enregistrées. Pour que le site garde le dessin et refasse l’image quand la carte change, lance une fois 29-composition-cartes.sql dans Supabase.';
  }
  if (result.error) throw new Error(result.error.message);
  return '';
}

// Composes the card's two images from the drawing and saves them on the Standard version, with the
// drawing (uploaded once) and the settings. Returns the drawing's path.
export async function saveComposed(
  cardId: number,
  card: CardWrite,
  tier: string,
  drawing: HTMLImageElement,
  drawingFile: File | null,
  drawingPath: string | null,
  settings: ComposerSettings,
  insert: boolean,
): Promise<{ drawingPath: string; message: string }> {
  const cpo = getComposer();
  const images = await cpo.images({ dessin: drawing, carte: card, tier, o: settings });
  if (!images.carte) throw new Error("L'image de la carte n'a pas pu être composée.");
  const path = await uploadReady(images.carte);
  const combat = images.combat ? await uploadReady(images.combat) : null;
  let kept = drawingPath;
  if (!kept) {
    if (!drawingFile) throw new Error('Le dessin seul manque.');
    kept = await uploadImage(drawingFile, { maxHeight: 2070, quality: 0.92, prefix: 'dessins/' });
  }
  const message = await updateStandard(
    cardId,
    {
      image_path: path,
      image_combat: combat,
      dessin_path: kept,
      compo: { ...settings, zones: images.zones },
    },
    insert,
  );
  return { drawingPath: kept, message };
}

export async function createCard(card: CardWrite): Promise<number> {
  const created = z
    .object({ id: Num })
    .parse(await call(supabase.from('cartes').insert(card).select('id').single()));
  await noteBalance(null, { ...card, id: created.id });
  return created.id;
}

export async function updateCard(before: CardRow, card: CardWrite): Promise<void> {
  const { type: _type, ...row } = card;
  await call(supabase.from('cartes').update(row).eq('id', before.id));
  await noteBalance(before, { ...before, ...row, id: before.id });
}

// Images already made (the old way): the full card, and the combat image without numbers.
export async function saveReadyImages(
  cardId: number,
  file: File | null,
  combatFile: File | null,
  insert: boolean,
): Promise<string> {
  const change: Record<string, unknown> = {};
  if (file) change.image_path = await uploadImage(file);
  if (combatFile) change.image_combat = await uploadImage(combatFile);
  return updateStandard(cardId, change, insert);
}

export async function setPublished(id: number, on: boolean): Promise<void> {
  await call(supabase.from('cartes').update({ actif: on }).eq('id', id));
  const after = await fetchCard(id);
  await noteBalance({ ...after, actif: !on }, after);
}

// Deletes the card everywhere (collections and decks too, supprimer_carte), then its images.
export async function deleteCard(id: number): Promise<void> {
  const paths = z
    .array(z.string())
    .nullable()
    .parse(await call(supabase.rpc('supprimer_carte', { p_carte_id: id })));
  if (paths?.length) await supabase.storage.from('cartes').remove(paths);
}

// The live ATQ / PV numbers' style in combat, per version (66-chiffres-versions.sql): null = from
// the version's name (FULLEG → gold, FULLEP → violet, Seazer → seazer, else standard).
export const NUMBER_STYLES = {
  standard: 'Standard (rouge et bleu)',
  or: 'Or métallique',
  violet: 'Violet métallique',
  seazer: 'Seazer (blanc, lueur rouge)',
} as const;
export type NumberStyle = keyof typeof NUMBER_STYLES;

export async function addVariant(
  cardId: number,
  nom: string,
  poids: number,
  file: File,
  combatFile: File | null,
  chiffres: NumberStyle | null = null,
): Promise<void> {
  const image_path = await uploadImage(file);
  const image_combat = combatFile ? await uploadImage(combatFile) : null;
  await call(
    supabase.from('variantes_carte').insert({
      carte_id: cardId,
      nom,
      image_path,
      poids,
      chiffres,
      ...(image_combat ? { image_combat } : {}),
    }),
  );
}

const AltVersion = z.object({
  id: Num,
  nom: z.string(),
  chiffres: z.string().nullable(),
  cartes: z.object({ nom: z.string(), type: z.string() }),
});
export type AltVersion = z.infer<typeof AltVersion>;

// The fighters' alternative versions, for their numbers' style.
export async function fetchAltVersions(): Promise<AltVersion[]> {
  return z
    .array(AltVersion)
    .parse(
      await call(
        supabase
          .from('variantes_carte')
          .select('id,nom,chiffres,cartes!inner(nom,type)')
          .neq('nom', 'Standard')
          .eq('cartes.type', 'combattant')
          .order('nom'),
      ),
    )
    .sort((a, b) => a.cartes.nom.localeCompare(b.cartes.nom, 'fr'));
}

export async function setNumberStyle(id: number, chiffres: NumberStyle | null): Promise<void> {
  await call(supabase.from('variantes_carte').update({ chiffres }).eq('id', id));
}

// ── Balance notes (equilibrage): what changed on a card, in words, for the patch notes ──

type Effects = { type?: string; passif?: unknown; ultime?: unknown; effet?: unknown };
type Fx = Parameters<typeof fxPassif>[0];
type EffectFx = Parameters<typeof fxEffet>[0];

const passiveText = (c: Effects): string => {
  const p = c.passif as { briques?: unknown[]; type?: string } | null | undefined;
  const list = p
    ? Array.isArray(p.briques)
      ? (p.briques.filter((b) => b && (b as { type?: string }).type) as Fx[])
      : p.type
        ? [p as Fx]
        : []
    : [];
  return list.map(fxPassif).join(' · ');
};
const ultimateText = (c: Effects): string => {
  const u = c.ultime as { type?: string; briques?: unknown } | null | undefined;
  if (!u || !(u.type || u.briques)) return '';
  return `${fxEffet(u as EffectFx).join(' · ')} (${fxTrigUlt(u as Fx)})`;
};
const effectText = (c: Effects): string => {
  if (c.type === 'magie') return c.effet ? fxEffet(c.effet as EffectFx).join(' · ') : '';
  const e = c.effet as { condition?: unknown; effet?: unknown; declenchements?: unknown } | null;
  if (!e) return '';
  return `${fxCond(e.condition as Parameters<typeof fxCond>[0]) || 'Piège caché'} : ${fxEffet(e.effet as EffectFx).join(' · ')}${nz(e.declenchements) > 1 ? ` (jusqu'à ${nz(e.declenchements)} fois)` : ''}`;
};

type Change = { champ: string; avant: string | null; apres: string; sens: number };
type Noted = Record<string, unknown> & Effects & { id: number; nom?: string };

// Never blocks the save: a note that fails is lost, as on the legacy page.
export async function noteBalance(before: Noted | null, after: Noted): Promise<void> {
  try {
    const rarities = z
      .array(z.object({ id: Num, nom: z.string() }))
      .parse(await call(supabase.from('raretes').select('id,nom')));
    const rarity = (id: unknown) => rarities.find((r) => r.id === Number(id))?.nom;
    const str = (v: unknown) => (v === null || v === undefined ? null : String(v as string));
    const changes: Change[] = [];
    if (!before) {
      changes.push({
        champ: 'Nouvelle carte',
        avant: null,
        apres: [
          rarity(after.rarete_id),
          after.type === 'combattant'
            ? `ATQ ${str(after.atq) ?? '?'} · PV ${str(after.pv) ?? '?'}`
            : after.type,
        ]
          .filter(Boolean)
          .join(' · '),
        sens: 0,
      });
    } else {
      const num = (key: string, label: string) => {
        const a = before[key];
        const b = after[key];
        if (a === b || ((a === null || a === undefined) && (b === null || b === undefined))) return;
        changes.push({
          champ: label,
          avant: str(a),
          apres: str(b) ?? '',
          sens:
            a === null || a === undefined || b === null || b === undefined
              ? 0
              : Math.sign(Number(b) - Number(a)),
        });
      };
      if (before.nom !== after.nom)
        changes.push({
          champ: 'Nom',
          avant: str(before.nom),
          apres: str(after.nom) ?? '',
          sens: 0,
        });
      if (before.rarete_id !== after.rarete_id)
        changes.push({
          champ: 'Rareté',
          avant: rarity(before.rarete_id) ?? '?',
          apres: rarity(after.rarete_id) ?? '?',
          sens: 0,
        });
      if (after.type === 'combattant' || before.type === 'combattant') {
        num('atq', 'ATQ');
        num('pv', 'PV');
      }
      const type = after.type ?? before.type;
      const texts = { passif: passiveText, ultime: ultimateText, effet: effectText } as const;
      for (const key of ['passif', 'ultime', 'effet'] as const) {
        if (JSON.stringify(before[key] ?? null) === JSON.stringify(after[key] ?? null)) continue;
        const label = {
          passif: 'Passif',
          ultime: 'Ultime',
          effet: type === 'piege' ? 'Piège' : 'Effet',
        }[key];
        changes.push({
          champ: label,
          avant: texts[key]({ ...before, type }) || '',
          apres: texts[key]({ ...after, type }),
          sens: 0,
        });
      }
      if (!!before.actif !== !!after.actif)
        changes.push({
          champ: 'Disponible',
          avant: before.actif ? 'Oui' : 'Non',
          apres: after.actif ? 'Oui' : 'Non',
          sens: 0,
        });
    }
    if (!changes.length) return;
    await supabase.from('equilibrage').insert({
      carte_id: after.id,
      carte_nom: after.nom ?? before?.nom ?? '?',
      carte_type: after.type ?? before?.type ?? null,
      changements: changes,
    });
  } catch {
    // The note is not worth failing the card's save.
  }
}

// ── Re-render every composed card (kept drawing), with the composer as it is now ──

const ComposedRow = z.object({
  id: Num,
  dessin_path: z.string(),
  compo: z.record(z.string(), z.unknown()).nullable().optional(),
  cartes: z
    .looseObject({ nom: z.string(), raretes: z.looseObject({ nom: z.string() }).nullable() })
    .nullable(),
});

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
// Supabase saturates when cards follow too fast (« Too many connections »): a pause between cards,
// and up to 4 tries for a card.
const busy = (e: unknown) =>
  /too many|connection|timeout|fetch|network|introuvable|50[234]|429/i.test(
    e instanceof Error ? e.message : String(e),
  );

export async function countComposed(): Promise<number> {
  const { count, error } = await supabase
    .from('variantes_carte')
    .select('id', { count: 'exact', head: true })
    .not('dessin_path', 'is', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// change: settings applied to every card first (a font, a style…), or null to only re-render.
export async function regenerateAll(
  change: Partial<ComposerSettings> | null,
  progress: (text: string) => void,
): Promise<string> {
  const cpo = getComposer();
  const rows = z
    .array(ComposedRow)
    .parse(
      await call(
        supabase
          .from('variantes_carte')
          .select('*,cartes(*,raretes(nom,poids))')
          .not('dessin_path', 'is', null),
      ),
    )
    .filter((r) => r.cartes);
  if (!rows.length)
    return 'Aucune carte composée pour l’instant : ajoute le dessin seul d’une carte pour qu’elle passe au nouveau système.';
  let done = 0;
  const failed: string[] = [];
  for (const [i, v] of rows.entries()) {
    const card = v.cartes;
    if (!card) continue;
    progress(`${i + 1} / ${rows.length} : ${card.nom}…`);
    if (i) await pause(600);
    for (let attempt = 1; ; attempt++) {
      try {
        const drawing = await cpo.dessinDe(publicImage(v.dessin_path));
        if (!drawing) throw new Error('dessin introuvable');
        const settings = { ...cpo.DEF, ...(v.compo ?? {}), ...(change ?? {}) } as ComposerSettings;
        const images = await cpo.images({
          dessin: drawing,
          carte: card as unknown as ComposerCard,
          tier: cpo.tierDe(card.raretes),
          o: settings,
        });
        if (!images.carte) throw new Error('image non composée');
        const update: Record<string, unknown> = {
          image_path: await uploadReady(images.carte),
          compo: { ...(v.compo ?? {}), ...(change ?? {}), zones: images.zones },
        };
        if (images.combat) update.image_combat = await uploadReady(images.combat);
        await call(supabase.from('variantes_carte').update(update).eq('id', v.id));
        done++;
        break;
      } catch (e) {
        if (attempt < 4 && busy(e)) {
          progress(`${i + 1} / ${rows.length} : ${card.nom} — Supabase occupé, nouvel essai…`);
          await pause(2500 * attempt);
          continue;
        }
        failed.push(`${card.nom} (${e instanceof Error ? e.message : String(e)})`);
        break;
      }
    }
  }
  const without = z
    .array(z.object({ cartes: z.object({ nom: z.string() }).nullable() }))
    .parse(
      await call(
        supabase
          .from('variantes_carte')
          .select('cartes(nom)')
          .eq('nom', 'Standard')
          .is('dessin_path', null),
      ),
    )
    .map((v) => v.cartes?.nom)
    .filter((n): n is string => !!n);
  progress('');
  return [
    `${done} carte${done > 1 ? 's' : ''} refaite${done > 1 ? 's' : ''}.`,
    failed.length ? `Pas refaites : ${failed.join(' ; ')}.` : '',
    without.length
      ? `Cartes sans dessin gardé (à rouvrir pour leur remettre le dessin seul, une fois) : ${without.join(', ')}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}
