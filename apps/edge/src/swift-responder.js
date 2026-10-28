/* Fonction Supabase « jeu » (swift-responder) — Jeu de cartes Twitch
   Gère les combats (!combat et duels payants) et le booster quotidien (!quotidien).
   Reçoit l'appel de Streamer.bot, prépare les decks, calcule le combat avec le moteur (ci-dessous),
   enregistre monnaie, statistiques et historique, puis renvoie le journal du combat que l'overlay OBS va rejouer.
   Secrets à définir dans Supabase : COMBAT_SECRET (obligatoire) et SERVICE_KEY (ta clé secrète Supabase, facultatif si SUPABASE_SERVICE_ROLE_KEY existe). */

// ---------------- Réglages ----------------
// Le nombre de combats gratuits par jour se règle dans le site : Admin > Réglages (script 07-dos-et-reglages.sql).
const NOM_MONNAIE = 'gold';
const REGLES = { gain: 50, perte: 10, nul: 20, maxTours: 10 };   // récompenses du combat et nombre de tours maximum
const PAYER_ADVERSAIRE = true;   // true : l'adversaire (même absent) reçoit aussi récompense et statistiques ; false : seul le joueur qui lance le combat

import { simuler, simulerRelais } from '@forestcard/journal';


// ---------------- Championnat : les 3 ceintures (33-championnat.sql) ----------------
// Modes envoyés par Streamer.bot (le site : refuser et ceintures seulement ; défi et combat uniquement en live, dans le chat) : defi (« !defi rare @pseudo »), refuser, accepter (le combat pour le titre,
// en relais 3 contre 3), ceintures (qui détient quoi).
const TITRE_MODES = ['defi', 'refuser', 'accepter', 'ceintures'];
const TITRE_TEXTE = ['refuser', 'ceintures'];
const TITRE_EMOJI = { rare: '🥉', epique: '🥈', libre: '🥇' };
// La ceinture et l'adversaire, où qu'ils soient écrits (champ division, adversaire ou message)
function lireDefi(b) {
  const mots = [b.division, b.adversaire, b.message, b.texte].filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
  let division = '', adversaire = '';
  for (const m of mots) {
    const n = m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
    if (!division && ['rare', 'epique', 'libre'].includes(n)) division = n;
    else if (!adversaire && n) adversaire = m.replace(/^@/, '');
  }
  return { division, adversaire };
}
const erreurSql = (r, def) => String((r.data && r.data.message) || def);
async function championnat(b) {
  const { division, adversaire } = lireDefi(b);
  const id = String(b.twitch_id);
  if (b.mode === 'ceintures') {
    const r = await rpc('ceintures_etat', {});
    if (!r.ok) return txt('Championnat indisponible (33-championnat.sql à lancer dans Supabase).', 409);
    const L = (r.data.ceintures || []).map((c) => `${TITRE_EMOJI[c.division]} ${c.nom} : ${c.pseudo ? c.pseudo + (c.defenses ? ` (${c.defenses} défense${c.defenses > 1 ? 's' : ''})` : '') : 'vacante'}`);
    return txt('🏆 ' + L.join(' · '));
  }
  if (b.mode === 'defi') {
    const r = await rpc('titre_defier', { p_twitch_id: id, p_division: division, p_adversaire: adversaire || null });
    if (!r.ok) return txt(erreurSql(r, 'Défi impossible.'), 409);
    const d = r.data;
    return txt(`${TITRE_EMOJI[d.division]} ${d.challenger} défie ${d.adversaire} pour la ${d.nom}${d.pour_champion ? '' : ' (vacante)'} ! ` +
      `${d.adversaire}, tape !accepter pour le combat (relais 3 contre 3) ou !refuser. ${d.heures} h pour répondre.`);
  }
  if (b.mode === 'refuser') {
    const r = await rpc('titre_refuser', { p_twitch_id: id, p_division: division || null });
    if (!r.ok) return txt(erreurSql(r, 'Refus impossible.'), 409);
    const d = r.data;
    if (d.perdue) return txt(`❌ ${d.adversaire} refuse un ${d.refus_max}e combat pour la ${d.nom} : la ceinture lui est retirée, elle est vacante !`);
    return txt(`❌ ${d.adversaire} refuse le défi de ${d.challenger} pour la ${d.nom}` +
      (d.pour_champion ? ` (refus ${d.refus}/${d.refus_max} : au ${d.refus_max}e, la ceinture est retirée).` : '.'));
  }
  // accepter : le combat pour le titre
  const r = await rpc('titre_preparer', { p_twitch_id: id, p_division: division || null });
  if (!r.ok) return txt(erreurSql(r, 'Combat impossible.'), 409);
  const D = r.data, a = D.a, adv = D.b;
  let res;
  const gain = Number.isFinite(+D.gain) ? +D.gain : 500, perte = Number.isFinite(+D.perte) ? +D.perte : 150;   // 500 au vainqueur, 150 au perdant (et à chacun en cas de nul)
  try {
    const dos = await dosDe([a.id, adv.id]);
    await ajouterRaretes([...(a.deck || []), ...(adv.deck || [])]);
    const niveaux = await reglesNiveaux();
    res = simulerRelais({ pseudo: a.pseudo, deck: a.deck, dos: dos[a.id] }, { pseudo: adv.pseudo, deck: adv.deck, dos: dos[adv.id] },
      { seed: Math.floor(Math.random() * 1e9), regles: { ...REGLES, gain, perte, nul: perte, equipe: 3, niveaux } });
    res.ceintures = await ceinturesDe([a.id, adv.id]);   // avant le combat (titre_conclure n'a pas encore eu lieu)
  } catch (e) {
    console.error('titre :', String(e));
    return txt("Le combat pour le titre a rencontré une erreur, le défi reste en attente.", 500);
  }
  const w = res.gagnant;
  const c = await rpc('titre_conclure', { p_defi: D.id, p_gagnant: w, p_seed: String(res.seed), p_gain_a: res.recompenses[0], p_gain_b: res.recompenses[1] });
  if (!c.ok) return txt(erreurSql(c, 'Combat pour le titre déjà joué.'), 409);
  const T = c.data, E = TITRE_EMOJI[D.division];
  try {
    const J = (res.journal.find((e) => e.t === 'debut') || {}).joueurs || [];
    let tours = 0; for (const e of res.journal) if (e.t === 'tour') tours++;
    const deroule = res.journal.filter((e) => e.t !== 'debut').map((e) => { const o = { tour: e.tour, t: e.t, txt: e.txt }; if (e.c != null) o.c = e.c; return o; });
    const h = await rest('historique_combats', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
      mode: 'titre', joueur_a: a.id, joueur_b: adv.id, pseudo_a: a.pseudo, pseudo_b: adv.pseudo,
      carte_a: J[0] ? J[0].carte : null, carte_b: J[1] ? J[1].carte : null, magie_a: J[0] ? J[0].magie : null, magie_b: J[1] ? J[1].magie : null,
      piege_a: J[0] ? J[0].piege : null, piege_b: J[1] ? J[1].piege : null,
      gagnant: w, gain_a: res.recompenses[0], gain_b: res.recompenses[1], tours, seed: res.seed, deroule }) });
    if (!h.ok) console.error('historique_combats (titre) :', JSON.stringify(h.data));
  } catch (e) { console.error('historique_combats (titre) :', String(e)); }
  const nomW = w === null ? null : (w === 0 ? a.pseudo : adv.pseudo), nomL = w === 0 ? adv.pseudo : a.pseudo;
  // l'overlay affiche la ceinture sur la carte du champion (cote 1 : le défié), au milieu si elle est vacante
  res.titre = { division: D.division, nom: D.nom, cote: D.pour_champion ? 1 : null, nouveau: T.nouveau, champion: T.champion };
  res.annonce = w === null ? `🤝 Match nul entre ${a.pseudo} et ${adv.pseudo} pour la ${D.nom}` + (T.champion ? ` : ${T.champion} garde sa ceinture !` : ' : la ceinture reste vacante !')
    : T.nouveau ? `${E}👑 ${nomW} bat ${nomL} et devient champion de la ${D.nom} !`
    : `${E}🛡️ ${nomW} bat ${nomL} et conserve la ${D.nom} (${T.defenses} défense${T.defenses > 1 ? 's' : ''}) !`;
  res.annonce += ` (+${res.recompenses[0]} ${NOM_MONNAIE} pour ${a.pseudo}, +${res.recompenses[1]} pour ${adv.pseudo})`;
  const intro = `${E} Combat pour la ${D.nom}${D.pour_champion ? '' : ' (vacante)'} : ${a.pseudo} contre ${adv.pseudo}, 3 combattants chacun, jusqu'au KO !`;
  return new Response(JSON.stringify(res), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'x-message': encodeURIComponent(intro) } });
}

