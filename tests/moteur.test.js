/* Tests du moteur de combat — Forest Card
   Lancer :  node --test tests/
   Chaque test vérifie une règle décidée pour le jeu. Si un test casse après une modification, c'est une régression. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../moteur-combat.js');

// ---------- outils ----------
const C = (nom, atq, pv, x = {}) => ({ type: 'combattant', nom, atq, pv, ...x });
const MAG = (nom, effet) => ({ type: 'magie', nom, effet });
const PIE = (nom, condition, effet, declenchements = 1) => ({ type: 'piege', nom, effet: { condition, effet, declenchements } });
const combat = (deckA, deckB, opt = {}) => M.simuler({ pseudo: 'A', deck: deckA }, { pseudo: 'B', deck: deckB }, { seed: 1, ...opt });
// numéros des attaques de A au moment de chaque événement filtré
function auxAttaquesDeA(r, filtre) {
  let k = 0; const out = [];
  r.journal.forEach(e => { if (e.t === 'attaque' && e.c === 0) k++; if (filtre(e)) out.push(k); });
  return out;
}
const lignes = (r, f) => r.journal.filter(f);
const SOLIDE = 5000; // PV assez hauts pour qu'aucun KO ne vienne perturber un test

// ================= Fin de combat =================
test('KO : la carte à 0 PV perd, récompenses 50 / 10', () => {
  const r = combat([C('Fort', 100, 100)], [C('Faible', 1, 50)]);
  assert.equal(r.gagnant, 0);
  assert.deepEqual(r.recompenses, [50, 10]);
});

test('double KO : les deux cartes tombent, match nul (20 / 20)', () => {
  const renvoi = { type: 'renvoi', val: 100, u: 'pct' };
  for (const seed of [1, 2]) {
    const r = combat([C('a', 50, 50, { passif: renvoi })], [C('b', 50, 50, { passif: renvoi })], { seed });
    const fin = r.journal.at(-1);
    assert.equal(r.gagnant, null);
    assert.deepEqual(r.recompenses, [20, 20]);
    assert.deepEqual(fin.pv, [0, 0]);
  }
});

test('prolongation : sans KO au dernier tour, 3 nouvelles cartes, 3 prolongations maximum', () => {
  const deckA = [C('a1', 1, SOLIDE), C('a2', 1, SOLIDE), C('a3', 1, SOLIDE), MAG('m1', { type: 'soin', val: 1 }), MAG('m2', { type: 'soin', val: 1 })];
  const deckB = [C('b1', 1, SOLIDE), C('b2', 1, SOLIDE), MAG('n1', { type: 'soin', val: 1 })];
  const r = combat(deckA, deckB, { regles: { maxTours: 2 } });
  const P = lignes(r, e => e.t === 'prolongation');
  assert.equal(P.length, 3, '3 prolongations');
  P.forEach(p => assert.equal(p.joueurs.length, 2));
  // la 1re prolongation tire un combattant jamais joué
  const debut = r.journal[0].joueurs[0].carte;
  assert.notEqual(P[0].joueurs[0].carte, debut);
});

test('prolongation : un KO pendant la prolongation termine le combat', () => {
  const r = combat([C('mou', 1, SOLIDE), C('tueur', 999, SOLIDE)], [C('cible', 1, 100)], { regles: { maxTours: 1 }, seed: 4 });
  assert.equal(r.gagnant, 0);
});

test('même seed = même combat (rejouable)', () => {
  const d = () => [C('a', 7, 80, { passif: { type: 'aleatoire', chance: 50 } }), MAG('m', { type: 'aleatoire', nbalea: 2 })];
  const a = combat(d(), d(), { seed: 42 }), b = combat(d(), d(), { seed: 42 });
  assert.deepEqual(a.journal.map(e => e.txt), b.journal.map(e => e.txt));
});

test('les tours sont numérotés par carte qui joue (tour 1, tour 2, tour 3…)', () => {
  const r = combat([C('a', 1, SOLIDE)], [C('b', 1, SOLIDE)], { regles: { maxTours: 3, maxProlong: 0 } });
  const T = lignes(r, e => e.t === 'tour').map(e => e.txt);
  assert.deepEqual(T, ['Tour 1', 'Tour 2', 'Tour 3', 'Tour 4', 'Tour 5', 'Tour 6']);
});

// ================= Magies =================
test('annulation de magie : aucun effet ne passe, même en multi-effet, peu importe qui joue en premier', () => {
  const multi = MAG('Multi', { briques: [{ type: 'atq_mod', cible: 'soi', val: 50, u: 'pct' }, { type: 'poison_effet', ciblem: 'adversaire', degtour: 5, tours: 3 },
    { type: 'renvoi', val: 50, tours: 3 }, { type: 'double_degats', tours: 2 }, { type: 'malediction', ciblem: 'adversaire', val: 3, tours: 3 }] });
  for (let seed = 1; seed < 60; seed++) {
    const r = combat([C('a', 10, SOLIDE), multi], [C('b', 10, SOLIDE), MAG('Contre', { type: 'annule_magies', tours: 0 })], { seed, regles: { maxTours: 4, maxProlong: 0 } });
    const txt = r.journal.map(e => e.txt).join('\n');
    assert.doesNotMatch(txt, /empoisonné|maudit|double ses|renvoyés|ATQ de a \+/, `seed ${seed}`);
  }
});

test('annulation de magie pendant X tours : la magie revient ensuite', () => {
  const r = combat([C('a', 10, SOLIDE), MAG('Force', { type: 'atq_mod', cible: 'soi', val: 50, u: 'pct' })],
    [C('b', 10, SOLIDE), MAG('Contre', { type: 'annule_magies', tours: 2 })], { regles: { maxTours: 4, maxProlong: 0 } });
  assert.ok(lignes(r, e => e.k === 'magie_retour').length === 1, 'la magie revient');
  assert.ok(lignes(r, e => /ATQ de a \+5/.test(e.txt)).length >= 1, "l'effet s'applique au retour");
});

test('annulation en plein combat : les effets encore actifs de la magie sont retirés', () => {
  const multi = MAG('Multi', { briques: [{ type: 'atq_mod', cible: 'soi', val: 50, u: 'pct' }, { type: 'poison_effet', ciblem: 'adversaire', degtour: 5, tours: 6 }] });
  const r = combat([C('a', 10, SOLIDE), multi], [C('b', 10, SOLIDE, { ultime: { type: 'annule_magies', apres_tours: 2, utilisations: 1 } })], { seed: 7, regles: { maxTours: 6, maxProlong: 0 } });
  const i = r.journal.findIndex(e => e.k === 'magie_annulee');
  assert.ok(i > 0);
  assert.equal(r.journal[i].atq[0], 10, "l'ATQ bonus est retirée");
  assert.equal(lignes(r, (e, j) => j > i && e.k === 'poison' && e.t === 'degats').length, 0, 'plus de poison après');
});

// ================= Pièges =================
test('piège « l\'adversaire a attaqué N fois » : se déclenche toutes les N attaques jusqu\'au maximum', () => {
  const cas = [[2, 4, [2, 4, 6, 8]], [2, 2, [2, 4]], [1, 3, [1, 2, 3]], [3, 10, [3, 6, 9]]];
  for (const [N, max, attendu] of cas) {
    const r = combat([C('A', 1, SOLIDE)], [C('B', 1, SOLIDE), PIE('P', { type: 'adv_attaque', coups: N }, { type: 'degats', val: 1 }, max)], { seed: 3, regles: { maxTours: 10, maxProlong: 0 } });
    assert.deepEqual(auxAttaquesDeA(r, e => e.t === 'piege'), attendu, `N=${N} max=${max}`);
  }
});

test('insensibilité : le piège se déclenche quand même (sans effet) et consomme son déclenchement', () => {
  const voile = MAG('Voile', { type: 'insensible_piege', tours: 2 });
  // 1 seul déclenchement : épuisé pendant l'insensibilité, ne revient jamais
  let r = combat([C('A', 1, SOLIDE), voile], [C('B', 1, SOLIDE), PIE('P', { type: 'adv_attaque', coups: 1 }, { type: 'degats', val: 3 }, 1)], { seed: 3, regles: { maxTours: 6, maxProlong: 0 } });
  assert.deepEqual(auxAttaquesDeA(r, e => e.t === 'piege'), [1]);
  assert.match(lignes(r, e => e.t === 'piege')[0].txt, /épuisé/);
  assert.equal(lignes(r, e => e.k === 'piege_rearme').length, 0);
  // 3 déclenchements : 2 consommés sans effet, puis il redevient actif et frappe
  r = combat([C('A', 1, SOLIDE), voile], [C('B', 1, SOLIDE), PIE('P', { type: 'adv_attaque', coups: 1 }, { type: 'degats', val: 3 }, 3)], { seed: 3, regles: { maxTours: 6, maxProlong: 0 } });
  assert.deepEqual(auxAttaquesDeA(r, e => e.t === 'piege'), [1, 2, 3]);
  assert.equal(lignes(r, e => e.k === 'piege_rearme').length, 1);
  assert.equal(lignes(r, e => e.t === 'degats' && /3 dégâts directs/.test(e.txt)).length, 1, 'un seul vrai effet');
});

test('piège détruit : il se brise (événement piege_detruit)', () => {
  const r = combat([C('A', 1, SOLIDE), MAG('Brise', { type: 'detruire', carte: 'piege' })], [C('B', 1, SOLIDE), PIE('P', { type: 'adv_attaque', coups: 1 }, { type: 'degats', val: 3 })], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.equal(lignes(r, e => e.k === 'piege_detruit').length, 1);
  assert.equal(lignes(r, e => e.t === 'piege').length, 0, 'le piège détruit ne se déclenche plus');
});

test('vol de magie : la carte passe chez le voleur et son effet aussi', () => {
  const r = combat([C('A', 6, SOLIDE), MAG('Force', { type: 'atq_mod', cible: 'soi', val: 50, u: 'pct' })],
    [C('B', 6, SOLIDE), PIE('Larcin', { type: 'adv_attaque', coups: 1 }, { type: 'voler', carte: 'magie' })], { seed: 4, regles: { maxTours: 2, maxProlong: 0 } });
  const v = lignes(r, e => e.k === 'vol_carte');
  assert.equal(v.length, 1);
  assert.equal(v[0].from, 0); assert.equal(v[0].to, 1); assert.equal(v[0].sur, 'piege', 'volée par un piège : prend la place du piège');
  const apres = r.journal.at(-1);
  assert.equal(apres.atq[0], 6, 'le volé perd son bonus');
  assert.equal(apres.atq[1], 9, 'le voleur gagne le bonus');
});

test('piège de réanimation : caché jusqu\'à ce que la carte se reforme (brisée → reformée → piège)', () => {
  const phenix = PIE('Phénix', { type: 'proprio_meurt' }, { briques: [{ type: 'reanimation', pctrev: 50 }, { type: 'degats', val: 5 }] });
  const r = combat([C('A', 40, 100)], [C('B', 5, 60), phenix]);
  const ordre = r.journal.filter(e => ['reanim_mort', 'reanim', 'piege'].includes(e.t)).map(e => e.t);
  assert.deepEqual(ordre.slice(0, 3), ['reanim_mort', 'reanim', 'piege']);
});

test('« évite la mort » passe avant la réanimation, et les dégâts s\'affichent avant l\'effet', () => {
  const evite = MAG('Ange', { briques: [{ type: 'mort_evitee', cond: 'aucune' }, { type: 'reanimation', pctrev: 50 }] });
  const r = combat([C('A', 500, SOLIDE)], [C('B', 1, 100, { passif: { type: 'reanimation', pctrev: 50 } }), evite], { seed: 2, regles: { maxTours: 2, maxProlong: 0 } });
  const i = r.journal.findIndex(e => e.t === 'protege');
  assert.ok(i > 0, 'évite la mort déclenché');
  assert.equal(r.journal[i - 1].t, 'degats', 'les dégâts juste avant');
  assert.equal(r.journal[i].pv[1], 1, 'reste à 1 PV');
  assert.ok(r.journal.findIndex(e => e.t === 'reanim_mort') === -1 || r.journal.findIndex(e => e.t === 'reanim_mort') > i, 'pas de réanimation avant');
});

test('valeurs en % : calculées sur la stat de la carte (7 % de 300 ATQ = 21)', () => {
  const r1 = combat([C('a', 1, SOLIDE), MAG('Lourdeur', { type: 'fatigue', ciblem: 'adversaire', fatval: 7, u: 'pct', fattours: 2 })], [C('b', 300, SOLIDE)]);
  assert.ok(lignes(r1, e => /ATQ de b −21 \(fatigue\)/.test(e.txt || '')).length > 0, 'fatigue 7 % de 300 = −21');
  const r2 = combat([C('a', 200, SOLIDE), MAG('Force', { type: 'atq_mod', cible: 'soi', val: 10, u: 'pct' })], [C('b', 1, SOLIDE)]);
  assert.ok(lignes(r2, e => /ATQ de a \+20/.test(e.txt || '')).length > 0, '+10 % de 200 = +20');
  const r3 = combat([C('a', 1, SOLIDE, { passif: { type: 'renvoi', val: 10, u: 'pct' } })], [C('b', 300, SOLIDE)]);
  assert.ok(lignes(r3, e => /b subit 30 dégâts renvoyés/.test(e.txt || '')).length > 0, 'renvoi 10 % de 300 = 30');
});

// ================= Statuts =================
test('souffle élémentaire : dégâts puis le statut choisi (chaque élément)', () => {
  const att = { brulure: /brûle/, gel: /est gelé \(12 %/, malediction: /maudit \(ATQ −12/, poison: /empoisonné/, saignement: /saigne \(12 %/, fatigue: /fatigué \(ATQ −\d+/ };
  for (const [el, re] of Object.entries(att)) {
    const r = combat([C('a', 10, SOLIDE), MAG('Souffle', { type: 'souffle', val: 50, statut: el, chance: 100, sval: 12, tours: 2 })], [C('b', 300, SOLIDE)], { regles: { maxTours: 2, maxProlong: 0 } });
    const i = r.journal.findIndex(e => e.t === 'souffle');
    assert.ok(i > 0 && r.journal[i].el === el, el + ' : souffle');
    assert.equal(r.journal[i + 1].txt, 'b subit 50 dégâts (souffle)');
    assert.match(r.journal[i + 2].txt, re, el + ' : statut appliqué');
  }
  const r0 = combat([C('a', 10, SOLIDE), MAG('Souffle', { type: 'souffle', val: 50, statut: 'poison', chance: 0, sval: 12 })], [C('b', 300, SOLIDE)], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.ok(lignes(r0, e => /résiste au souffle/.test(e.txt || '')).length === 1, '0 % : pas de statut');
});

test('exécution : 3 marques puis exécutée sous le seuil, même avec « évite la mort », réanimation possible', () => {
  // seuil 1 % (10 PV sur 1000) : à 50 PV le coup suivant est mortel → évite la mort (1 PV) → exécutée quand même
  const r = combat([C('a', 95, SOLIDE, { passif: { type: 'execution', chance: 100, seuilexec: 1 } })], [C('b', 1, 1000, { passif: { type: 'evite_mort' } })], { regles: { maxTours: 30, maxProlong: 0 } });
  const k = r.journal.filter(e => ['marque', 'protege', 'execution'].includes(e.k) || e.t === 'protege').map(e => e.k || e.t);
  assert.deepEqual(k.slice(0, 3), ['marque', 'marque', 'marque'], '3 marques au maximum');
  assert.equal(r.journal.filter(e => e.k === 'marque').length, 3);
  assert.ok(k.indexOf('protege') > 2 && k.indexOf('execution') > k.indexOf('protege'), 'évite la mort puis exécutée');
  assert.equal(r.gagnant, 0);
  // ultime / piège : marques posées directement ; la réanimation marche encore après une exécution
  const r2 = combat([C('a', 95, SOLIDE), MAG('Sentence', { type: 'execution_direct', nbmarques: 3 })], [C('b', 1, 1000, { passif: { type: 'reanimation', pctrev: 50 } })], { regles: { maxTours: 30, maxProlong: 0 } });
  const iE = r2.journal.findIndex(e => e.t === 'statut' && e.k === 'execution');
  assert.ok(iE > 0 && r2.journal.slice(iE).some(e => e.t === 'reanim'), 'réanimée après l\'exécution');
});

test('transcendance : après 4 tours joués, purifiée (étourdissement compris), +15 % ATQ / PV max, et chaque coup purifie l\'adversaire', () => {
  const asc = MAG('Ascension', { type: 'transcendance' });
  // sans étourdissement : transcende à la fin de son 4e tour, bonus +15 %, puis ses coups purifient l'adversaire
  const r = combat([C('a', 100, SOLIDE), asc], [C('b', 10, SOLIDE), MAG('Venin', { type: 'poison_effet', ciblem: 'soi', degtour: 3, tours: 20 })], { regles: { maxTours: 12, maxProlong: 0 } });
  const iT = r.journal.findIndex(e => e.k === 'transc');
  assert.ok(iT > 0, 'transcende');
  assert.equal(r.journal.slice(0, iT).filter(e => e.t === 'attaque' && e.c === 0).length, 4, 'après 4 tours joués');
  const apres = r.journal.slice(iT);
  assert.ok(apres.some(e => e.txt === 'ATQ de a +15'), 'ATQ +15 %');
  assert.ok(apres.some(e => e.txt === `PV max de a +${Math.round(SOLIDE * .15)}`), 'PV max +15 %');
  assert.ok(apres.some(e => e.k === 'purif' && e.c === 1), 'un coup de a purifie l\'adversaire');
  // étourdie longtemps au moment de transcender : l'étourdissement est retiré
  const r2 = combat([C('a', 100, SOLIDE), asc], [C('b', 10, SOLIDE, { passif: { type: 'etourdir', chance: 100, tours: 3 } })], { regles: { maxTours: 12, maxProlong: 0 } });
  const j = r2.journal.findIndex(e => e.k === 'transc');
  assert.ok(j > 0 && r2.journal.slice(j, j + 4).some(e => /a n'est plus étourdi/.test(e.txt || '')), 'étourdissement retiré');
});

test('solidification : bloque l\'étourdissement, une fracture la brise, la purification ne la retire pas', () => {
  const etourdit = { type: 'etourdir', chance: 100 };
  // magie : solidifié 3 tours, l'adversaire étourdit à chaque coup → aucun étourdissement
  const r1 = combat([C('a', 10, SOLIDE, { passif: etourdit })], [C('b', 10, SOLIDE), MAG('Roc', { type: 'solidification', chance: 100, tours: 3 })], { regles: { maxTours: 6, maxProlong: 0 } });
  const k1 = r1.journal.filter(e => ['solide', 'solide_bloque', 'etourdi'].includes(e.k)).map(e => e.k);
  assert.equal(k1[0], 'solide');
  assert.ok(k1.includes('solide_bloque'), 'étourdissement bloqué');
  assert.ok(k1.indexOf('etourdi') === -1 || k1.indexOf('etourdi') > k1.lastIndexOf('solide_bloque'), 'pas étourdi tant qu\'il est solidifié');
  // fracture : la solidification se brise, puis l'étourdissement passe
  const r2 = combat([C('a', 10, SOLIDE, { passif: { briques: [etourdit, { type: 'fracture', chance: 100, fchance: 0, degfrac: 0, tours: 2 }] } })],
    [C('b', 10, SOLIDE), MAG('Roc', { type: 'solidification', chance: 100, tours: 5 })], { regles: { maxTours: 6, maxProlong: 0 } });
  const k2 = r2.journal.filter(e => ['solide_bloque', 'solide_brise', 'etourdi'].includes(e.k)).map(e => e.k);
  assert.deepEqual(k2.slice(0, 3), ['solide_bloque', 'solide_brise', 'etourdi']);
  // passif : se solidifie à chacun de ses tours (100 %) → jamais étourdi
  const r3 = combat([C('a', 10, SOLIDE, { passif: etourdit })], [C('b', 10, SOLIDE, { passif: { type: 'solidification', chance: 100, tours: 1 } })], { regles: { maxTours: 6, maxProlong: 0 } });
  assert.equal(lignes(r3, e => e.k === 'etourdi').length, 0);
  // la purification ne retire pas la solidification
  const r4 = combat([C('a', 10, SOLIDE, { passif: etourdit })], [C('b', 10, SOLIDE), MAG('Roc', { briques: [{ type: 'solidification', chance: 100, tours: 3 }, { type: 'purification' }] })], { regles: { maxTours: 4, maxProlong: 0 } });
  assert.ok(lignes(r4, e => e.k === 'solide_bloque').length > 0);
});

test('« évite la mort » de la magie puis du piège : chaque protection sauve une fois', () => {
  const ange = MAG('Ange', { type: 'mort_evitee', cond: 'aucune' });
  const chance = PIE('Deuxième chance', { type: 'proprio_meurt' }, { type: 'mort_evitee' });
  const r = combat([C('Fort', 100, SOLIDE)], [C('Faible', 1, 50), ange, chance]);
  const sauve = lignes(r, e => e.t === 'protege' && /évite la mort/.test(e.txt));
  assert.equal(sauve.length, 2, 'la magie puis le piège doivent chacun éviter la mort');
  assert.match(sauve[1].txt, /piège/);
  assert.equal(r.gagnant, 0);   // la 3e attaque mortelle l'achève
});

test('malédiction : l\'ATQ baisse à chaque tour puis revient petit à petit', () => {
  const r = combat([C('Sorcière', 1, SOLIDE), MAG('Malé', { type: 'malediction', ciblem: 'adversaire', val: 3, tours: 3 })], [C('Cible', 20, SOLIDE)], { seed: 2, regles: { maxTours: 7, maxProlong: 0 } });
  const atqCible = lignes(r, e => e.c === 1 && e.t === 'stat').map(e => e.atq[1]);
  assert.deepEqual(atqCible.slice(0, 6), [17, 14, 11, 14, 17, 20]);
});

test('poison : mêmes dégâts à chaque tour, ne s\'additionne que s\'il est réappliqué', () => {
  let r = combat([C('A', 1, SOLIDE), MAG('Venin', { type: 'poison_effet', ciblem: 'adversaire', degtour: 4, tours: 3 })], [C('B', 1, SOLIDE)], { regles: { maxTours: 6, maxProlong: 0 } });
  assert.deepEqual(lignes(r, e => e.t === 'degats' && e.k === 'poison').map(e => e.n), [4, 4, 4]);
  r = combat([C('A', 1, SOLIDE, { passif: { type: 'poison', chance: 100, degtour: 3, tours: 3 } })], [C('B', 1, SOLIDE)], { seed: 2, regles: { maxTours: 4, maxProlong: 0 } });
  const P = lignes(r, e => e.t === 'degats' && e.k === 'poison').map(e => e.n);
  assert.deepEqual(P.slice(0, 3), [3, 6, 9], 'réappliqué à chaque coup : il se cumule');
});

test('poison, brûlure, saignement tombent en fin de tour de la carte touchée, après son attaque', () => {
  const r = combat([C('A', 1, SOLIDE), MAG('Venin', { type: 'poison_effet', ciblem: 'adversaire', degtour: 4, tours: 2 })], [C('B', 1, SOLIDE)], { seed: 1, regles: { maxTours: 3, maxProlong: 0 } });
  r.journal.forEach((e, i) => {
    if (e.t === 'degats' && e.k === 'poison') {
      const avant = r.journal.slice(0, i).reverse().find(x => x.t === 'attaque');
      assert.equal(avant.c, 1, "juste après l'attaque de la carte empoisonnée");
    }
  });
});

test('étourdissement : la purification ne le retire pas', () => {
  const r = combat([C('A', 1, SOLIDE), MAG('Choc', { type: 'etourdir_effet', ciblem: 'adversaire', tours: 1 })],
    [C('B', 1, SOLIDE, { passif: { type: 'purification' } }), MAG('Pure', { type: 'purification', cible: 'soi' })], { regles: { maxTours: 3, maxProlong: 0 } });
  assert.ok(lignes(r, e => /est étourdi, il n'attaque pas/.test(e.txt) && e.c === 1).length >= 1);
});

test('effet « perso » d\'étourdissement : la valeur saisie est la chance (≈ 50 %)', () => {
  const toile = PIE('Toile', { type: 'adv_attaque', coups: 1 }, { type: 'perso_a_une_chance_x_d_etourdir_la_cible', val: 50 });
  let ok = 0, n = 0;
  for (let seed = 1; seed <= 1500; seed++) {
    const r = combat([C('A', 1, SOLIDE)], [C('B', 1, SOLIDE), toile], { seed, regles: { maxTours: 1, maxProlong: 0 } });
    r.journal.forEach(e => { if (e.t === 'statut' && e.k === 'etourdi') { ok++; n++ } else if (/résiste à l'étourdissement/.test(e.txt)) n++ });
  }
  const p = ok / n;
  assert.ok(p > 0.44 && p < 0.56, `chance mesurée ${Math.round(p * 100)} %`);
});

test('passif « ATQ tous les X tours » : même ordre d\'effets que la carte joue en premier ou en deuxième', () => {
  const ryuukin = () => C('RYUUKIN', 10, SOLIDE, { passif: { type: 'atq_tours', tours: 1, val: 5 } });
  const seq = (r, c) => r.journal.filter(e => e.c === c && ['attaque', 'stat'].includes(e.t)).slice(0, 4).map(e => e.t);
  let vus = new Set();
  for (let seed = 1; seed < 20; seed++) {
    const r = combat([ryuukin()], [C('Mur', 1, SOLIDE)], { seed, regles: { maxTours: 3, maxProlong: 0 } });
    vus.add(JSON.stringify(seq(r, 0)));
  }
  assert.equal(vus.size, 1, 'une seule séquence possible');
  assert.deepEqual(JSON.parse([...vus][0]), ['attaque', 'stat', 'attaque', 'stat'], "l'ATQ augmente après son attaque");
});

// ================= Robustesse =================
test('robustesse : 2 000 combats aléatoires sans erreur, sans effet inconnu ni ATQ / PV négatifs', () => {
  const C2 = n => C(n, 12, 120, { ultime: { type: 'aleatoire', nbalea: 2, apres_tours: 2, utilisations: 3 }, passif: { briques: [{ type: 'aleatoire', chance: 40 }, { type: 'malediction', chance: 30, val: 2, tours: 2 }] } });
  const mg = MAG('M', { briques: [{ type: 'annule_magies', tours: 1 }, { type: 'aleatoire', nbalea: 2 }] });
  const pg = PIE('P', { type: 'adv_attaque', coups: 2 }, { briques: [{ type: 'reanimation', pctrev: 30 }, { type: 'voler', carte: 'magie' }, { type: 'aleatoire' }] }, 3);
  for (let seed = 1; seed <= 2000; seed++) {
    const r = combat([C2('a'), C2('a2'), mg, pg], [C2('b'), C2('b2'), mg, pg], { seed });
    for (const e of r.journal) {
      assert.notEqual(e.t, 'inconnu', `seed ${seed} : ${e.txt}`);
      assert.ok(e.atq.every(v => v >= 0) && e.pv.every(v => v >= 0), `seed ${seed}`);
    }
    assert.equal(r.journal.at(-1).t, 'fin');
  }
});

// ================= Les 3 copies du moteur =================
test('les 3 copies du moteur sont identiques (moteur-combat.js, combat.html, swift-responder.ts)', () => {
  const E = "})(typeof window!=='undefined'?window:globalThis);";
  const extrait = f => { const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n'); const a = s.indexOf('(function(g){\nconst '); return s.slice(a, s.indexOf(E, a) + E.length); };
  const ref = extrait('moteur-combat.js');
  assert.ok(ref.length > 1000);
  assert.equal(extrait('combat.html'), ref, 'combat.html diffère de moteur-combat.js');
  assert.equal(extrait('swift-responder.ts'), ref, 'swift-responder.ts diffère de moteur-combat.js');
});
