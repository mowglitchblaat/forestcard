// Mode visiteur : une page statique, lisible sans connexion et sans JavaScript (pour un assistant IA
// comme ChatGPT, ou n'importe qui à qui on donne le lien), avec les règles en bref, toutes les cartes
// publiées (stats et effets, dans les mots du site) et la collection, les decks et les stats des joueurs
// choisis. Écrit visiteur/index.html et visiteur/donnees.json (le dossier courant : assets/).
// Lancé chaque nuit par .github/workflows/images.yml, ou à la main (onglet Actions → « Copie des images »).
// Données lues par la fonction visiteur_donnees() (db/migrations/53-mode-visiteur.sql) avec la clé publique : aucun
// secret. Les joueurs montrés sont ceux de la liste écrite dans cette fonction.
import fs from 'node:fs';
import path from 'node:path';
import { describeCard } from '@forestcard/describe';

const SB = 'https://bjsvqikjnvaomyoifiml.supabase.co';
const PUBLIQUE = 'sb_publishable_-3cPqDCyE-zhb3z5r6dPhg_DJFKGAI6';
// En cas d'échec, le message part aussi en annotation GitHub (visible sans les journaux).
const echec = m => { console.error(m); console.log('::error title=Mode visiteur::' + String(m).replace(/\n/g, ' ').slice(0, 900)); process.exit(1); };
process.on('unhandledRejection', e => echec(e && e.message || e));
const SITE = 'https://mowglitchblaat.github.io/forestcard/';
const DOSSIER = path.resolve('visiteur');

const r = await fetch(`${SB}/rest/v1/rpc/visiteur_donnees`, { method: 'POST', headers: { apikey: PUBLIQUE, 'Content-Type': 'application/json' }, body: '{}' });
if (!r.ok) echec(`visiteur_donnees indisponible (${r.status}) : lance db/migrations/53-mode-visiteur.sql dans Supabase. ${await r.text()}`);
const D = await r.json();
const { cartes, variantes, collections, raretes } = D;

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rar = new Map(raretes.map(r => [r.id, r]));
const col = new Map(collections.map(c => [c.id, c.nom]));
const TYPE = { combattant: 'Combattant', magie: 'Magie', piege: 'Piège' };
const ordreRar = id => -(rar.get(id)?.ordre ?? 0);   // les plus hautes raretés d'abord
cartes.sort((a, b) => ordreRar(a.rarete_id) - ordreRar(b.rarete_id) || String(a.type).localeCompare(b.type) || a.nom.localeCompare(b.nom));
const parCarte = new Map(cartes.map(c => [c.id, c]));
const varsDe = new Map();
for (const v of variantes) if (parCarte.has(v.carte_id)) (varsDe.get(v.carte_id) || varsDe.set(v.carte_id, []).get(v.carte_id)).push(v);

// Le texte d'une carte : ses stats et chaque effet, comme sur le site.
function texteCarte(c) {
  let sections = [];
  try { sections = describeCard(c); } catch (e) { sections = []; }
  return sections.map(s => ({ titre: s.title, precision: s.meta || '', effets: s.items.map(i => i.text) }));
}
const fiche = c => ({
  id: c.id, nom: c.nom, type: TYPE[c.type] || c.type, rarete: rar.get(c.rarete_id)?.nom || '', collection: col.get(c.collection_id) || 'Basique',
  ...(c.type === 'combattant' ? { atq: c.atq, pv: c.pv } : {}),
  versions: (varsDe.get(c.id) || []).map(v => v.nom),
  effets: texteCarte(c), ...(c.description ? { description: c.description } : {}),
});
const catalogue = cartes.map(fiche);