// ---------------- Serveur ----------------
const ERREURS = {
  JOUEUR_INCONNU: "Connecte-toi d'abord au site avec Twitch pour jouer.",
  DECK_INVALIDE: "Ton deck n'est plus valide : il faut maintenant 10 cartes (3 combattants, 3 magies, 3 pièges + 1 libre). Complète-le dans l'onglet Mon deck du site !",
  DEJA_JOUE: "Tu as déjà fait ton combat gratuit aujourd'hui, reviens demain !",
  ADVERSAIRE_INCONNU: "Joueur introuvable : il doit s'être connecté au site au moins une fois.",
  ADVERSAIRE_SOI: "Tu ne peux pas te défier toi-même.",
  ADVERSAIRE_SANS_DECK: "Ce joueur n'a pas de deck valide (10 cartes) pour l'instant.",
  AUCUN_ADVERSAIRE: "Aucun adversaire disponible pour l'instant.",
  DEJA_RECLAME: 'Tu as déjà récupéré ton booster quotidien, reviens demain !',
  AUCUN_BOOSTER_QUOTIDIEN: "Aucun booster n'est distribué en ce moment.",
};
const txt = (m, status = 200) => new Response(m, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
// Le site (onglet « Jouer », jeu en pause pour les let's play) appelle aussi cette fonction, depuis le navigateur du joueur
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Expose-Headers': 'x-message' };
const PAUSE = "🎬 Le jeu est en pause pendant le let's play : ouvre tes boosters et fais tes combats sur le site !";
const EN_LIVE = 'Le jeu se joue en live en ce moment : rejoins le stream pour jouer !';
const FERME = '🔒 Le jeu est fermé pour le moment, à bientôt !';

function entetes() {
  const K = Deno.env.get('SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const h = { apikey: K, 'Content-Type': 'application/json' };
  if (!K.startsWith('sb_')) h.Authorization = 'Bearer ' + K;
  return h;
}
async function rpc(nom, args) {
  const U = Deno.env.get('SUPABASE_URL');
  const r = await fetch(`${U}/rest/v1/rpc/${nom}`, { method: 'POST', headers: entetes(), body: JSON.stringify(args) });
  const t = await r.text();
  let data; try { data = JSON.parse(t); } catch { data = t; }
  return { ok: r.ok, data };
}
// Lecture / écriture directe d'une table (clé secrète)
async function rest(chemin, opt = {}) {
  const U = Deno.env.get('SUPABASE_URL');
  const r = await fetch(`${U}/rest/v1/${chemin}`, { method: opt.method || 'GET', headers: { ...entetes(), ...(opt.headers || {}) }, body: opt.body });
  const t = await r.text();
  let data; try { data = JSON.parse(t); } catch { data = t; }
  return { ok: r.ok, data };
}
const jourParis = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });   // AAAA-MM-JJ
// Minuit (heure de Paris) du jour en cours, au format ISO avec décalage horaire (+01:00 l'hiver, +02:00 l'été)
function debutJourParis() {
  const j = jourParis(), midi = new Date(j + 'T12:00:00Z');
  const h = parseInt(midi.toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }), 10);
  const dec = h - 12;
  return `${j}T00:00:00${dec >= 0 ? '+' : '-'}${String(Math.abs(dec)).padStart(2, '0')}:00`;
}
// Niveaux des statuts (Admin > Réglages, rework d'octobre 2026) : ce que fait chaque niveau I, II, III. Absents ou illisibles : valeurs par défaut du moteur.
async function reglesNiveaux() {
  try {
    const r = await rest('reglages_jeu?cle=eq.niveaux_statuts&select=valeur');
    const v = r.ok && Array.isArray(r.data) && r.data[0] ? r.data[0].valeur : '';
    const o = v ? JSON.parse(v) : null;
    return o && typeof o === 'object' ? o : undefined;
  } catch { return undefined; }
}
// Gains des combats (Admin > Réglages) : gold par victoire / défaite / nul, multiplicateur des soirées spéciales (×2…) avec heure de fin facultative
async function reglesGains() {
  const v = {};
  try {
    const r = await rest('reglages_jeu?cle=in.(gain_victoire,gain_defaite,gain_nul,multiplicateur_gains,multiplicateur_fin)&select=cle,valeur');
    if (r.ok && Array.isArray(r.data)) r.data.forEach(x => { v[x.cle] = x.valeur; });
  } catch { /* réglages illisibles : gains par défaut */ }
  const nb = (x, d) => { const n = parseFloat(x); return Number.isFinite(n) && n >= 0 ? n : d; };
  const fin = v.multiplicateur_fin ? new Date(v.multiplicateur_fin) : null;
  const mult = fin && !isNaN(fin.getTime()) && fin.getTime() < Date.now() ? 1 : Math.min(10, nb(v.multiplicateur_gains, 1));
  return { mult, gain: Math.round(nb(v.gain_victoire, REGLES.gain) * mult), perte: Math.round(nb(v.gain_defaite, REGLES.perte) * mult), nul: Math.round(nb(v.gain_nul, REGLES.nul) * mult) };
}
// Événement Bounty (Admin > Réglages) : une prime aléatoire (entre min et max gold) apparaît à la fin des combats
// et se partage entre les deux joueurs (ex. 70 % gagnant / 30 % perdant ; match nul : moitié-moitié). Heure de fin facultative.
async function reglesBounty() {
  const v = {};
  try {
    const r = await rest('reglages_jeu?cle=in.(bounty_actif,bounty_min,bounty_max,bounty_part_gagnant,bounty_chance,bounty_tout,bounty_fin)&select=cle,valeur');
    if (r.ok && Array.isArray(r.data)) r.data.forEach(x => { v[x.cle] = x.valeur; });
  } catch { return null; }
  if (String(v.bounty_actif) !== '1') return null;
  const fin = v.bounty_fin ? new Date(v.bounty_fin) : null;
  if (fin && !isNaN(fin.getTime()) && fin.getTime() < Date.now()) return null;
  const nb = (x, d, max) => { const n = parseFloat(x); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : d; };
  const min = Math.round(nb(v.bounty_min, 5, 100000)), max = Math.max(min, Math.round(nb(v.bounty_max, 90, 100000)));
  return { min, max, part: nb(v.bounty_part_gagnant, 70, 100), chance: nb(v.bounty_chance, 30, 100), tout: nb(v.bounty_tout, 10, 100) };
}
// Anti-farm : nombre maximum de combats entre deux mêmes joueurs par jour (Admin > Réglages, 0 = pas de limite)
async function limiteMemeAdversaire() {
  try {
    const r = await rest('reglages_jeu?cle=eq.combats_meme_adversaire_par_jour&select=valeur');
    if (r.ok && Array.isArray(r.data) && r.data[0]) { const n = parseInt(r.data[0].valeur, 10); if (Number.isFinite(n) && n >= 0) return n; }
  } catch { /* réglage illisible : valeur par défaut */ }
  return 3;
}
// Combats déjà joués aujourd'hui entre x et y, dans les deux sens (null si le compte est illisible : on ne bloque pas)
async function combatsEntre(x, y) {
  try {
    const r = await rest(`historique_combats?select=id&cree_le=gte.${encodeURIComponent(debutJourParis())}` +
      `&or=(and(joueur_a.eq.${x},joueur_b.eq.${y}),and(joueur_a.eq.${y},joueur_b.eq.${x}))`);
    return r.ok && Array.isArray(r.data) ? r.data.length : null;
  } catch { return null; }
}

