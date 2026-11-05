// The visitor pages (visiteur.html, visiteur.json): every published card of the game, by collection,
// with its stats, the text of its effects (packages/describe, the site's wording) and the public
// links of its images. Plain HTML, without script nor sign-in, for a reader that cannot run the site
// (an AI assistant browsing the web, for instance). Written by assemble.ts at each publication; the
// nightly image copy publishes again, so the pages follow the cards within a day.
//
// Only what the game already shows to anyone: the published cards (actif), read with the site's
// public key (cartes_publiques, 61-visiteur.sql). Nothing about the players.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeCard } from '../../packages/describe/src/index.ts';

const SUPABASE_URL = 'https://bjsvqikjnvaomyoifiml.supabase.co';
// The site's publishable key (apps/web/src/lib/supabase.ts): public by design.
const PUBLISHABLE_KEY = 'sb_publishable_-3cPqDCyE-zhb3z5r6dPhg_DJFKGAI6';
const SITE = 'https://mowglitchblaat.github.io/forestcard/';

type Row = {
  id: number;
  nom: string;
  type: string;
  atq: number | string | null;
  pv: number | string | null;
  description: string | null;
  passif: Record<string, unknown> | null;
  ultime: Record<string, unknown> | null;
  effet: Record<string, unknown> | null;
  collections: { nom: string } | null;
  raretes: { nom: string; poids: number | null } | null;
  variantes_carte: { nom: string | null; image_path: string | null; dessin_path?: string | null }[];
};