// Les joueurs montrés : collection (versions possédées), decks, stats.
const profils = [];
for (const j of D.joueurs || []) {
  const { collection: coll, decks_enregistres: enr, decks_championnat: champ } = j;
  const deck = (j.deck || []).map(carte_id => ({ carte_id }));
  const stats = j.stats ? [j.stats] : [];
  const varInfo = new Map(variantes.map(v => [v.id, v]));
  const possede = new Map();   // carte → [{version, quantite}]
  for (const l of coll) {
    const v = varInfo.get(l.variante_id);
    if (!v || !parCarte.has(v.carte_id) || !(l.quantite > 0)) continue;
    (possede.get(v.carte_id) || possede.set(v.carte_id, []).get(v.carte_id)).push({ version: v.nom, quantite: l.quantite });
  }
  const nomDe = id => parCarte.get(id)?.nom || `carte ${id}`;
  const liste = ids => (ids || []).map(id => ({ id, nom: nomDe(id), type: TYPE[parCarte.get(id)?.type] || '' }));
  const parCollection = {};
  for (const c of cartes) {
    const k = col.get(c.collection_id) || 'Basique', vs = varsDe.get(c.id) || [], p = possede.get(c.id) || [];
    const e = (parCollection[k] ||= { versions: 0, possedees: 0 });
    e.versions += vs.length; e.possedees += vs.filter(v => p.some(x => x.version === v.nom)).length;
  }
  profils.push({
    pseudo: j.pseudo,
    stats: stats[0] || null,
    collection: cartes.filter(c => possede.has(c.id)).map(c => ({ id: c.id, nom: c.nom, versions: possede.get(c.id) })),
    manquantes: cartes.filter(c => !possede.has(c.id)).map(c => ({ id: c.id, nom: c.nom })),
    progression: parCollection,
    deck_actif: liste(deck.map(d => d.carte_id)),
    decks_enregistres: enr.map(d => ({ nom: d.nom, cartes: liste(d.cartes) })),
    decks_championnat: champ.map(d => ({ division: d.division, cartes: liste(d.cartes) })),
  });
}

const REGLES = [
  'Forest Card est un jeu de cartes à collectionner joué sur le stream Twitch de mowglitchblaat. Les cartes s\'obtiennent dans des boosters (achetés en gold sur le site, ouverts en live) ; chaque carte peut avoir plusieurs versions (Standard et versions alternatives), chacune compte dans la collection.',
  'Trois types de cartes : Combattant (ATQ et PV, des passifs, un ultime), Magie (agit dès le début du combat, parfois pendant un nombre de tours), Piège (caché, se déclenche sous une condition, un nombre de fois limité).',
  'Deck : exactement 10 cartes, au moins 3 combattants, 3 magies et 3 pièges (+ 1 libre), chaque carte une seule fois. Au combat, le jeu tire au hasard 1 combattant, 1 magie et 1 piège du deck.',
  'Combat automatique : chaque carte attaque à son tour (dégâts = ATQ), passifs, ultimes, magies et pièges s\'appliquent. 10 rounds ; sans KO, prolongation avec 3 nouvelles cartes tirées (3 prolongations au plus). Récompenses : victoire 50 gold, nul 20, défaite 10.',
  'Championnat : decks de championnat de 15 cartes (5 combattants, 5 magies, 5 pièges), trois ceintures (rare max, épique max, libre), combats en relais à 3 combattants jusqu\'au KO. Tournois en live : rondes suisses puis double élimination.',
  'Statuts courants : poison, brûlure, saignement, malédiction, gel, fatigue, étourdissement (la carte saute sa prochaine attaque et ne peut ni esquiver, ni riposter), avec souvent des niveaux I à III qui s\'additionnent.',
];

const maj = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' });
const donnees = { jeu: 'Forest Card', site: SITE, mis_a_jour: maj, regles: REGLES, cartes: catalogue, joueurs: profils };