// Rareté de chaque carte (couleur, nom) pour les effets de brillance pendant le combat — ne bloque jamais un combat en cas de souci
async function ajouterRaretes(cartes) {
  try {
    const ids = [...new Set(cartes.map((c) => c && c.id).filter((x) => x != null))];
    if (!ids.length) return;
    const r = await rest(`cartes?id=in.(${ids.join(',')})&select=id,raretes(nom,couleur,poids)`);
    if (!r.ok || !Array.isArray(r.data)) return;
    const m = {}; r.data.forEach((x) => { m[x.id] = Array.isArray(x.raretes) ? x.raretes[0] : x.raretes; });
    cartes.forEach((c) => { if (c && m[c.id]) c.rar = m[c.id]; });
  } catch (_) { /* sans rareté : pas de brillance, rien d'autre */ }
}

// Ceintures détenues par chaque joueur (33-championnat.sql) : l'overlay les affiche autour de sa carte. Sans gravité en cas de souci.
async function ceinturesDe(ids) {
  try {
    const r = await rest('ceintures?select=division,champion&champion=not.is.null');
    const L = r.ok && Array.isArray(r.data) ? r.data : [];
    return ids.map((id) => L.filter((c) => c.champion === id).map((c) => c.division));
  } catch { return ids.map(() => []); }
}