const TYPES: Record<string, string> = { combattant: 'Combattant', magie: 'Magie', piege: 'Piège' };

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// The published cards, readable without signing in (61-visiteur.sql).
async function fetchCards(): Promise<Row[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cartes_publiques`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE_KEY,
      authorization: `Bearer ${PUBLISHABLE_KEY}`,
      'content-type': 'application/json',
    },
    body: '{}',
  });
  if (!response.ok) throw new Error(`cartes: HTTP ${response.status}`);
  return (await response.json()) as Row[];
}

export function visitorPages(rows: Row[], mirror: Set<string>) {
  const image = (path: string) =>
    mirror.has(path)
      ? SITE + 'img/' + encodeURI(path)
      : `${SUPABASE_URL}/storage/v1/object/public/cartes/${encodeURI(path)}`;
  const cards = rows.map((c) => ({
    nom: c.nom,
    type: TYPES[c.type] ?? c.type,
    collection: c.collections?.nom ?? 'Basique',
    rarete: c.raretes?.nom ?? '',
    atq: c.type === 'combattant' ? Number(c.atq) || 0 : null,
    pv: c.type === 'combattant' ? Number(c.pv) || 0 : null,
    description: c.description || null,
    effets: describeCard({
      type: c.type,
      passif: c.passif as never,
      ultime: c.ultime as never,
      effet: c.effet as never,
    }).map((s) => ({
      titre: s.title,
      ...(s.meta ? { quand: s.meta } : {}),
      textes: s.items.map((i) => i.text),
    })),
    // per version: the finished card, and the bare drawing (no frame, plaque nor numbers) when kept
    images: c.variantes_carte
      .filter((v) => v.image_path || v.dessin_path)
      .map((v) => ({
        version: v.nom || 'Standard',
        url: v.image_path ? image(v.image_path) : null,
        dessin: v.dessin_path ? image(v.dessin_path) : null,
      })),
    poids: c.raretes?.poids ?? 1e9,
  }));
  // Collections by name, the basic cards last; in each, the rarest first, then by name.
  const byCollection = new Map<string, typeof cards>();
  for (const c of cards)
    byCollection.set(c.collection, [...(byCollection.get(c.collection) ?? []), c]);
  const collections = [...byCollection.keys()].sort((a, b) =>
    a === 'Basique' ? 1 : b === 'Basique' ? -1 : a.localeCompare(b, 'fr'),
  );
  const order = (list: typeof cards) =>
    [...list].sort(
      (a, b) =>
        a.type.localeCompare(b.type, 'fr') || a.poids - b.poids || a.nom.localeCompare(b.nom, 'fr'),
    );
  const json = {
    jeu: 'Forest Card',
    description:
      'Jeu de cartes à collectionner du stream Twitch de mowglitchblaat. Toutes les cartes publiées, par collection.',
    genere_le: new Date().toISOString(),
    collections: collections.map((name) => ({
      nom: name,
      cartes: order(byCollection.get(name) ?? []).map(({ poids: _, ...c }) => c),
    })),
  };
  const section = (name: string) => {
    const list = order(byCollection.get(name) ?? []);
    return `<section id="${esc(name)}">
<h2>${esc(name)} (${list.length} carte${list.length > 1 ? 's' : ''})</h2>
${list
  .map(
    (c) => `<article>
<h3>${esc(c.nom)}</h3>
<p><b>${esc(c.type)}</b> · collection ${esc(c.collection)}${c.rarete ? ` · rareté ${esc(c.rarete)}` : ''}${c.atq !== null ? ` · ATQ ${c.atq} · PV ${c.pv}` : ''}</p>
${c.description ? `<p><i>${esc(c.description)}</i></p>` : ''}
${c.effets
  .map(
    (s) =>
      `<p><b>${esc(s.titre)}</b>${'quand' in s && s.quand ? ` (${esc(s.quand)})` : ''} :</p><ul>${s.textes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`,
  )
  .join('\n')}
${c.images
  .map(
    (i) =>
      `<p>Version ${esc(i.version)} : ${[i.url ? `<a href="${esc(i.url)}">carte finie</a>` : '', i.dessin ? `<a href="${esc(i.dessin)}">dessin seul (image de base)</a>` : ''].filter(Boolean).join(' · ')}</p>\n<p>${[i.url ? `<img src="${esc(i.url)}" alt="${esc(`${c.nom} (${i.version}, carte finie)`)}" loading="lazy" width="200">` : '', i.dessin ? `<img src="${esc(i.dessin)}" alt="${esc(`${c.nom} (${i.version}, dessin seul)`)}" loading="lazy" width="200">` : ''].join(' ')}</p>`,
  )
  .join('\n')}
</article>`,
  )
  .join('\n')}
</section>`;
  };
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Forest Card · toutes les cartes (mode visiteur)</title>
<style>body{font-family:system-ui,sans-serif;max-width:60rem;margin:auto;padding:1rem;line-height:1.5;background:#fff;color:#111}article{border-top:1px solid #ddd;padding:.5rem 0}img{border-radius:8px;margin:2px}</style>
</head><body>
<h1>Forest Card · toutes les cartes</h1>
<p>Mode visiteur : toutes les cartes publiées du jeu, par collection, avec leurs statistiques, le texte de leurs effets et les liens de leurs images : la carte finie, et le dessin seul (l'image de base, sans cadre ni écriteau) quand il est gardé. Version JSON : <a href="visiteur.json">visiteur.json</a>. Mis à jour le ${esc(new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }))}.</p>
<p>${cards.length} cartes · collections : ${collections.map((n) => `<a href="#${esc(n)}">${esc(n)}</a>`).join(' · ')}</p>
${collections.map(section).join('\n')}
</body></html>
`;
  return { html, json: JSON.stringify(json, null, 2) };
}

// Writes visiteur.html and visiteur.json into out. Never fails the publication: without the cards
// (the database unreachable), the pages are simply left out.
export async function writeVisitorPages(out: string, root: string): Promise<void> {
  try {
    const list = join(root, 'assets', 'img', 'liste.json');
    const mirror = new Set<string>(
      existsSync(list) ? (JSON.parse(readFileSync(list, 'utf8')) as string[]) : [],
    );
    const { html, json } = visitorPages(await fetchCards(), mirror);
    writeFileSync(join(out, 'visiteur.html'), html);
    writeFileSync(join(out, 'visiteur.json'), json);
    console.log('visiteur.html, visiteur.json <- cartes publiées');
  } catch (e) {
    console.log(`skipped visiteur.html (${e instanceof Error ? e.message : String(e)})`);
  }
}