const htmlEffets = f => f.effets.map(s => `<div><b>${esc(s.titre)}</b>${s.precision ? ` <i>(${esc(s.precision)})</i>` : ''}<ul>${s.effets.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('');
const htmlCarte = f => `<tr><td><b>${esc(f.nom)}</b><br><small>#${f.id}</small></td><td>${esc(f.type)}</td><td>${esc(f.rarete)}</td><td>${esc(f.collection)}</td><td>${f.atq != null ? `${f.atq} / ${f.pv}` : '—'}</td><td>${htmlEffets(f) || '—'}${f.description ? `<p><i>${esc(f.description)}</i></p>` : ''}</td><td>${esc(f.versions.join(', '))}</td></tr>`;
const htmlListe = l => l.length ? `<ol>${l.map(c => `<li>${esc(c.nom)} <small>(${esc(c.type)}, #${c.id})</small></li>`).join('')}</ol>` : '<p>—</p>';
const htmlJoueur = p => `<section><h2>Joueur : ${esc(p.pseudo)}</h2>
${p.stats ? `<p>Victoires ${p.stats.victoires}, défaites ${p.stats.defaites}, nuls ${p.stats.nuls} · meilleure série ${p.stats.meilleure_serie} · plus gros coup ${p.stats.plus_gros_coup} · boosters ouverts ${p.stats.boosters_ouverts}</p>` : ''}
<h3>Progression par collection (versions possédées / versions existantes)</h3><ul>${Object.entries(p.progression).map(([k, v]) => `<li>${esc(k)} : ${v.possedees} / ${v.versions}</li>`).join('')}</ul>
<h3>Deck actif</h3>${htmlListe(p.deck_actif)}
<h3>Decks enregistrés</h3>${p.decks_enregistres.map(d => `<h4>${esc(d.nom)}</h4>${htmlListe(d.cartes)}`).join('') || '<p>—</p>'}
<h3>Decks de championnat</h3>${p.decks_championnat.map(d => `<h4>${esc(d.division)}</h4>${htmlListe(d.cartes)}`).join('') || '<p>—</p>'}
<h3>Cartes possédées (${p.collection.length})</h3><ul>${p.collection.map(c => `<li>${esc(c.nom)} <small>#${c.id}</small> : ${c.versions.map(v => `${esc(v.version)} ×${v.quantite}`).join(', ')}</li>`).join('')}</ul>
<h3>Cartes manquantes (${p.manquantes.length})</h3><p>${p.manquantes.map(c => `${esc(c.nom)} <small>#${c.id}</small>`).join(' · ') || '—'}</p></section>`;

const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Forest Card · mode visiteur</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:1100px;margin:auto;padding:16px;background:#0f1a14;color:#e7efe9}a{color:#86efac}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #2b3d33;padding:6px;vertical-align:top;text-align:left}th{background:#18271e}ul,ol{margin:.2em 0 .5em;padding-left:1.3em}small,i{color:#a3b8aa}section{margin-top:2em}</style></head><body>
<h1>Forest Card · mode visiteur</h1>
<p>Page en lecture seule, sans connexion, mise à jour chaque nuit (dernière mise à jour : ${esc(maj)}). Les mêmes données en JSON : <a href="donnees.json">donnees.json</a>. Le site du jeu : <a href="${SITE}">${SITE}</a>.</p>
<h2>Le jeu en bref</h2><ul>${REGLES.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
${profils.map(htmlJoueur).join('\n')}
<section><h2>Toutes les cartes publiées (${catalogue.length})</h2>
<table><tr><th>Carte</th><th>Type</th><th>Rareté</th><th>Collection</th><th>ATQ / PV</th><th>Effets</th><th>Versions</th></tr>
${catalogue.map(htmlCarte).join('\n')}</table></section></body></html>`;

// Rien n'a changé depuis la dernière fois (hors date) : on ne réécrit rien, pas de commit inutile.
const sansDate = d => JSON.stringify({ ...d, mis_a_jour: '' });
try {
  const avant = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'donnees.json'), 'utf8'));
  if (sansDate(avant) === sansDate(donnees)) { console.log('Mode visiteur : rien de nouveau.'); process.exit(0); }
} catch { /* première fois */ }
fs.mkdirSync(DOSSIER, { recursive: true });
fs.writeFileSync(path.join(DOSSIER, 'index.html'), html);
fs.writeFileSync(path.join(DOSSIER, 'donnees.json'), JSON.stringify(donnees, null, 1));
console.log(`Mode visiteur : ${catalogue.length} cartes, ${profils.length} joueur(s) (${profils.map(p => p.pseudo).join(', ')}).`);