// Dos de carte choisi par chaque joueur (dos de base si aucun choix) — ne bloque jamais un combat en cas de souci
async function dosDe(ids) {
  const out = {};
  try {
    const rj = await rest(`joueurs?id=in.(${ids.join(',')})&select=id,dos_actif`);
    const rd = await rest('dos_cartes?select=id,image,par_defaut');
    const joueurs = rj.ok && Array.isArray(rj.data) ? rj.data : [], dos = rd.ok && Array.isArray(rd.data) ? rd.data : [];
    const base = dos.find(d => d.par_defaut);
    for (const id of ids) {
      const j = joueurs.find(x => x.id === id), choisi = j && j.dos_actif ? dos.find(d => d.id === j.dos_actif) : null;
      out[id] = (choisi || base || {}).image || null;
    }
  } catch { /* pas de dos : l'overlay affiche le dos standard */ }
  return out;
}

// Jeu en live (Admin > Réglages) : en pause, les commandes du live répondent PAUSE et le site prend le relais
async function jeuEnLive() {
  try {
    const r = await rest('reglages_jeu?cle=eq.jeu_live&select=valeur');
    if (r.ok && Array.isArray(r.data) && r.data[0]) return String(r.data[0].valeur) !== '0';
  } catch { /* réglage illisible : en live, comme avant */ }
  return true;
}
// Jeu fermé (Admin > Réglages, 40-jeu-ferme.sql) : ni en live ni sur le site, sauf pour l'admin qui teste depuis le site
async function jeuFerme() {
  try {
    const r = await rest('reglages_jeu?cle=eq.jeu_ferme&select=valeur');
    if (r.ok && Array.isArray(r.data) && r.data[0]) return String(r.data[0].valeur) === '1';
  } catch { /* réglage illisible : ouvert, comme avant */ }
  return false;
}
// Joueur connecté au site : son jeton de connexion (Authorization) donne son compte, son identifiant Twitch, son gold, et s'il est admin
async function joueurDuSite(req, corps) {
  // le site envoie son jeton dans le corps (requête « simple », sans pré-vérification CORS du navigateur), ou dans l'en-tête Authorization
  const tok = String((corps && corps.jeton) || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  if (!tok) return null;
  const U = Deno.env.get('SUPABASE_URL'), A = Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_-3cPqDCyE-zhb3z5r6dPhg_DJFKGAI6';
  try {
    const ru = await fetch(`${U}/auth/v1/user`, { headers: { apikey: A, Authorization: 'Bearer ' + tok } });
    if (!ru.ok) return null;
    const u = await ru.json();
    if (!u || !u.id) return null;
    const rj = await rest(`joueurs?id=eq.${u.id}&select=id,twitch_id,monnaie`);
    const j = rj.ok && Array.isArray(rj.data) ? rj.data[0] : null;
    if (!j || !j.twitch_id) return null;
    let admin = false;
    try {
      const ra = await fetch(`${U}/rest/v1/rpc/is_admin`, { method: 'POST', headers: { apikey: A, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: '{}' });
      admin = ra.ok && (await ra.json()) === true;
    } catch { admin = false; }
    return { ...j, admin };
  } catch { return null; }
}
// Prix d'un duel lancé depuis le site (en live, le duel coûte des points de chaîne) : Admin > Réglages
async function prixDuelSite() {
  try {
    const r = await rest('reglages_jeu?cle=eq.duel_site_prix&select=valeur');
    if (r.ok && Array.isArray(r.data) && r.data[0]) { const n = parseInt(r.data[0].valeur, 10); if (Number.isFinite(n) && n >= 0) return n; }
  } catch { /* valeur par défaut */ }
  return 50;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const r = await traiter(req);
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  return new Response(r.body, { status: r.status, headers: h });
});

async function traiter(req) {
  // Streamer.bot (live) : secret partagé · le site : jeton de connexion du joueur
  let b = {}; try { b = await req.json(); } catch { return txt('Requête illisible.', 400); }
  let site = null;
  if (req.headers.get('x-secret') !== Deno.env.get('COMBAT_SECRET')) {
    site = await joueurDuSite(req, b);
    if (!site) return txt('Accès refusé.', 401);
  }
  delete b.jeton;
  const [live, ferme] = await Promise.all([jeuEnLive(), jeuFerme()]);
  // fermé : tout est coupé, en live comme sur le site ; l'admin peut encore tester depuis le site
  if (ferme && !(site && site.admin)) return txt(FERME, 409);
  if (site) {
    // le combat pour le titre se joue uniquement en live, dans le chat (!accepter) : jamais depuis le site
    if (b.mode === 'accepter') return txt('Le combat pour le titre se joue en live : accepte le défi dans le chat avec !accepter.', 409);
    if (b.mode === 'defi') return txt('Le championnat se joue en live : lance ton défi dans le chat avec !defi.', 409);
    // depuis le site, on peut seulement refuser un défi et lire les ceintures, même en live
    if (live && !site.admin && !TITRE_TEXTE.includes(b.mode)) return txt(EN_LIVE, 409);
    b.twitch_id = site.twitch_id;
  } else if (!live) return txt(PAUSE, 409);
  if (!b.twitch_id) return txt('Joueur manquant.', 400);
  // championnat : Streamer.bot peut envoyer le texte de la commande dans le mode lui-même (« defi rare @bob »)
  // (« accepter %rawInput% » sans rien après arrive avec un espace en trop : « accepter ») : on nettoie toujours le mode
  { const m = String(b.mode || '').trim().split(/\s+/); if (TITRE_MODES.includes(m[0])) { b.mode = m[0]; if (m.length > 1) b.message = [b.message, ...m.slice(1)].filter(Boolean).join(' '); } }

  if (TITRE_MODES.includes(b.mode)) return championnat(b);

  // ----- Booster quotidien : 1 à 3 boosters, une fois par jour -----
  if (b.mode === 'booster_quotidien') {
    const r = await rpc('reclamer_booster_quotidien', { p_twitch_id: String(b.twitch_id) });
    if (!r.ok) {
      const code = String((r.data && r.data.message) || '');
      return txt(ERREURS[code] || 'Impossible de récupérer le booster quotidien (' + code + ').', 409);
    }
    const d = r.data, liste = (d.detail || []).map(x => `${x.quantite}× ${x.booster}`).join(', ');
    return txt(`🎁 ${d.pseudo} reçoit ${d.quantite} booster${d.quantite > 1 ? 's' : ''} : ${liste} ! Ouvre-les avec !booster`);
  }

  const mode = b.mode === 'payant' ? 'payant' : 'quotidien';

  // Un duel doit toujours viser un joueur précis
  if (mode === 'payant' && !String(b.adversaire || '').trim()) return txt("Écris le @ du joueur que tu veux défier.", 400);

  // 0) combats gratuits du jour : nombre réglable dans Admin > Réglages
  let joueurId = null, limite = 1, deja = 0, quota = false;
  if (mode === 'quotidien') {
    try {
      const rj = await rest(`joueurs?twitch_id=eq.${encodeURIComponent(String(b.twitch_id))}&select=id&limit=1`);
      if (rj.ok && Array.isArray(rj.data) && rj.data[0]) {
        joueurId = rj.data[0].id;
        const rr = await rest('reglages_jeu?cle=eq.combats_gratuits_par_jour&select=valeur');
        if (rr.ok && Array.isArray(rr.data) && rr.data[0]) { const n = parseInt(rr.data[0].valeur, 10); if (Number.isFinite(n) && n >= 0) limite = n; }
        const rc = await rest(`combats_gratuits_jour?joueur_id=eq.${joueurId}&jour=eq.${jourParis()}&select=nb`);
        if (!rc.ok) throw new Error('compteur illisible');
        deja = Array.isArray(rc.data) && rc.data[0] ? rc.data[0].nb : 0;
        quota = true;
      }
    } catch { quota = false; }   // en cas de souci, on garde la règle d'origine (1 combat gratuit par jour)
    if (quota && deja >= limite) {
      return txt(limite === 0 ? "Les combats gratuits sont désactivés pour le moment."
        : `Tu as déjà fait ${limite > 1 ? 'tes ' + limite + ' combats gratuits' : 'ton combat gratuit'} aujourd'hui, reviens demain !`, 409);
    }
  }

  // duel depuis le site : payé en gold (vérifié ici, prélevé une fois le combat calculé)
  let prixDuel = 0;
  if (site && mode === 'payant') {
    prixDuel = await prixDuelSite();
    if ((+site.monnaie || 0) < prixDuel) return txt(`Il te faut ${prixDuel} ${NOM_MONNAIE} pour lancer un duel depuis le site.`, 409);
  }

  // 1) decks et quota quotidien
  const argsPrep = { p_twitch_id: String(b.twitch_id), p_mode: mode, p_adversaire: b.adversaire || null };
  let prep = await rpc('preparer_combat', argsPrep);
  if (!prep.ok && quota && String((prep.data && prep.data.message) || '') === 'DEJA_JOUE') {
    // Notre compteur autorise encore un combat : on libère le combat gratuit d'origine puis on réessaie
    await rpc('rendre_combat_quotidien', { p_joueur: joueurId });
    prep = await rpc('preparer_combat', argsPrep);
  }
  if (!prep.ok) {
    const code = String((prep.data && prep.data.message) || '');
    return txt(ERREURS[code] || 'Impossible de lancer le combat (' + code + ').', 409);
  }
  // 1 bis) decks de 10 cartes obligatoires (3 combattants, 3 magies, 3 pièges + 1 libre) : les anciens decks de 9 cartes ne jouent plus
  const deckOK = (d) => Array.isArray(d) && new Set(d.map((c) => c && c.id)).size === 10 &&
    ['combattant', 'magie', 'piege'].every((t) => d.filter((c) => c && c.type === t).length >= 3);
  for (let essai = 0; ; essai++) {
    if (!deckOK(prep.data.a.deck)) {
      if (mode === 'quotidien') await rpc('rendre_combat_quotidien', { p_joueur: prep.data.a.id });
      return txt(ERREURS.DECK_INVALIDE, 409);
    }
    if (deckOK(prep.data.b.deck)) break;
    if (mode === 'quotidien') await rpc('rendre_combat_quotidien', { p_joueur: prep.data.a.id });
    if (b.adversaire || essai >= 5) return txt(b.adversaire ? ERREURS.ADVERSAIRE_SANS_DECK : ERREURS.AUCUN_ADVERSAIRE, 409);
    const p2 = await rpc('preparer_combat', argsPrep);   // adversaire au hasard avec un ancien deck : on en tire un autre
    if (!p2.ok) { const code = String((p2.data && p2.data.message) || ''); return txt(ERREURS[code] || 'Impossible de lancer le combat (' + code + ').', 409); }
    prep = p2;
  }
  // 1 ter) anti-farm : limite de combats contre le même adversaire par jour
  const maxPaire = await limiteMemeAdversaire();
  if (maxPaire > 0) {
    // Adversaire tiré au hasard (!combat sans @) : on retente quelques fois pour tomber sur un autre joueur
    for (let essai = 0; ; essai++) {
      const n = await combatsEntre(prep.data.a.id, prep.data.b.id);
      if (n === null || n < maxPaire) break;
      if (mode === 'quotidien') await rpc('rendre_combat_quotidien', { p_joueur: prep.data.a.id });
      if (b.adversaire || essai >= 4) {
        return txt(`${prep.data.a.pseudo} et ${prep.data.b.pseudo} se sont déjà affrontés ${maxPaire} fois aujourd'hui : ` +
          (b.adversaire ? "défie quelqu'un d'autre ou reviens demain !" : "aucun autre adversaire disponible pour l'instant, reviens plus tard !"), 409);
      }
      const p2 = await rpc('preparer_combat', argsPrep);
      if (!p2.ok) { const code = String((p2.data && p2.data.message) || ''); return txt(ERREURS[code] || 'Impossible de lancer le combat (' + code + ').', 409); }
      prep = p2;
    }
  }
  const { a, b: adv } = prep.data;

  // 2) calcul du combat (une seule fois, ici)
  let res, G = { mult: 1 };
  try {
    const dos = await dosDe([a.id, adv.id]);
    G = await reglesGains();
    const niveaux = await reglesNiveaux();
    await ajouterRaretes([...(a.deck || []), ...(adv.deck || [])]);
    res = simuler({ pseudo: a.pseudo, deck: a.deck, dos: dos[a.id] }, { pseudo: adv.pseudo, deck: adv.deck, dos: dos[adv.id] },
      { seed: Math.floor(Math.random() * 1e9), regles: { ...REGLES, gain: G.gain, perte: G.perte, nul: G.nul, niveaux } });
    res.ceintures = await ceinturesDe([a.id, adv.id]);
  } catch (e) {
    if (mode === 'quotidien') await rpc('rendre_combat_quotidien', { p_joueur: a.id });
    return txt('Le combat a rencontré une erreur, il n\'est pas décompté.', 500);
  }

  // duel depuis le site : le prix est prélevé maintenant que le combat a bien eu lieu
  if (prixDuel > 0) {
    try {
      const rm = await rest(`joueurs?id=eq.${a.id}&select=monnaie`);
      const m = rm.ok && Array.isArray(rm.data) && rm.data[0] ? +rm.data[0].monnaie || 0 : 0;
      await rest(`joueurs?id=eq.${a.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ monnaie: Math.max(0, m - prixDuel) }) });
    } catch { /* sans gravité */ }
  }

  // 3) récompenses et statistiques
  const w = res.gagnant;                                         // 0 = lanceur, 1 = adversaire, null = nul
  const gains = [res.recompenses[0], PAYER_ADVERSAIRE ? res.recompenses[1] : 0];
  // Bounty : prime aléatoire partagée entre les deux joueurs (s'ajoute aux gains du combat)
  let bounty = null;
  try {
    const B = await reglesBounty();
    if (B && Math.random() * 100 < B.chance) {
      const total = B.min + Math.floor(Math.random() * (B.max - B.min + 1));
      let parts, tout = false;
      if (w === null) { const h = Math.ceil(total / 2); parts = [h, total - h]; }
      else { tout = Math.random() * 100 < B.tout; const pg = tout ? total : Math.round(total * B.part / 100); parts = w === 0 ? [pg, total - pg] : [total - pg, pg]; }
      if (!PAYER_ADVERSAIRE) parts[1] = 0;
      gains[0] += parts[0]; gains[1] += parts[1];
      bounty = { total, parts, tout };
    }
  } catch { bounty = null; }   // un souci sur la prime ne bloque jamais le combat
  res.recompenses = gains;
  const fin = res.journal[res.journal.length - 1]; if (fin && fin.t === 'fin') { fin.recompenses = gains; if (bounty) fin.bounty = bounty; }
  const dmg = [0, 0], gros = [0, 0]; let tours = 0;
  for (const e of res.journal) {
    if (e.t === 'tour') tours++;
    if (e.t === 'degats' && e.c != null && e.n > 0) { const s = 1 - e.c; dmg[s] += e.n; if (e.n > gros[s]) gros[s] = e.n; }
  }
  const debut = res.journal.find(e => e.t === 'debut');
  const issue = i => w === null ? 'nul' : (w === i ? 'victoire' : 'defaite');
  const lignes = [[a.id, adv.id, 0]];
  if (PAYER_ADVERSAIRE) lignes.push([adv.id, a.id, 1]);
  for (const [jid, aid, i] of lignes) {
    await rpc('enregistrer_combat', { p_joueur: jid, p_adversaire: aid, p_resultat: issue(i), p_gain: gains[i], p_tours: tours,
      p_plus_gros_coup: gros[i], p_degats: dmg[i], p_cartes: [...new Set(res.journal.filter(e => (e.t === 'debut' || e.t === 'prolongation') && e.joueurs).flatMap(e => e.joueurs[i].ids || []).filter(Boolean))], p_mode: mode, p_seed: res.seed });
  }

  // historique des parties : une ligne par combat, avec son déroulé (ne bloque jamais un combat — script 08-historique.sql)
  try {
    const J = (debut && debut.joueurs) || [];
    const deroule = res.journal.filter(e => e.t !== 'debut').map(e => { const o = { tour: e.tour, t: e.t, txt: e.txt }; if (e.c != null) o.c = e.c; return o; });
    const h = await rest('historique_combats', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
      mode, joueur_a: a.id, joueur_b: adv.id, pseudo_a: a.pseudo, pseudo_b: adv.pseudo,
      carte_a: J[0] ? J[0].carte : null, carte_b: J[1] ? J[1].carte : null,
      magie_a: J[0] ? J[0].magie : null, magie_b: J[1] ? J[1].magie : null,
      piege_a: J[0] ? J[0].piege : null, piege_b: J[1] ? J[1].piege : null,
      gagnant: w, gain_a: gains[0], gain_b: gains[1], tours, seed: res.seed, deroule }) });
    if (!h.ok) console.error('historique_combats :', JSON.stringify(h.data));
  } catch (e) { console.error('historique_combats :', String(e)); }

  // compteur des combats gratuits du jour
  if (mode === 'quotidien' && quota) {
    try {
      await rest('combats_gratuits_jour?on_conflict=joueur_id,jour', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ joueur_id: a.id, jour: jourParis(), nb: deja + 1 }) });
    } catch { /* sans gravité */ }
  }

  // 4) messages pour le chat
  const nomW = w === null ? null : (w === 0 ? a.pseudo : adv.pseudo);
  const gagne = (p, g) => `${p} gagne ${g} ${NOM_MONNAIE}`;
  const recompenses = PAYER_ADVERSAIRE ? `${gagne(a.pseudo, gains[0])}, ${gagne(adv.pseudo, gains[1])}.` : `${gagne(a.pseudo, gains[0])}.`;
  res.annonce = w === null ? `🤝 Match nul entre ${a.pseudo} et ${adv.pseudo} ! ${recompenses}`
    : `🏆 ${nomW} remporte le combat contre ${w === 0 ? adv.pseudo : a.pseudo} ! ${recompenses}`;
  if (G.mult !== 1) res.annonce += ` (🔥 gains ×${G.mult} !)`;
  if (bounty) res.annonce += bounty.tout ? ` 💰 BOUNTY de ${bounty.total} ${NOM_MONNAIE} : ${nomW} rafle tout !`
    : ` 💰 Bounty de ${bounty.total} ${NOM_MONNAIE} : ${a.pseudo} +${bounty.parts[0]}${PAYER_ADVERSAIRE ? `, ${adv.pseudo} +${bounty.parts[1]}` : ''} !`;
  const intro = `⚔️ ${a.pseudo} affronte ${adv.pseudo} !`;
  return new Response(JSON.stringify(res), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'x-message': encodeURIComponent(intro) } });
}