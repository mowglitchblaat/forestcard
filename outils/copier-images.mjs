// Copie les images des cartes de Supabase vers le dossier img/ du site (servi par GitHub Pages).
// Lancé chaque nuit par .github/workflows/images.yml (ou à la main : onglet Actions → « Copie des images » → Run workflow).
// Seules les images utilisées (variantes de cartes, boosters, dos) sont copiées, et une seule fois chacune :
// les noms de fichiers sont uniques, une image déjà copiée n'est jamais retéléchargée.
// img/liste.json = liste des images disponibles sur GitHub ; le site s'en sert pour savoir où aller les chercher.
import fs from 'node:fs';
import path from 'node:path';

const SB = 'https://bjsvqikjnvaomyoifiml.supabase.co';
const PUBLIQUE = 'sb_publishable_-3cPqDCyE-zhb3z5r6dPhg_DJFKGAI6';
const KEY = process.env.SUPABASE_KEY || PUBLIQUE;
const DOSSIER = path.resolve('img');
const MAX_OCTETS = 15 * 1024 * 1024;   // sécurité : on ne copie pas un fichier énorme

const entetes = { apikey: KEY };
if (!KEY.startsWith('sb_')) entetes.Authorization = 'Bearer ' + KEY;

async function lire(table, colonnes) {
  const r = await fetch(`${SB}/rest/v1/${table}?select=${colonnes.join(',')}`, { headers: entetes });
  if (!r.ok) throw new Error(`${table} illisible (${r.status}) : ${await r.text()}`);
  const lignes = await r.json();
  return lignes.flatMap(l => colonnes.map(c => l[c])).filter(Boolean);
}

const chemins = new Set(), rapport = { tables: {} };
let erreurs = 0;
for (const [t, c] of [['variantes_carte', ['image_path', 'image_combat']], ['types_boosters', ['image_path']], ['dos_cartes', ['image']]]) {
  try { const l = await lire(t, c); l.forEach(p => chemins.add(p)); rapport.tables[t] = l.length; }
  catch (e) { console.error('✗', e.message); erreurs++; rapport.tables[t] = 'illisible : ' + e.message.slice(0, 200); }
}
if (erreurs === 3) {
  console.error('Aucune table lisible : ajoute la clé secrète Supabase dans GitHub (Settings → Secrets and variables → Actions → SUPABASE_SERVICE_KEY).');
  process.exit(1);
}

const valide = p => typeof p === 'string' && !/^https?:/i.test(p) && !p.split('/').some(s => s === '..' || s === '') && /^[\w\-./ ]+$/.test(p);
const dispo = [];
let copiees = 0, deja = 0, ratees = 0;
for (const p of [...chemins].sort()) {
  if (!valide(p)) { console.warn('ignoré (nom inhabituel) :', p); continue; }
  const dest = path.join(DOSSIER, p);
  if (fs.existsSync(dest)) { deja++; dispo.push(p); continue; }
  try {
    const r = await fetch(`${SB}/storage/v1/object/public/cartes/${encodeURI(p)}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_OCTETS) throw new Error('fichier trop gros (' + buf.length + ' octets)');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    copiees++; dispo.push(p);
    console.log('+', p, Math.round(buf.length / 1024) + ' Ko');
  } catch (e) { ratees++; console.warn('✗', p, e.message); }
}

fs.mkdirSync(DOSSIER, { recursive: true });
// la liste reprend tout ce qui est déjà dans img/ (même si une table n'a pas pu être lue cette fois) : les noms ne sont jamais réutilisés
const tout = fs.readdirSync(DOSSIER, { recursive: true }).map(f => f.split(path.sep).join('/'))
  .filter(f => f !== 'liste.json' && f !== 'rapport.json' && fs.statSync(path.join(DOSSIER, f)).isFile());
fs.writeFileSync(path.join(DOSSIER, 'liste.json'), JSON.stringify([...new Set([...tout, ...dispo])].sort()));
console.log(`${chemins.size} image(s) utilisée(s) : ${copiees} copiée(s), ${deja} déjà présente(s), ${ratees} en échec${erreurs ? `, ${erreurs} table(s) illisible(s)` : ''}.`);
fs.writeFileSync(path.join(DOSSIER, 'rapport.json'), JSON.stringify({ ...rapport, copiees, deja, ratees }, null, 1));
