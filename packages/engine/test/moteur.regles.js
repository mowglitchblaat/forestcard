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

test('contre-piège : un piège « le piège adverse se déclenche » qui détruit le piège agit avant lui, le piège détruit ne fait rien', () => {
  const kus = PIE('Kusanagi', { type: 'adv_attaque', coups: 1 }, { briques: [{ type: 'degats', val: 10, cible: 'adversaire' }, { type: 'brulure_effet', val: 5, tours: 2, cible: 'adversaire' }] });
  const at = PIE('AT-001', { type: 'adv_piege' }, { type: 'detruire', carte: 'piege' });
  for (const seed of [1, 2, 3, 4]) {
    const r = combat([C('a', 5, SOLIDE), kus], [C('b', 5, SOLIDE), at], { seed, regles: { maxTours: 3, maxProlong: 0 } });
    const iK = r.journal.findIndex(e => e.t === 'piege' && e.c === 0);
    assert.ok(iK > 0, `seed ${seed} : le piège de A se déclenche`);
    assert.equal(r.journal[iK + 1].t, 'piege', `seed ${seed} : le contre-piège de B répond aussitôt`);
    assert.equal(r.journal[iK + 1].c, 1);
    assert.equal(lignes(r, e => e.k === 'piege_detruit').length, 1, `seed ${seed} : le piège de A est détruit`);
    assert.ok(!r.journal.some(e => /dégâts directs/.test(e.txt || '')), `seed ${seed} : pas de dégâts directs`);
    assert.ok(!r.journal.some(e => /brûle/.test(e.txt || '')), `seed ${seed} : pas de brûlure`);
  }
});

test('vol de magie au début du combat : la magie volée ne s\'active jamais chez la victime, quel que soit l\'ordre', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = combat([C('Marsupirage', 100, SOLIDE), MAG('Rage', { type: 'rage', ragev: 30, u: 'pct', ragetours: 3, fatval: 20, fattours: 2 })],
      [C('b', 10, SOLIDE), MAG('Corne de dragon', { type: 'voler', carte: 'magie' })], { seed, regles: { maxTours: 4, maxProlong: 0 } });
    const iV = r.journal.findIndex(e => e.k === 'vol_carte');
    assert.ok(iV > 0, 'volée');
    assert.ok(!r.journal.slice(iV).some(e => /Marsupirage entre en rage/.test(e.txt || '')), `seed ${seed} : pas de rage chez la victime après le vol`);
    assert.ok(r.journal.slice(iV).some(e => /b entre en rage/.test(e.txt || '')), `seed ${seed} : le voleur a la rage`);
  }
});

test('vol de magie : la victime perd tous les effets de sa magie (stats, marques, solidification, transcendance)', () => {
  const vol = PIE('Voleur', { type: 'adv_attaque', coups: 1 }, { type: 'voler', carte: 'magie' });
  for (const e of [{ type: 'atq_mod', cible: 'soi', val: 50 }, { type: 'execution_direct', nbmarques: 2 }, { type: 'solidification', chance: 100, tours: 9 }, { type: 'transcendance', tours: 3 }, { type: 'atk_poison', chance: 100, degtour: 7, tours: 3 }]) {
    const r = combat([C('a', 100, 1000), MAG('MagA', e)], [C('b', 10, SOLIDE), vol], { seed: 3, regles: { maxTours: 8, maxProlong: 0 } });
    const i = r.journal.findIndex(x => x.k === 'vol_carte');
    assert.ok(i > 0, e.type + ' : volée');
    assert.equal(r.journal[i].atq[0], 100, e.type + ' : ATQ de la victime revenue');
    const apres = r.journal.slice(i + 1);
    assert.ok(!apres.some(x => /^(a se solidifie|a TRANSCENDE|b reçoit une marque|L'attaque de a)/.test(x.txt || '')), e.type + ' : plus rien chez la victime');
    if (e.type === 'execution_direct') assert.ok(r.journal.slice(0, i).some(x => /b perd 2 marques/.test(x.txt || '')), 'marques retirées');
  }
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

test('piège de réanimation : caché jusqu\'à ce que la carte se brise, puis il se montre avant qu\'elle se reforme (brisée → piège → reformée)', () => {
  const phenix = PIE('Phénix', { type: 'proprio_meurt' }, { briques: [{ type: 'reanimation', pctrev: 50 }, { type: 'degats', val: 5 }] });
  const r = combat([C('A', 40, 100)], [C('B', 5, 60), phenix]);
  const ordre = r.journal.filter(e => ['reanim_mort', 'reanim', 'piege'].includes(e.t)).map(e => e.t);
  assert.deepEqual(ordre.slice(0, 3), ['reanim_mort', 'piege', 'reanim']);
  assert.ok(r.journal.some(e => /A subit 5 dégâts/.test(e.txt || '')), 'ses autres effets jouent après la réanimation');
});

test('piège de réanimation contré (détruit ou volé) : la carte ne se reforme pas, le piège ne fait rien', () => {
  const sauce = PIE('Sauce', { type: 'proprio_meurt' }, { briques: [{ type: 'rage', u: 'pts', ragev: 8, ragetours: 2, fatval: 7, fattours: 2 }, { type: 'reanimation', pctrev: 45 }] });
  for (const contre of [{ type: 'detruire', carte: 'piege' }, { type: 'voler', carte: 'piege', duree: 3 }]) {
    const r = combat([C('A', 40, SOLIDE), PIE('MTP', { type: 'adv_piege' }, contre)], [C('B', 5, 60), sauce], { regles: { maxTours: 10, maxProlong: 0 } });
    const iS = r.journal.findIndex(e => e.t === 'piege' && e.c === 1);
    assert.ok(iS > 0, contre.type + ' : la sauce se montre');
    assert.equal(r.journal[iS - 1].t, 'reanim_mort', contre.type + ' : sur la carte brisée');
    assert.equal(r.journal[iS + 1].t, 'piege', contre.type + ' : le contre-piège répond aussitôt');
    assert.ok(!r.journal.some(e => e.t === 'reanim'), contre.type + ' : pas de réanimation');
    assert.ok(!r.journal.some(e => /B entre en rage/.test(e.txt || '')), contre.type + ' : pas de rage');
    assert.equal(r.gagnant, 0, contre.type + ' : la carte reste détruite');
  }
});

test('piège de réanimation contré : une autre réanimation (passif, magie) ramène quand même la carte', () => {
  const sauce = PIE('Sauce', { type: 'proprio_meurt' }, { type: 'reanimation', pctrev: 45 });
  const r = combat([C('A', 40, SOLIDE), PIE('MTP', { type: 'adv_piege' }, { type: 'detruire', carte: 'piege' })],
    [C('B', 5, 60, { passif: { type: 'reanimation', pctrev: 20 } }), sauce], { regles: { maxTours: 3, maxProlong: 0 } });
  const re = r.journal.find(e => e.t === 'reanim');
  assert.ok(re, 'réanimée par son passif');
  assert.match(re.txt, /20 %/);
});

test('piège volé : il garde ses déclenchements, un piège déjà utilisé ne se redéclenche pas chez le voleur', () => {
  // B meurt : la sauce se montre, A la vole aussitôt (contre-piège) ; B revient par son passif, puis A meurt : la sauce, déjà utilisée, ne fait rien chez A
  const sauce = PIE('Sauce', { type: 'proprio_meurt' }, { type: 'reanimation', pctrev: 45 });
  const r = combat([C('A', 40, 100), PIE('MTP', { type: 'adv_piege' }, { type: 'voler', carte: 'piege', duree: 0 })],
    [C('B', 30, 60, { passif: { type: 'reanimation', pctrev: 100 } }), sauce], { regles: { maxTours: 30, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.k === 'vol_carte'), 'volée');
  assert.equal(r.journal.filter(e => e.t === 'piege' && e.c === 0).length, 1, 'chez A, seul MTP se déclenche');
  assert.ok(!r.journal.some(e => e.t === 'reanim' && e.c === 0), 'A ne se reforme pas');
  assert.equal(r.gagnant, 1);
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

test('valeurs en % : calculées sur la stat de la carte (fatigue I : 15 % de 300 ATQ = 45)', () => {
  const r1 = combat([C('a', 1, SOLIDE), MAG('Lourdeur', { type: 'fatigue', ciblem: 'adversaire', niveau: 1, fattours: 2 })], [C('b', 300, SOLIDE)]);
  assert.ok(lignes(r1, e => /ATQ de b −45 \(fatigue\)/.test(e.txt || '')).length > 0, 'fatigue I : 15 % de 300 = −45');
  const r2 = combat([C('a', 200, SOLIDE), MAG('Force', { type: 'atq_mod', cible: 'soi', val: 10, u: 'pct' })], [C('b', 1, SOLIDE)]);
  assert.ok(lignes(r2, e => /ATQ de a \+20/.test(e.txt || '')).length > 0, '+10 % de 200 = +20');
  const r3 = combat([C('a', 1, SOLIDE, { passif: { type: 'renvoi', val: 10, u: 'pct' } })], [C('b', 300, SOLIDE)]);
  assert.ok(lignes(r3, e => /b subit 30 dégâts renvoyés/.test(e.txt || '')).length > 0, 'renvoi 10 % de 300 = 30');
});

// ================= Statuts =================
// ================= Gel en 3 niveaux =================
const GEL = (x = {}) => ({ type: 'gel', chance: 100, annul: 25, eclat: 30, tours: 5, ...x });
test('gel : chaque gel monte d\'un niveau (givre, gelée, glaciation) ; au niveau 3, pas d\'attaque puis la glace éclate', () => {
  const r = combat([C('Golem', 10, SOLIDE, { passif: GEL() })], [C('b', 10, SOLIDE)], { regles: { maxTours: 6, maxProlong: 0 } });
  const niv = r.journal.filter(e => e.k === 'gel' && e.t === 'statut').map(e => e.n);
  assert.deepEqual(niv.slice(0, 3), [1, 2, 3], 'niveaux 1, 2, 3');
  const i3 = r.journal.findIndex(e => e.k === 'gel' && e.n === 3);
  const suite = r.journal.slice(i3 + 1);
  const iT = suite.findIndex(e => e.t === 'tour' && e.c === 1);
  assert.equal(suite[iT + 1].k, 'glaciation', 'à son tour suivant, la carte prise dans la glace n\'attaque pas');
  assert.equal(suite[iT + 2].k, 'eclat_glace', 'puis la glace éclate');
  assert.equal(suite[iT + 3].txt, 'b subit 30 dégâts (éclat de glace)');
  assert.equal(suite[iT + 4].t, 'finstatut', 'le gel est fini');
  assert.match(r.journal.find(e => e.k === 'gel' && e.n === 1).txt, /25 % d'attaque annulée, esquive −25 %/, 'niveau 1');
  assert.match(r.journal.find(e => e.k === 'gel' && e.n === 2).txt, /63 % d'attaque annulée, esquive −63 %/, 'niveau 2 : ×2,5');
});

test('gel : la carte gelée perd autant de points d\'esquive que sa chance d\'attaque annulée (×2,5 au niveau 2)', () => {
  // esquive 50 % : au niveau 2 d'un gel à 20 % (−50 points), elle n'esquive plus jamais
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = combat([C('Golem', 10, SOLIDE, { passif: GEL({ annul: 20, tours: 99 }) })], [C('b', 10, SOLIDE, { passif: { type: 'esquive', chance: 50 } })], { seed, regles: { maxTours: 10, maxProlong: 0 } });
    const i2 = r.journal.findIndex(e => e.k === 'gel' && e.n === 2);
    if (i2 < 0) continue;
    const i3 = r.journal.findIndex(e => e.k === 'gel' && e.n === 3);
    assert.ok(!r.journal.slice(i2, i3 < 0 ? undefined : i3).some(e => e.t === 'esquive' && e.c === 1), `seed ${seed} : plus d'esquive au niveau 2`);
  }
  // niveau 1 seulement (une magie gèle une fois au début) : esquive 60 % → 30 % avec un gel à 30 %
  const taux = (deckA) => { let att = 0, esq = 0; for (let seed = 1; seed <= 200; seed++) { const g = combat(deckA, [C('b', 1, SOLIDE, { passif: { type: 'esquive', chance: 60 } })], { seed, regles: { maxTours: 4, maxProlong: 0 } }); g.journal.forEach(e => { if (e.t === 'attaque' && e.c === 0) att++; if (e.t === 'esquive' && e.c === 1) esq++; }); } return esq / att; };
  const gele = taux([C('a', 1, SOLIDE), MAG('Givre', { type: 'gel', ciblem: 'adversaire', annul: 30, tours: 99 })]);
  const libre = taux([C('a', 1, SOLIDE)]);
  assert.ok(Math.abs(libre - 0.6) < 0.08 && Math.abs(gele - 0.3) < 0.08, `esquive ${Math.round(libre * 100)} % sans gel, ${Math.round(gele * 100)} % au niveau 1 (attendu 60 et 30)`);
});

test('brûlure : chaque dégât de brûlure calcine autant de PV max, pour de bon', () => {
  const r = combat([C('Feu', 5, SOLIDE, { passif: { type: 'brulure', chance: 100, niveau: 2, tours: 2 } })], [C('b', 5, 200)], { regles: { maxTours: 3, maxProlong: 0 } });
  const iB = r.journal.findIndex(e => e.txt === 'b subit 8 (brûlure)');
  assert.ok(iB > 0, 'tick de brûlure II : 4 % de 200');
  assert.equal(r.journal[iB + 1].txt, 'PV max de b −8 (calcination)');
  assert.equal(r.journal[iB + 1].k, 'calcine');
  const fin = r.journal.at(-1);
  assert.ok(fin.max[1] < 200, 'les PV max restent brûlés');
});

test('brûlure : la part calcinée est la même pour toutes les cartes (tableau des niveaux, 100 % par défaut)', () => {
  const brule = (x, niveaux) => combat([C('Feu', 5, SOLIDE, { passif: { type: 'brulure', chance: 100, niveau: 2, tours: 2, ...x } })], [C('b', 5, 200)], { regles: { maxTours: 3, maxProlong: 0, niveaux } });
  const moitie = brule({}, { calcination: 50 });
  const iB = moitie.journal.findIndex(e => e.txt === 'b subit 8 (brûlure)');
  assert.ok(iB > 0, 'tick de brûlure II : 4 % de 200');
  assert.equal(moitie.journal[iB + 1].txt, 'PV max de b −4 (calcination)', '50 % des 8 dégâts');
  const sans = brule({}, { calcination: 0 });
  assert.ok(sans.journal.some(e => e.txt === 'b subit 8 (brûlure)'), 'la brûlure brûle toujours');
  assert.ok(!sans.journal.some(e => e.k === 'calcine'), 'mais ne calcine rien');
  const ancien = brule({ calcine: 0 });
  assert.ok(ancien.journal.some(e => e.k === 'calcine'), 'le vieux réglage par carte (calcine) ne compte plus');
});

test('feu contre glace : brûler une carte gelée fait fondre la glace d\'un niveau, avec un choc thermique, et la brûlure ne reste pas', () => {
  const r = combat([C('Feu', 5, SOLIDE, { passif: { type: 'brulure', chance: 100, niveau: 2, tours: 2 } }), MAG('Givre', { type: 'gel', ciblem: 'adversaire', annul: 20, tours: 5 })], [C('b', 5, 200)], { regles: { maxTours: 2, maxProlong: 0 } });
  const iD = r.journal.findIndex(e => e.k === 'degel');
  assert.ok(iD > 0, 'la glace fond');
  assert.equal(r.journal[iD].n, 0, 'gel 1 → 0');
  assert.ok(r.journal.slice(iD, iD + 4).some(e => e.txt === 'b subit 8 dégâts (choc thermique)'), 'choc thermique : un tick de brûlure II');
  const iSuivant = r.journal.findIndex((e, i) => i > iD && e.t === 'attaque' && e.c === 0);
  assert.ok(!r.journal.slice(iD, iSuivant > 0 ? iSuivant : undefined).some(e => /b brûle/.test(e.txt || '')), 'la brûlure part avec la glace');
});

test('feu contre glace : geler une carte qui brûle éteint le feu, sans poser de gel', () => {
  const r = combat([C('Glace', 5, SOLIDE, { passif: GEL({ annul: 20, tours: 3 }) }), MAG('Torche', { type: 'brulure_effet', ciblem: 'adversaire', pctpv: 5, tours: 4 })], [C('b', 5, 200)], { regles: { maxTours: 2, maxProlong: 0 } });
  const iF = r.journal.findIndex(e => e.k === 'feu_eteint');
  assert.ok(iF > 0, 'le feu s\'éteint');
  assert.ok(!r.journal.slice(iF, iF + 3).some(e => e.k === 'gel' && e.t === 'statut'), 'pas de gel posé ce coup-là');
  assert.ok(r.journal.slice(iF).every(e => !/subit \d+ \(brûlure\)/.test(e.txt || '')) || r.journal.slice(iF).some(e => /brûle !/.test(e.txt || '')), 'plus de brûlure ensuite (sauf nouvelle brûlure)');
});

// ================= Le Glas =================
const GLAS = (x = {}) => ({ type: 'glas', chance: 100, glasv: 8, ...x });
test('Glas : l\'ombre avance au début de chaque tour de la carte ; ses PV sous l\'ombre, elle meurt sans évite la mort ni réanimation', () => {
  const r = combat([C('Faucheur', 8, SOLIDE, { passif: GLAS() })], [C('b', 8, 200, { passif: { briques: [{ type: 'evite_mort' }, { type: 'reanimation', pctrev: 50 }] } })], { regles: { maxTours: 12, maxProlong: 0 } });
  const iL = r.journal.findIndex(e => e.k === 'glas');
  assert.ok(iL > 0, 'le Glas sonne');
  const tB = r.journal.slice(iL).find(e => e.t === 'tour' && e.c === 1);
  const iT = r.journal.indexOf(tB);
  assert.equal(r.journal[iT + 1].k, 'glas_monte', 'l\'ombre avance au début de son tour, avant son attaque');
  const iM = r.journal.findIndex(e => e.k === 'glas_mort');
  assert.ok(iM > 0, 'le Glas a sonné');
  assert.ok(!r.journal.some(e => e.t === 'protege'), 'pas d\'évite la mort');
  assert.ok(!r.journal.some(e => e.t === 'reanim'), 'pas de réanimation');
  assert.ok(r.journal.some(e => e.k === 'glas_rea'), 'la réanimation est refusée');
  assert.equal(r.gagnant, 0);
});

test('Glas : relancé, il monte d\'un niveau (I, II, III : 5, 8 puis 12 % par tour), III au plus', () => {
  const r = combat([C('Faucheur', 8, SOLIDE, { passif: GLAS({ niveau: 1 }) })], [C('b', 8, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  const v = r.journal.filter(e => e.k === 'glas').map(e => e.v);
  assert.deepEqual(v.slice(0, 4), [5, 8, 12, 12]);
});

test('Glas : il faut 3 purifications pour l\'effacer ; chacune fait reculer l\'ombre d\'un tiers', () => {
  const r = combat([C('a', 1, SOLIDE), MAG('Sonnerie', { type: 'glas_effet', ciblem: 'adversaire', glasv: 9 })], [C('b', 1, SOLIDE, { passif: { type: 'purification', every: 2, fois: 9 } })], { regles: { maxTours: 10, maxProlong: 0 } });
  const recul = r.journal.filter(e => e.k === 'glas_recul');
  assert.deepEqual(recul.slice(0, 2).map(e => e.n), [2, 1], '2 crânes, puis 1');
  const i3 = r.journal.findIndex(e => e.t === 'finstatut' && e.k === 'glas');
  assert.ok(i3 > r.journal.indexOf(recul[1]), 'la 3e purification efface le Glas');
  const avant = [...r.journal.slice(0, r.journal.indexOf(recul[0]))].reverse().find(e => e.k === 'glas_monte');
  assert.equal(recul[0].s, Math.round(avant.s * 2 / 3 * 10) / 10, 'recul d\'un tiers');
});

test('échange ATQ/PV : les PV max deviennent les nouveaux PV (5 ATQ → 5/5 PV)', () => {
  const colosse = C('Colosse', 5, 100, { ultime: { type: 'echange_atq_def', ciblem: 'soi', apres_tours: 1, delai_tours: 0, utilisations: 1 } });
  const r = combat([colosse], [C('b', 1, SOLIDE)], { regles: { maxTours: 3, maxProlong: 0 } });
  const i = r.journal.findIndex(e => /ATQ et PV échangés/.test(e.txt || ''));
  assert.ok(i > 0, "l'échange a lieu");
  assert.equal(r.journal[i].pv[0], 5, 'ses PV deviennent son ancienne ATQ');
  const fin = r.journal.at(-1);
  assert.ok(fin.pv[0] <= 5, 'ses PV max ont suivi : ses PV ne remontent plus au-dessus de 5');
});

test('gel : une carte solidifiée ne dépasse pas le niveau 2', () => {
  const r = combat([C('Golem', 10, SOLIDE, { passif: GEL({ annul: 0, tours: 99 }) })], [C('b', 10, SOLIDE, { passif: { type: 'solidification', chance: 100, tours: 99 } })], { regles: { maxTours: 6, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.k === 'gel' && e.n === 2), 'niveau 2 atteint');
  assert.ok(!r.journal.some(e => e.k === 'gel' && e.n === 3), 'jamais de glaciation');
  assert.ok(r.journal.some(e => /solidifié : la glace ne peut pas le prendre/.test(e.txt || '')));
});

test('gel : une fracture sur une carte gelée fait éclater la glace tout de suite', () => {
  const r = combat([C('Golem', 10, SOLIDE, { passif: { briques: [GEL({ annul: 0 }), { type: 'fracture', chance: 100, fchance: 0, degfrac: 0, tours: 1 }] } })], [C('b', 10, SOLIDE)], { regles: { maxTours: 2, maxProlong: 0 } });
  const iE = r.journal.findIndex(e => e.k === 'eclat_glace');
  assert.ok(iE > 0, 'la glace éclate');
  assert.match(r.journal[iE].txt, /La fracture brise la glace de b/);
  assert.equal(r.journal[iE + 1].txt, 'b subit 30 dégâts (éclat de glace)');
});

test('gel : la purification retire le gel', () => {
  const purif = { type: 'purification', every: 1, fois: 9 };
  const r = combat([C('Golem', 10, SOLIDE, { passif: GEL({ annul: 0, tours: 99 }) })], [C('b', 10, SOLIDE, { passif: purif })], { regles: { maxTours: 6, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.k === 'gel' && e.n === 1), 'gelée');
  assert.ok(!r.journal.some(e => e.k === 'gel' && e.n === 3), 'purifiée avant la glaciation');
});

test('souffle élémentaire : dégâts puis le statut choisi (chaque élément)', () => {
  const att = { brulure: /brûle \(brûlure II : 4 %/, gel: /se couvre de givre \(gel 1\/3 : 12 %/, malediction: /maudit \(ATQ −3 pendant 2 tours/, poison: /empoisonné \(poison II : 8 dégâts/, saignement: /saigne \(saignement II : 5 %/, fatigue: /fatigué \(fatigue II : ATQ −\d+, soit 30 %/ };
  for (const [el, re] of Object.entries(att)) {
    const r = combat([C('a', 10, SOLIDE), MAG('Souffle', { type: 'souffle', val: 50, statut: el, chance: 100, niveau: 2, sval: 12, tours: 2 })], [C('b', 300, SOLIDE)], { regles: { maxTours: 2, maxProlong: 0 } });
    const i = r.journal.findIndex(e => e.t === 'souffle');
    assert.ok(i > 0 && r.journal[i].el === el, el + ' : souffle');
    assert.equal(r.journal[i + 1].txt, 'b subit 50 dégâts (souffle)');
    assert.match(r.journal[i + 2].txt, re, el + ' : statut appliqué');
  }
  const r0 = combat([C('a', 10, SOLIDE), MAG('Souffle', { type: 'souffle', val: 50, statut: 'poison', chance: 0, sval: 12 })], [C('b', 300, SOLIDE)], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.ok(lignes(r0, e => /résiste au souffle/.test(e.txt || '')).length === 1, '0 % : pas de statut');
});

test('exécution : 3 marques puis exécutée sous le seuil, même avec « évite la mort », réanimation possible', () => {
  // seuil 1 % (10 PV sur 1000) : à 50 PV le coup suivant est mortel → c'est ce coup qui exécute : « évite la mort » ne se déclenche pas
  const r = combat([C('a', 95, SOLIDE, { passif: { type: 'execution', chance: 100, seuilexec: 1 } })], [C('b', 1, 1000, { passif: { type: 'evite_mort' } })], { regles: { maxTours: 30, maxProlong: 0 } });
  const k = r.journal.filter(e => ['marque', 'protege', 'execution'].includes(e.k) || e.t === 'protege').map(e => e.k || e.t);
  assert.deepEqual(k.slice(0, 3), ['marque', 'marque', 'marque'], '3 marques au maximum');
  assert.equal(r.journal.filter(e => e.k === 'marque').length, 3);
  assert.ok(k.indexOf('execution') > 2, 'exécutée');
  assert.equal(k.indexOf('protege'), -1, 'la 3e marque arrive avec le coup : « évite la mort » ne se déclenche pas');
  const iX = r.journal.findIndex(e => e.k === 'execution');
  assert.equal(r.journal[iX - 1].t, 'attaque', 'l\'exécution EST le coup : rien ne passe entre l\'attaque et l\'exécution (ni soin, ni évite la mort)');
  // la 3e marque posée par le coup mortel exécute tout de suite
  const r3 = combat([C('a', 600, SOLIDE, { passif: { type: 'execution', chance: 100, seuilexec: 10 } })], [C('b', 1, 1000, { passif: { briques: [{ type: 'evite_mort' }, { type: 'soin_tour', val: 50, u: 'pct' }] } })], { regles: { maxTours: 30, maxProlong: 0 } });
  const k3 = r3.journal.filter(e => ['marque', 'execution'].includes(e.k) || e.t === 'protege').map(e => e.k || e.t);
  assert.ok(!k3.includes('protege'));assert.deepEqual(k3.slice(0, 4), ['marque', 'marque', 'marque', 'execution'], '3 marques puis exécution, sans jamais passer par « évite la mort »');
  assert.equal(r.gagnant, 0);
  // ultime / piège : marques posées directement ; la réanimation marche encore après une exécution
  const r2 = combat([C('a', 95, SOLIDE), MAG('Sentence', { type: 'execution_direct', nbmarques: 3 })], [C('b', 1, 1000, { passif: { type: 'reanimation', pctrev: 50 } })], { regles: { maxTours: 30, maxProlong: 0 } });
  const iE = r2.journal.findIndex(e => e.t === 'statut' && e.k === 'execution');
  assert.ok(iE > 0 && r2.journal.slice(iE).some(e => e.t === 'reanim'), 'réanimée après l\'exécution');
});

test('exécution : elle brise « évite la mort » ; après la réanimation, la carte n\'est plus protégée', () => {
  const deckB = [C('b', 1, 1000, { passif: { briques: [{ type: 'evite_mort' }, { type: 'reanimation', pctrev: 50 }] } })];
  const r = combat([C('a', 95, SOLIDE), MAG('Sentence', { type: 'execution_direct', nbmarques: 3 })], deckB, { regles: { maxTours: 30, maxProlong: 0 } });
  const iE = r.journal.findIndex(e => e.t === 'statut' && e.k === 'execution');
  assert.ok(iE > 0, 'exécutée');
  assert.equal(r.journal[iE + 1].k, 'protection_brisee', '« évite la mort » brisé par l\'exécution');
  assert.ok(r.journal.slice(iE).some(e => e.t === 'reanim'), 'réanimée');
  assert.equal(r.journal.filter(e => e.t === 'protege').length, 0, '« évite la mort » ne sauve plus la carte réanimée');
  assert.equal(r.gagnant, 0);
  // magie « évite la mort » : brisée elle aussi
  const ange = MAG('Ange', { type: 'mort_evitee', cond: 'aucune' });
  const r2 = combat([C('a', 95, SOLIDE, { passif: { type: 'execution', chance: 100, seuilexec: 1 } })], [C('b', 1, 1000, { passif: { type: 'reanimation', pctrev: 50 } }), ange], { regles: { maxTours: 40, maxProlong: 0 } });
  assert.ok(r2.journal.some(e => e.k === 'protection_brisee'));
  assert.equal(r2.journal.filter(e => e.t === 'protege').length, 0);
  // piège « évite la mort » : détruit par l'exécution, il ne sauve pas la carte réanimée
  const gardien = PIE('Gardien', { type: 'proprio_meurt' }, { type: 'mort_evitee', cond: 'aucune' });
  const r3 = combat([C('a', 95, SOLIDE, { passif: { type: 'execution', chance: 100, seuilexec: 1 } })], [C('b', 1, 1000, { passif: { type: 'reanimation', pctrev: 50 } }), gardien], { regles: { maxTours: 40, maxProlong: 0 } });
  const i3 = r3.journal.findIndex(e => e.k === 'protection_brisee');
  assert.ok(i3 > 0, 'protection brisée');
  assert.equal(r3.journal[i3 + 1].k, 'piege_detruit', 'le piège « évite la mort » est détruit');
  assert.equal(r3.journal.filter(e => e.t === 'protege').length, 0, 'il ne sauve plus la carte');
  assert.ok(r3.journal.some(e => e.t === 'reanim'), 'la réanimation a lieu');
  assert.equal(r3.journal[i3 + 1].tranche, 1, 'tranché par l\'exécution');
  // piège « évite la mort + réanimation » : tranché aussi, sa réanimation n'a pas lieu
  const phenix = PIE('Phénix', { type: 'proprio_meurt' }, { briques: [{ type: 'mort_evitee', cond: 'aucune' }, { type: 'reanimation', pctrev: 50 }] });
  const r4 = combat([C('a', 95, SOLIDE, { passif: { type: 'execution', chance: 100, seuilexec: 1 } })], [C('b', 1, 1000), phenix], { regles: { maxTours: 40, maxProlong: 0 } });
  const i4 = r4.journal.findIndex(e => e.k === 'protection_brisee');
  assert.ok(i4 > 0);
  assert.equal(r4.journal[i4 + 1].k, 'piege_detruit');
  assert.equal(r4.journal.filter(e => e.t === 'reanim' || e.t === 'protege').length, 0, 'ni évite la mort ni réanimation');
  assert.equal(r4.gagnant, 0);
});

test('exécution, statut marquant : chaque dégât du statut choisi peut poser une marque, jusqu\'à 3', () => {
  const saigne = { type: 'saignement', chance: 100, pctpv: 1, tours: 99 };
  const ulti = (x) => MAG('Sentence', { type: 'execution_direct', nbmarques: 1, ...x });
  const run = (x, passif = saigne) => combat([C('a', 1, SOLIDE, { passif }), ulti(x)], [C('b', 1, SOLIDE)], { regles: { maxTours: 12, maxProlong: 0 } });
  const marques = (r) => r.journal.filter(e => e.k === 'marque' && e.c === 1).length;
  // 100 % sur le saignement : la marque posée par la magie, puis chaque dégât de saignement en pose une, 3 au maximum
  const r = run({ statmarque: 'saignement', chancemarque: 100 });
  assert.equal(marques(r), 3);
  const i2 = r.journal.findIndex(e => e.k === 'marque' && e.n === 2);
  assert.equal(r.journal[i2 - 1].k, 'saignement', 'la marque vient juste après le dégât de saignement');
  // désactivé (aucun, 0 %, ou un autre statut) : seule la marque de la magie
  for (const x of [{}, { statmarque: 'aucun', chancemarque: 100 }, { statmarque: 'saignement', chancemarque: 0 }, { statmarque: 'brulure', chancemarque: 100 }])
    assert.equal(marques(run(x)), 1, JSON.stringify(x));
  // « tous » : le poison marque aussi
  assert.equal(marques(run({ statmarque: 'tous', chancemarque: 100 }, { type: 'poison', chance: 100, degtour: 1, tours: 99 })), 3);
  // sans statut marquant, le combat tire les mêmes nombres qu'avant (aucun tirage en plus)
  const sans = run({}), avec0 = run({ statmarque: 'saignement', chancemarque: 0 });
  assert.deepEqual(sans.journal.map(e => e.txt), avec0.journal.map(e => e.txt));
});

test('transcendance : au début de son 4e tour (avant d\'attaquer), purifiée (étourdissement compris), +15 % ATQ / PV max, et chaque coup purifie l\'adversaire', () => {
  const asc = MAG('Ascension', { type: 'transcendance' });
  // sans étourdissement : transcende au début de son 4e tour, avant l'attaque, bonus +15 %, puis ses coups purifient l'adversaire
  const r = combat([C('a', 100, SOLIDE), asc], [C('b', 10, SOLIDE), MAG('Venin', { type: 'poison_effet', ciblem: 'soi', degtour: 3, tours: 20 })], { regles: { maxTours: 12, maxProlong: 0 } });
  const iT = r.journal.findIndex(e => e.k === 'transc');
  assert.ok(iT > 0, 'transcende');
  assert.equal(r.journal.slice(0, iT).filter(e => e.t === 'attaque' && e.c === 0).length, 3, 'avant sa 4e attaque');
  const apres = r.journal.slice(iT);
  assert.ok(apres.some(e => e.txt === 'ATQ de a +15'), 'ATQ +15 %');
  assert.ok(apres.some(e => e.txt === `PV max de a +${Math.round(SOLIDE * .15)}`), 'PV max +15 %');
  assert.ok(apres.some(e => e.k === 'purif' && e.c === 1), 'un coup de a purifie l\'adversaire');
  // étourdie longtemps au moment de transcender : l'étourdissement est retiré
  const r2 = combat([C('a', 100, SOLIDE), asc], [C('b', 10, SOLIDE, { passif: { type: 'etourdir', chance: 100, tours: 3 } })], { regles: { maxTours: 12, maxProlong: 0 } });
  const j = r2.journal.findIndex(e => e.k === 'transc');
  assert.ok(j > 0 && r2.journal.slice(j, j + 4).some(e => /a n'est plus étourdi/.test(e.txt || '')), 'étourdissement retiré');
});

test('transcendance : 3 niveaux au début des tours X, 2X et 3X (avant l\'attaque), bonus à chaque niveau et vol de vie 10 / 20 / 30 %', () => {
  const asc = MAG('Ascension', { type: 'transcendance', tours: 2 });
  const r = combat([C('a', 100, SOLIDE), asc], [C('b', 10, SOLIDE)], { regles: { maxTours: 20, maxProlong: 0 } });
  const niv = r.journal.filter(e => e.k === 'transc');
  assert.deepEqual(niv.map(e => e.niv), [1, 2, 3], 'trois niveaux, pas plus');
  assert.deepEqual(auxAttaquesDeA(r, e => e.k === 'transc'), [1, 3, 5], 'avant ses 2e, 4e et 6e attaques');
  assert.equal(r.journal.filter(e => /^ATQ de a \+/.test(e.txt || '')).length, 3, 'bonus ATQ à chaque niveau');
  // vol de vie : aucun soin avant le niveau I, puis des soins sur ses attaques
  const i1 = r.journal.indexOf(niv[0]);
  assert.ok(!r.journal.slice(0, i1).some(e => e.t === 'soin' && e.c === 0), 'pas de vol de vie avant le niveau I');
  assert.ok(r.journal.slice(i1).some(e => e.t === 'soin' && e.c === 0), 'vol de vie après le niveau I');
  // réglages personnalisés
  const r2 = combat([C('a', 100, SOLIDE), MAG('X', { type: 'transcendance', tours: 1, vv1: 0, vv2: 0, vv3: 50 })], [C('b', 10, SOLIDE)], { regles: { maxTours: 12, maxProlong: 0 } });
  assert.ok(r2.journal.find(e => e.k === 'transc' && e.niv === 3).txt.includes('50 %'));
});

test('copie d\'ultime : la carte copie l\'ultime adverse, l\'adversaire le garde', () => {
  const r = combat([C('Morph', 10, SOLIDE, { ultime: { type: 'copie_ultime', apres_tours: 1, utilisations: 1 } })],
    [C('Dragon', 10, SOLIDE, { ultime: { type: 'degats', val: 100, apres_tours: 3, utilisations: 0 } })], { regles: { maxTours: 8, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.k === 'copie_ultime'), 'copie faite');
  const ult = r.journal.filter(e => e.t === 'ultime').map(e => e.txt);
  assert.ok(ult.some(x => /Dragon/.test(x)), 'le Dragon lance toujours son ultime');
  assert.ok(ult.filter(x => /Morph/.test(x)).length > 1, 'le Morph lance aussi la copie');
  assert.ok(lignes(r, e => /Morph subit 100/.test(e.txt || '')).length > 0 && lignes(r, e => /Dragon subit 100/.test(e.txt || '')).length > 0, 'les deux infligent les 100 dégâts');
  assert.equal(lignes(r, e => e.k === 'copie_ultime').length, 1, 'pas de double copie');
});

test('souffle : statut aléatoire à chaque souffle et souffles en chaîne', () => {
  const ult = { type: 'souffle', val: 5, statut: 'aleatoire', chance: 100, sval: 3, tours: 2, rechance: 100, remax: 4, apres_tours: 1, utilisations: 1 };
  const r = combat([C('Dragon', 10, SOLIDE, { ultime: ult })], [C('b', 10, SOLIDE)], { regles: { maxTours: 3, maxProlong: 0 } });
  const s = r.journal.filter(e => e.t === 'souffle');
  assert.equal(s.length, 5, '1 souffle + 4 en chaîne (100 %, max 4)');
  assert.ok(s.every(e => ['brulure', 'gel', 'malediction', 'poison', 'saignement', 'fatigue'].includes(e.el)), 'un statut valide à chaque souffle');
  assert.ok(new Set(s.map(e => e.el)).size > 1, 'les statuts varient');
  // sans les nouvelles options, le souffle reste unique et garde son statut
  const r2 = combat([C('Dragon', 10, SOLIDE, { ultime: { type: 'souffle', val: 5, statut: 'gel', chance: 100, sval: 3, tours: 2, apres_tours: 1, utilisations: 1 } })], [C('b', 10, SOLIDE)], { regles: { maxTours: 3, maxProlong: 0 } });
  const s2 = r2.journal.filter(e => e.t === 'souffle');
  assert.equal(s2.length, 1);
  assert.equal(s2[0].el, 'gel');
});

test('attaque annulée ≠ attaque bloquée : annulée = rien ne passe, bloquée = 0 dégât mais statuts et marques', () => {
  const atk = { passif: { briques: [{ type: 'saignement', chance: 100, pctpv: 5, tours: 3 }, { type: 'execution', chance: 100 }] } };
  const run = eff => combat([C('a', 50, SOLIDE, atk)], [C('b', 10, SOLIDE), MAG('M', eff)], { regles: { maxTours: 1, maxProlong: 0 } });
  // annulée : aucune frappe, aucun statut, aucune marque
  const r1 = run({ type: 'annule_attaque' });
  assert.ok(r1.journal.some(e => /est annulée$/.test(e.txt || '')));
  assert.ok(!r1.journal.some(e => /saigne|marque/.test(e.txt || '')), 'rien ne passe');
  // bloquée : 0 dégât, mais saignement et marque d'exécution
  const r2 = run({ type: 'bloque_attaque' });
  assert.ok(r2.journal.some(e => /est bloquée$/.test(e.txt || '')));
  assert.ok(!r2.journal.some(e => e.t === 'degats' && e.c === 1 && e.n > 0), 'aucun dégât sur b');
  assert.ok(r2.journal.some(e => /b saigne/.test(e.txt || '')), 'le statut passe');
  assert.ok(r2.journal.some(e => /marque/.test(e.txt || '')), 'la marque passe');
});

test('programmation : N passives d\'abord, puis l\'activation réveille les passifs et lance tous les ultimes programmés', () => {
  const prog = { type: 'programmation', chance: 100, nbpassif: 2, passifs: { type: 'soin_tour', val: 10, u: 'pts', lib: 'Soin' }, ultimes: { type: 'degats', val: 40, lib: 'Dégâts 40' } };
  const r = combat([C('Robot', 20, SOLIDE, { passif: prog })], [C('b', 20, SOLIDE)], { regles: { maxTours: 8, maxProlong: 0 } });
  const k = r.journal.filter(e => ['prog', 'prog_act'].includes(e.k)).map(e => e.k);
  assert.deepEqual(k.slice(0, 2), ['prog', 'prog'], 'les 2 premières sont passives');
  const iAct = r.journal.findIndex(e => e.k === 'prog_act');
  assert.ok(iAct > 0, 'une activation a lieu');
  assert.ok(!r.journal.slice(0, iAct).some(e => /subit 40/.test(e.txt || '') || (e.t === 'soin' && e.c === 0)), 'rien n\'agit avant l\'activation');
  const apres = r.journal.slice(iAct);
  const nbU = r.journal.slice(0, iAct).filter(e => e.k === 'prog' && e.quoi === 'u').length;
  if (nbU) assert.ok(apres.some(e => /ULTIME programmé/.test(e.txt || '')), 'les ultimes programmés se lancent');
  // une 2e activation relance les ultimes déjà programmés
  const acts = r.journal.map((e, i) => e.k === 'prog_act' ? i : -1).filter(i => i >= 0);
  if (acts.length > 1 && nbU) assert.ok(r.journal.slice(acts[1]).some(e => /ULTIME programmé/.test(e.txt || '')), 'relancés à chaque activation');
});

test('détonation : consume brûlure, poison et saignement (dégâts restants + bonus), moitié si solidifié, dégâts de zone', () => {
  const pose = MAG('Pose', { briques: [{ type: 'poison_effet', ciblem: 'adversaire', niveau: 2, tours: 3 }, { type: 'brulure_effet', ciblem: 'adversaire', niveau: 1, tours: 2 }] });
  const ult = { type: 'detonation', bonus: 50, val: 0, recul: 20, apres_tours: 1, utilisations: 1 };
  const r = combat([C('a', 0, 5000, { ultime: ult }), pose], [C('b', 0, 1000)], { regles: { maxTours: 1, maxProlong: 0 } });
  const i = r.journal.findIndex(e => e.t === 'detonation');
  assert.ok(i > 0, 'détonation');
  assert.deepEqual([...r.journal[i].parts].sort(), ['brulure', 'poison']);
  // b joue en premier : 1 TIK déjà passé → reste poison II 8 × 2 + brûlure I (2 % de 980 PV max, après calcination) 20 × 1 = 36, +50 % = 54
  assert.ok(r.journal.some(e => e.txt === 'b subit 54 dégâts (détonation)'), JSON.stringify(r.journal.filter(e => e.k === 'detonation').map(e => e.txt)));
  assert.ok(r.journal.some(e => e.txt === "a subit 11 dégâts (souffle de l'explosion)"), 'dégâts de zone 20 %');
  assert.ok(!r.journal.slice(i).some(e => /\((poison|brûlure)\)/.test(e.txt || '')), 'plus aucun TIK ensuite');
  // solidifié : moitié
  const r2 = combat([C('a', 0, 5000, { ultime: ult }), pose], [C('b', 0, 1000, { passif: { type: 'solidification', chance: 100, tours: 9 } })], { regles: { maxTours: 1, maxProlong: 0 } });
  assert.ok(r2.journal.some(e => /b subit 27 dégâts \(détonation\)/.test(e.txt || '')), JSON.stringify(r2.journal.filter(e => e.k === 'detonation').map(e => e.txt)));
});

test('détonation partielle : X % des dégâts restants, statuts purgés quand même + dégâts bruts jamais réduits', () => {
  const pose = MAG('Pose', { briques: [{ type: 'poison_effet', ciblem: 'adversaire', niveau: 2, tours: 3 }, { type: 'brulure_effet', ciblem: 'adversaire', niveau: 1, tours: 2 }] });
  const ult = { type: 'detonation', bonus: 50, val: 100, conso: 50, apres_tours: 1, utilisations: 1 };
  const r = combat([C('a', 0, 5000, { ultime: ult }), pose], [C('b', 0, 1000)], { regles: { maxTours: 3, maxProlong: 0 } });
  const i = r.journal.findIndex(e => e.t === 'detonation');
  assert.ok(i > 0, 'détonation');
  // reste poison II 8 × 2 + brûlure I 20 × 1 = 36 → moitié consumée : 18, +50 % = 27, + 100 bruts
  assert.ok(r.journal.some(e => /^b subit 127 dégâts \(détonation\)$/.test(e.txt || '')), JSON.stringify(r.journal.filter(e => e.k === 'detonation').map(e => e.txt)));
  assert.ok(!r.journal.slice(i).some(e => /\((poison|brûlure)\)/.test(e.txt || '')), 'les statuts sont purgés quand même');
  // solidifié : seuls les dégâts des statuts sont divisés par deux, pas les dégâts bruts
  const r2 = combat([C('a', 0, 5000, { ultime: ult }), pose], [C('b', 0, 1000, { passif: { type: 'solidification', chance: 100, tours: 9 } })], { regles: { maxTours: 1, maxProlong: 0 } });
  assert.ok(r2.journal.some(e => /^b subit 11[34] dégâts \(détonation\)$/.test(e.txt || '')), JSON.stringify(r2.journal.filter(e => e.k === 'detonation').map(e => e.txt)));
});

test('détonation : une carte tuée par l\'explosion ne se réanime pas (passif, magie ou piège)', () => {
  const ult = { type: 'detonation', val: 500, apres_tours: 1, utilisations: 1 };
  const r = combat([C('a', 0, 5000, { ultime: ult })], [C('b', 0, 100, { passif: { type: 'reanimation', pctrev: 50 } })], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.equal(lignes(r, e => e.t === 'reanim').length, 0, 'pas de réanimation');
  assert.ok(lignes(r, e => e.k === 'anti_rea').length === 1, 'annonce « pulvérisé »');
  assert.equal(r.gagnant, 0);
  // sans détonation, la même carte se réanime bien
  const r2 = combat([C('a', 0, 5000, { ultime: { type: 'degats', val: 500, apres_tours: 1, utilisations: 1 } })], [C('b', 0, 100, { passif: { type: 'reanimation', pctrev: 50 } })], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.equal(lignes(r2, e => e.t === 'reanim').length, 1);
});

test('missiles : chaque missile explose (dégâts bruts + détonation des statuts), puis pose son statut pour le suivant', () => {
  const ult = { type: 'missiles', frappes: 3, val: 20, bonus: 50, mstatut: 'brulure', niveau: 1, tours: 2, apres_tours: 1, utilisations: 1 };
  const r = combat([C('a', 0, 5000, { ultime: ult })], [C('b', 0, 1000)], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.equal(lignes(r, e => e.t === 'missile').length, 3);
  // n°1 : 20 bruts · n°2 et n°3 : brûlure I (2 % de 1000) 20 × 2 = 40, +50 % = 60, + 20 bruts = 80
  assert.deepEqual(lignes(r, e => /\(missile\)$/.test(e.txt || '')).map(e => e.n), [20, 80, 80]);
  assert.ok(r.journal.filter(e => e.t === 'detonation').every(e => e.mis === 1));
  // la cible meurt : la volée s'arrête, et pas de réanimation
  const r2 = combat([C('a', 0, 5000, { ultime: { ...ult, val: 200 } })], [C('b', 0, 300, { passif: { type: 'reanimation', pctrev: 50 } })], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.equal(lignes(r2, e => e.t === 'missile').length, 2);
  assert.equal(lignes(r2, e => e.t === 'reanim').length, 0);
});

test('souffle et missiles : esquivables, souffle réduit et renvoyé (dégâts seulement), missile renvoyé', () => {
  const souf = { type: 'souffle', val: 100, statut: 'poison', chance: 100, sval: 5, tours: 2, rechance: 100, remax: 6, apres_tours: 1, utilisations: 1 };
  const esq = combat([C('a', 0, 5000, { ultime: souf })], [C('b', 0, 5000, { passif: { type: 'esquive', chance: 100 } })], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.ok(lignes(esq, e => /esquive le souffle/.test(e.txt || '')).length > 0, 'souffle esquivé');
  const ren = combat([C('a', 0, 5000, { ultime: souf })], [C('b', 0, 5000, { passif: { briques: [{ type: 'renvoi', val: 50, u: 'pct' }, { type: 'reduc_degats', chance: 100, val: 20, u: 'pts' }] } })], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.ok(lignes(ren, e => e.txt === 'b subit 80 dégâts (souffle)').length > 0, 'souffle réduit de 20');
  assert.ok(lignes(ren, e => e.txt === 'a subit 40 dégâts renvoyés').length > 0, 'renvoi de 50 %');
  assert.ok(!lignes(ren, e => e.t === 'statut' && e.c === 0 && e.k === 'poison').length, 'le statut n\'est pas renvoyé');
  const mis = { type: 'missiles', frappes: 4, val: 100, recul: 50, apres_tours: 1, utilisations: 1 };
  const m1 = combat([C('a', 0, 5000, { ultime: mis })], [C('b', 0, 5000, { passif: { type: 'esquive', chance: 100 } })], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.ok(lignes(m1, e => e.k === 'missile_esq').length > 0, 'missile esquivé');
  const i = m1.journal.findIndex(e => e.k === 'missile_esq');
  assert.deepEqual(m1.journal.slice(i, i + 4).filter(e => e.t === 'degats').map(e => [e.c, e.n]), [[1, 50], [0, 50]], 'esquivé : le souffle de l\'explosion touche les deux');
  const m2 = combat([C('a', 0, 5000, { ultime: { ...mis, recul: 0 } })], [C('b', 0, 5000, { passif: { type: 'renvoi', val: 30, u: 'pct' } })], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.equal(lignes(m2, e => e.t === 'missile' && e.retour).length, 4);
  assert.equal(lignes(m2, e => e.txt === 'a subit 30 dégâts (missile renvoyé)').length, 4);
});

test('déclencheurs : ultime sur événement ou sous X % de PV, nouvelles conditions de piège, magie du début sans effet sur « une carte s\'active »', () => {
  const R = { regles: { maxTours: 6, maxProlong: 0 } }, ult = (x) => ({ type: 'degats', val: 1, utilisations: 1, ...x });
  const tourUlt = r => { const i = r.journal.findIndex(e => e.t === 'ultime' && e.c === 0); return i < 0 ? null : r.journal.slice(0, i).filter(e => e.t === 'tour').length; };
  // ultime « quand une carte s'active » + une magie : ne part plus au 1er tour
  const r0 = combat([C('a', 5, 500, { ultime: ult({ sur_carte: true }) }), MAG('M', { type: 'soin', val: 1 })], [C('b', 5, 500)], R);
  assert.equal(tourUlt(r0), null, 'la magie du début ne déclenche plus l\'ultime');
  // ultime quand il reçoit un statut : l'adversaire empoisonne à chaque coup
  const r1 = combat([C('a', 5, 500, { ultime: ult({ udecl: 'statut' }) })], [C('b', 5, 500, { passif: { type: 'poison', chance: 100, degtour: 2, tours: 2 } })], R);
  assert.ok(tourUlt(r1) !== null && tourUlt(r1) > 1, 'ultime après le 1er statut reçu');
  // ultime sous 50 % de PV
  const r2 = combat([C('a', 0, 100, { ultime: ult({ udecl: 'pv_sous', udx: 50 }) })], [C('b', 30, 500)], R);
  const i2 = r2.journal.findIndex(e => e.t === 'ultime');
  assert.ok(i2 > 0 && r2.journal[i2].pv[0] < 50, 'parti sous 50 %');
  // piège au tour 3 du combat
  const r3 = combat([C('a', 5, 500), PIE('T3', { type: 'tour_n', ntour: 3 }, { type: 'degats', val: 7 })], [C('b', 5, 500)], R);
  const i3 = r3.journal.findIndex(e => e.t === 'piege');
  assert.equal(r3.journal.slice(0, i3).filter(e => e.t === 'tour').length, 3);
  // piège quand le propriétaire esquive
  const r4 = combat([C('a', 5, 500, { passif: { type: 'esquive', chance: 75 } }), PIE('Contre', { type: 'proprio_esquive' }, { type: 'degats', val: 7 })], [C('b', 5, 500)], R);
  const i4 = r4.journal.findIndex(e => e.t === 'piege');
  assert.ok(i4 > 0 && r4.journal.slice(0, i4).some(e => e.t === 'esquive' && e.c === 0));
});

test('déclencheurs d\'ultime côté adversaire et nouveaux faits : soin, statut, coup infligé, ATQ et PV max qui baissent', () => {
  const R = { regles: { maxTours: 6, maxProlong: 0 } }, ult = (x) => ({ type: 'degats', val: 1, utilisations: 1, ...x });
  const part = r => r.journal.some(e => e.t === 'ultime' && e.c === 0);
  // l'adversaire se soigne chaque tour
  assert.ok(part(combat([C('a', 5, SOLIDE, { ultime: ult({ udecl: 'adv_soigne' }) })], [C('b', 5, SOLIDE, { passif: { type: 'soin_tour', u: 'pts', val: 10 } })], R)), 'adv_soigne');
  assert.ok(!part(combat([C('a', 5, SOLIDE, { ultime: ult({ udecl: 'adv_soigne' }) })], [C('b', 5, SOLIDE)], R)), 'adv_soigne : pas de soin, pas d\'ultime');
  // il empoisonne l'adversaire à chaque coup
  assert.ok(part(combat([C('a', 5, SOLIDE, { ultime: ult({ udecl: 'adv_statut' }), passif: { type: 'poison', chance: 100, degtour: 2, tours: 2 } })], [C('b', 5, SOLIDE)], R)), 'adv_statut');
  // il inflige au moins X en un coup
  assert.ok(part(combat([C('a', 30, SOLIDE, { ultime: ult({ udecl: 'inflige_coup_fort', udx: 20 }) })], [C('b', 5, SOLIDE)], R)), 'inflige_coup_fort atteint');
  assert.ok(!part(combat([C('a', 30, SOLIDE, { ultime: ult({ udecl: 'inflige_coup_fort', udx: 100 }) })], [C('b', 5, SOLIDE)], R)), 'inflige_coup_fort pas atteint');
  // l'adversaire le maudit : son ATQ baisse
  assert.ok(part(combat([C('a', 30, SOLIDE, { ultime: ult({ udecl: 'atq_baisse' }) })], [C('b', 5, SOLIDE, { passif: { type: 'malediction', chance: 100, val: 3, tours: 2 } })], R)), 'atq_baisse');
  // l'adversaire le brûle : la calcination baisse ses PV max
  assert.ok(part(combat([C('a', 5, SOLIDE, { ultime: ult({ udecl: 'pvmax_baisse' }) })], [C('b', 5, SOLIDE, { passif: { type: 'brulure', chance: 100, pctpv: 1, tours: 2 } })], R)), 'pvmax_baisse');
  assert.ok(!part(combat([C('a', 5, SOLIDE, { ultime: ult({ udecl: 'pvmax_baisse' }) })], [C('b', 5, SOLIDE, { passif: { type: 'brulure', chance: 100, niveau: 1, tours: 2 } })], { regles: { ...R.regles, niveaux: { calcination: 0 } } })), 'pvmax_baisse : brûlure sans calcination');
});

test('programmation sans liste : tire au hasard parmi tous les passifs et ultimes du jeu', () => {
  const r = combat([C('Robot', 20, SOLIDE, { passif: { type: 'programmation', chance: 100, nbpassif: 3 } })], [C('b', 20, SOLIDE)], { regles: { maxTours: 8, maxProlong: 0 } });
  const P = r.journal.filter(e => e.k === 'prog');
  assert.ok(P.length >= 3, 'des programmations ont lieu');
  assert.ok(P.every(e => !/rien à programmer/.test(e.txt)), 'toujours quelque chose à programmer');
  assert.ok(P.every(e => /« .+ »/.test(e.txt)), 'avec un nom lisible');
});

test('programmation en magie : donne le passif Programmation au combattant, une magie détruite le reprend', () => {
  const opt = { regles: { maxTours: 8, maxProlong: 0 } };
  const r = combat([C('Robot', 20, SOLIDE), MAG('Puce', { type: 'programmation', chance: 100, nbpassif: 3 })], [C('b', 20, SOLIDE)], opt);
  const P = r.journal.filter(e => e.k === 'prog' && e.c === 0);
  assert.ok(P.length >= 3, 'le combattant se programme grâce à la magie');
  assert.ok(P.every(e => /« .+ »/.test(e.txt)), 'avec un nom lisible');
  // magie détruite au début du combat : pas de programmation
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const d = combat([C('Robot', 20, SOLIDE), MAG('Puce', { type: 'programmation', chance: 100, nbpassif: 3 })], [C('b', 20, SOLIDE), MAG('Casse', { type: 'detruire', carte: 'magie' })], { seed, ...opt });
    const m = d.journal.filter(e => e.t === 'magie').map(e => e.carte);
    if (m[0] === 'Puce' && m.includes('Casse')) assert.equal(d.journal.filter(e => e.k === 'prog' && e.c === 0).length, 0, 'seed ' + seed + ' : magie détruite, plus de programmation');
  }
});

test('une magie détruite par la magie adverse (jouée avant elle) ne se joue pas', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = combat([C('a', 5, 500), MAG('Casse', { type: 'detruire', carte: 'magie' })], [C('b', 5, 500), MAG('Soin', { type: 'pv_mod', cible: 'soi', val: 50, u: 'pts' })], { seed, regles: { maxTours: 1, maxProlong: 0 } });
    const m = r.journal.filter(e => e.t === 'magie').map(e => e.carte);
    if (m[0] === 'Casse') assert.ok(!m.includes('Soin'), 'seed ' + seed + ' : la magie détruite ne doit pas se jouer');
  }
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

test('malédiction : −3 d\'ATQ fixe pendant ses tours (au début du tour de la carte maudite), puis tout revient', () => {
  const r = combat([C('Sorcière', 1, SOLIDE), MAG('Malé', { type: 'malediction', ciblem: 'adversaire', val: 9, tours: 3 })], [C('Cible', 20, SOLIDE)], { seed: 2, regles: { maxTours: 7, maxProlong: 0 } });
  const atqCible = lignes(r, e => e.c === 1 && e.t === 'stat').map(e => e.atq[1]);
  assert.deepEqual(atqCible, [17, 20], 'elle ne s\'aggrave pas d\'elle-même (la vieille valeur 9 ne compte plus)');
  // l'ATQ des attaques de la cible : 17 pendant 3 attaques, puis 20
  const coups = lignes(r, e => e.t === 'degats' && e.k === undefined && e.c === 0).map(e => e.n);
  assert.deepEqual(coups.slice(0, 4), [17, 17, 17, 20], JSON.stringify(coups));
});

test('malédiction : une autre malédiction ajoute ses −3, avec sa propre durée', () => {
  const malé = { type: 'malediction', chance: 100, tours: 2 };
  const r = combat([C('Sorcière', 1, SOLIDE, { passif: malé })], [C('Cible', 20, SOLIDE)], { seed: 1, regles: { maxTours: 4, maxProlong: 0 } });
  const atq = lignes(r, e => e.c === 1 && e.t === 'stat').map(e => e.atq[1]);
  assert.ok(atq.includes(14), 'deux malédictions en même temps : 20 − 3 − 3 = 14 (' + atq + ')');
  assert.ok(Math.min(...atq) >= 14, 'jamais plus de deux à la fois avec 2 tours (' + atq + ')');
});

test('poison : mêmes dégâts à chaque tour, ne monte de niveau que s\'il est réappliqué (I + I = II…, III au plus)', () => {
  let r = combat([C('A', 1, SOLIDE), MAG('Venin', { type: 'poison_effet', ciblem: 'adversaire', niveau: 1, tours: 3 })], [C('B', 1, SOLIDE)], { regles: { maxTours: 6, maxProlong: 0 } });
  assert.deepEqual(lignes(r, e => e.t === 'degats' && e.k === 'poison').map(e => e.n), [4, 4, 4]);
  r = combat([C('A', 1, SOLIDE, { passif: { type: 'poison', chance: 100, niveau: 1, tours: 3 } })], [C('B', 1, SOLIDE)], { seed: 2, regles: { maxTours: 4, maxProlong: 0 } });
  const P = lignes(r, e => e.t === 'degats' && e.k === 'poison').map(e => e.n);
  assert.deepEqual(P.slice(0, 4), [4, 8, 14, 14], 'réappliqué à chaque coup : il monte d\'un niveau, III au plus');
});

test('niveaux : I + II = III ; les valeurs viennent du tableau des niveaux (réglable), pas de la carte', () => {
  const pose = (niveaux) => combat([C('A', 1, SOLIDE), MAG('Venins', { briques: [{ type: 'poison_effet', ciblem: 'adversaire', niveau: 1, tours: 3 }, { type: 'poison_effet', ciblem: 'adversaire', niveau: 2, degtour: 99, tours: 3 }] })], [C('B', 1, SOLIDE)], { regles: { maxTours: 3, maxProlong: 0, niveaux } });
  assert.deepEqual(lignes(pose(), e => e.t === 'degats' && e.k === 'poison').map(e => e.n), [14, 14, 14], 'poison III, la vieille valeur 99 ne compte pas');
  assert.deepEqual(lignes(pose({ poison: [1, 2, 30] }), e => e.t === 'degats' && e.k === 'poison').map(e => e.n), [30, 30, 30], 'tableau réglé dans l\'admin');
});

test('niveaux : une carte sans niveau prend le niveau le plus proche de son ancienne valeur', () => {
  const tick = (passif) => lignes(combat([C('A', 1, SOLIDE, { passif: { chance: 100, tours: 1, ...passif } })], [C('B', 1, 1000)], { regles: { maxTours: 2, maxProlong: 0 } }), e => e.t === 'degats' && /\((poison|saignement|brûlure)\)/.test(e.txt || '')).map(e => e.n)[0];
  assert.equal(tick({ type: 'poison', degtour: 6 }), 4, 'poison 6 → I (4)');
  assert.equal(tick({ type: 'poison', degtour: 12 }), 14, 'poison 12 → III (14)');
  assert.equal(tick({ type: 'saignement', pctpv: 25, reducsoin: 80 }), 80, 'saignement 25 % → III (8 % de 1000)');
  assert.equal(tick({ type: 'brulure', pctpv: 6 }), 70, 'brûlure 6 % → III (7 % de 1000)');
});

test('fracture : chance et dégâts (% de sa propre ATQ) selon le niveau', () => {
  const r = combat([C('A', 1, SOLIDE, { passif: { type: 'fracture', chance: 100, niveau: 3, tours: 9 } })], [C('B', 100, SOLIDE)], { regles: { maxTours: 10, maxProlong: 0 } });
  const blessures = lignes(r, e => e.k === 'fracture' && e.t === 'degats').map(e => e.n);
  assert.ok(blessures.length > 0, 'elle se blesse');
  assert.ok(blessures.every(n => n === 30), 'fracture III : 30 % de 100 ATQ = 30 (' + blessures + ')');
  assert.ok(r.journal.some(e => /est fracturé \(fracture III : 50 % de se blesser en attaquant, 30 % de son ATQ/.test(e.txt || '')));
});

test('fatigue : niveaux additionnés, la perte d\'ATQ suit le niveau ; la rage laisse une fatigue selon son intensité', () => {
  const r = combat([C('A', 1, SOLIDE, { passif: { type: 'fatigue', chance: 100, niveau: 1, fattours: 5 } })], [C('B', 100, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  const atq = lignes(r, e => e.c === 1 && e.t === 'stat' && /fatigue\)$/.test(e.txt || '')).map(e => e.atq[1]);
  assert.deepEqual(atq.slice(0, 3), [85, 70, 50], 'I : −15 %, II : −30 %, III : −50 % de 100');
  const rage = (ragev, x = {}) => lignes(combat([C('A', 10, SOLIDE), MAG('Rage', { type: 'rage', u: 'pts', ragev, ragetours: 1, fattours: 2, ...x })], [C('B', 1, SOLIDE)], { regles: { maxTours: 3, maxProlong: 0 } }), e => /fatigué/.test(e.txt || ''))[0]?.txt || '';
  assert.match(rage(4), /fatigue I/, 'rage +4 → fatigue I');
  assert.match(rage(10), /fatigue II/, 'rage +10 → fatigue II');
  assert.match(rage(18), /fatigue III/, 'rage +18 → fatigue III');
  assert.match(rage(18, { fatniv: 1 }), /fatigue I /, 'niveau réglé sur la carte');
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

// ================= Vol de magie / de piège (durée, tour de déclenchement) =================
const tourDe = (r, e) => r.journal.slice(0, r.journal.indexOf(e)).filter(z => z.t === 'tour' && z.c === e.c).length;   // numéro du tour de la carte au moment de e
test('vol de magie pendant 2 tours : le voleur garde ses effets 2 de ses tours, puis la magie retourne à son propriétaire', () => {
  const r = combat([C('a', 10, SOLIDE), MAG('Larcin', { type: 'voler', carte: 'magie', duree: 2 })],
                   [C('b', 10, SOLIDE), MAG('Force', { type: 'atq_mod', cible: 'soi', val: 50 })], { regles: { maxTours: 6, maxProlong: 0 } });
  const vol = r.journal.find(e => e.k === 'vol_carte'), ret = r.journal.find(e => e.k === 'vol_retour');
  assert.ok(vol && ret, 'vol puis retour');
  assert.equal(vol.duree, 2);
  assert.equal(ret.ok, 1);
  assert.equal(ret.atq[0], 10, 'le voleur a perdu le bonus');
  assert.equal(ret.atq[1], 10, 'avant de rejouer, la magie est retirée au voleur');
  const apres = r.journal[r.journal.indexOf(ret) + 1];
  assert.equal(apres.atq[1], 60, 'la magie agit de nouveau pour son propriétaire');
  // retour à la fin du 2e tour du voleur
  const tours = r.journal.slice(0, r.journal.indexOf(ret)).filter(z => z.t === 'tour' && z.c === 0).length;
  assert.equal(tours, 2);
});
test('vol de magie sans durée : la carte reste volée jusqu\'à la fin du combat', () => {
  const r = combat([C('a', 10, SOLIDE), MAG('Larcin', { type: 'voler', carte: 'magie' })],
                   [C('b', 10, SOLIDE), MAG('Force', { type: 'atq_mod', cible: 'soi', val: 50 })], { regles: { maxTours: 6, maxProlong: 0 } });
  assert.ok(!r.journal.some(e => e.k === 'vol_retour'));
  assert.equal(r.journal.at(-1).atq[0], 60);
  assert.equal(r.journal.at(-1).atq[1], 10);
});
test('magie de vol au tour X : le vol a lieu au début du X-ième tour de la carte', () => {
  const r = combat([C('a', 10, SOLIDE), MAG('Larcin', { type: 'voler', carte: 'piege', tourdecl: 3 })],
                   [C('b', 10, SOLIDE), PIE('Mine', { type: 'proprio_meurt' }, { type: 'degats', val: 5 })], { regles: { maxTours: 6, maxProlong: 0 } });
  const vol = r.journal.find(e => e.k === 'vol_carte');
  assert.ok(vol);
  assert.equal(tourDe(r, vol), 3);
  assert.equal(vol.de, 'piege');
});
test('passif de vol : une seule fois, au tour choisi (1er tour si vide), puis retour après X tours', () => {
  const r = combat([C('a', 10, SOLIDE, { passif: { type: 'voler', carte: 'piege', tourdecl: 2, duree: 1 } })],
                   [C('b', 10, SOLIDE), PIE('Mine', { type: 'proprio_meurt' }, { type: 'degats', val: 5 })], { regles: { maxTours: 6, maxProlong: 0 } });
  const vols = r.journal.filter(e => e.k === 'vol_carte'), ret = r.journal.find(e => e.k === 'vol_retour');
  assert.equal(vols.length, 1, 'une seule fois');
  assert.equal(tourDe(r, vols[0]), 2);
  assert.ok(ret && ret.ok === 1 && ret.epuise === 0, 'le piège retourne actif');
  assert.equal(tourDe(r, ret), 2, 'gardé 1 tour : rendu à la fin de ce même tour');
  const r2 = combat([C('a', 10, SOLIDE, { passif: { type: 'voler', carte: 'piege' } })],
                    [C('b', 10, SOLIDE), PIE('Mine', { type: 'proprio_meurt' }, { type: 'degats', val: 5 })], { regles: { maxTours: 6, maxProlong: 0 } });
  assert.equal(tourDe(r2, r2.journal.find(e => e.k === 'vol_carte')), 1);
});
test('piège volé par un ultime pendant X tours : le voleur retrouve son propre piège, le propriétaire récupère le sien', () => {
  const r = combat([C('a', 10, SOLIDE, { ultime: { type: 'voler', carte: 'piege', duree: 2, apres_tours: 1, utilisations: 1 } }), PIE('Mien', { type: 'proprio_meurt' }, { type: 'degats', val: 1 })],
                   [C('b', 10, SOLIDE), PIE('Mine', { type: 'proprio_meurt' }, { type: 'degats', val: 5 })], { regles: { maxTours: 6, maxProlong: 0 } });
  const ret = r.journal.find(e => e.k === 'vol_retour');
  assert.ok(ret && ret.ok === 1);
  assert.equal(ret.reste.nom, 'Mien', 'le piège du voleur réapparaît à sa place');
});

// ================= Les 3 copies du moteur =================
test('deux pièges qui se déclenchent l\'un l\'autre : la chaîne s\'arrête (pas de boucle sans fin)', () => {
  const soin = (n) => PIE(n, { type: 'adv_soigne' }, { type: 'soin', val: 1 }, 9999);
  const r = combat([C('a', 4000, 1e6), soin('P1')], [C('b', 4000, 1e6), soin('P2'), MAG('Regen', { type: 'soin_tours', val: 1, tours: 9 })], { regles: { maxTours: 4, maxProlong: 0 } });
  assert.ok(lignes(r, e => e.t === 'piege').length < 50, 'nombre de pièges raisonnable');
});

// ================= Avalage =================
const AVAL = (x = {}) => ({ type: 'avalage', chance: 100, ratio: 3, pctmache: 10, machebase: 'max', tours: 3, repos: 2, ...x });
test('avalage : fourchette, couteau, puis avalage à la 3e attaque réussie', () => {
  const r = combat([C('Ogre', 10, 500, { passif: AVAL() })], [C('Lapin', 10, 300)], { seed: 2, regles: { maxTours: 10, maxProlong: 0 } });
  const k = r.journal.filter(e => e.k === 'av_marque' || e.k === 'avale').slice(0, 3).map(e => e.k + (e.n || ''));
  assert.deepEqual(k, ['av_marque1', 'av_marque2', 'avale']);
});
test('avalage : mâché 3 fois (10 % des PV max), recraché, puis la carte digère 2 tours', () => {
  const r = combat([C('Ogre', 10, 500, { passif: AVAL() })], [C('Lapin', 10, 300)], { seed: 2, regles: { maxTours: 10, maxProlong: 0 } });
  const i = r.journal.findIndex(e => e.k === 'avale'), j = r.journal.findIndex(e => e.k === 'recrache');
  const mache = r.journal.slice(i, j).filter(e => e.k === 'mache');
  assert.equal(mache.length, 3);
  assert.ok(mache.every(e => e.n === 30), 'chaque mâche : 10 % de 300');
  assert.ok(!r.journal.slice(i, j).some(e => e.t === 'attaque'), 'personne n\'attaque pendant l\'avalage');
  assert.equal(r.journal.slice(j).filter(e => e.k === 'digere').length >= 2, true, 'digestion de 2 tours');
});
test('avalage : l\'attaque qui avale ne fait pas de dégâts', () => {
  const r = combat([C('Ogre', 10, 500, { passif: AVAL() })], [C('Lapin', 10, 300)], { seed: 2, regles: { maxTours: 10, maxProlong: 0 } });
  const i = r.journal.findIndex(e => e.k === 'avale');
  let j = i; while (j > 0 && r.journal[j].t !== 'attaque') j--;
  assert.ok(!r.journal.slice(j, i).some(e => e.t === 'degats' && e.c === 1), 'aucun dégât sur le Lapin pendant l\'attaque qui avale');
});
test('avalage : pas assez de PV (3 × l\'ATQ de la cible) → les marques tombent', () => {
  const r = combat([C('Ogre', 10, 5000, { passif: AVAL({ ratio: 1000 }) })], [C('Lapin', 10, 5000)], { seed: 2, regles: { maxTours: 4, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.k === 'av_rate'));
  assert.ok(!r.journal.some(e => e.k === 'avale'));
});
test('avalage : les statuts négatifs de la cible passent à la carte qui avale (×1,5), une seule mâche puis recrachée', () => {
  const r = combat([C('Ogre', 10, 500, { passif: { briques: [AVAL(), { type: 'poison', chance: 100, degtour: 4, tours: 2 }] } })], [C('Lapin', 10, 300)], { seed: 2, regles: { maxTours: 6, maxProlong: 0 } });
  const i = r.journal.findIndex(e => e.k === 'av_transfert'), j = r.journal.findIndex(e => e.k === 'recrache');
  assert.ok(i > 0 && j > i);
  assert.equal(r.journal.slice(i, j).filter(e => e.k === 'mache').length, 1);
  assert.ok(r.journal.slice(i, j).some(e => /Ogre est empoisonné/.test(e.txt || '')));
});
test('avalage : la carte avalée ne reçoit rien, ce qui la visait touche la carte qui avale', () => {
  const r = combat([C('Ogre', 10, 500, { passif: AVAL() })], [C('Lapin', 10, 300, { ultime: { type: 'degats', val: 9, apres_tours: 4 } })], { seed: 2, regles: { maxTours: 6, maxProlong: 0 } });
  const i = r.journal.findIndex(e => e.k === 'avale'), j = r.journal.findIndex(e => e.k === 'recrache');
  assert.ok(r.journal.slice(i, j).some(e => /Ogre subit 9 dégâts directs/.test(e.txt || '')));
});

// ================= Blocage avec riposte =================
const MUR = (x = {}) => MAG('Mur', { type: 'bloque_attaque', ...x });
test('blocage + riposte renvoi : X % des dégâts bloqués repartent sur l\'attaquant, une seule fois', () => {
  const r = combat([C('Bloqueur', 10, SOLIDE), MUR({ riposte: 'renvoi', pctriposte: 50 })], [C('Frappeur', 30, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  const rip = lignes(r, e => e.k === 'riposte');
  assert.equal(rip.length, 1);
  assert.ok(r.journal.some(e => /Frappeur subit 15 dégâts renvoyés/.test(e.txt || '')));
});
test('blocage + riposte statut : l\'attaquant reçoit le statut choisi au moment du blocage', () => {
  const r = combat([C('Bloqueur', 10, SOLIDE), MUR({ riposte: 'statut', rstatut: 'poison', sval: 5, tours: 3 })], [C('Frappeur', 30, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  const i = r.journal.findIndex(e => e.k === 'riposte');
  assert.ok(i > 0 && r.journal[i - 1].t === 'bloque');
  assert.ok(/Frappeur est empoisonné/.test(r.journal[i + 1].txt || ''));
});
test('blocage limité : seuls les X premiers coups sont bloqués, la riposte part au 1er', () => {
  const r = combat([C('Bloqueur', 10, SOLIDE), MUR({ nbbloque: 1, riposte: 'statut', rstatut: 'etourdi', tours: 1 })], [C('Frappeur', 30, SOLIDE, { passif: { type: 'multi_frappe', chance: 100, frappes: 3 } })], { regles: { maxTours: 4, maxProlong: 0 } });
  const a = r.journal.findIndex(e => e.t === 'attaque' && e.c === 1);
  const fin = r.journal.findIndex((e, k) => k > a && e.t === 'tour');
  const att = r.journal.slice(a, fin);
  assert.equal(att.filter(e => e.t === 'bloque').length, 1);
  assert.equal(att.filter(e => e.t === 'degats' && e.c === 0).length, 2);
  assert.equal(att.filter(e => e.k === 'riposte').length, 1);
});
test('blocage sans option : toute l\'attaque est bloquée, aucune riposte', () => {
  const r = combat([C('Bloqueur', 10, SOLIDE), MUR()], [C('Frappeur', 30, SOLIDE, { passif: { type: 'multi_frappe', chance: 100, frappes: 3 } })], { regles: { maxTours: 4, maxProlong: 0 } });
  assert.equal(lignes(r, e => e.t === 'bloque').length, 3);
  assert.ok(!r.journal.some(e => e.k === 'riposte'));
});

test('les 3 copies du moteur sont identiques (moteur-combat.js, combat.html, swift-responder.ts)', () => {
  const E = "})(typeof window!=='undefined'?window:globalThis);";
  const extrait = f => { const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n'); const a = s.indexOf('(function(g){\nconst '); return s.slice(a, s.indexOf(E, a) + E.length); };
  const ref = extrait('moteur-combat.js');
  assert.ok(ref.length > 1000);
  assert.equal(extrait('combat.html'), ref, 'combat.html diffère de moteur-combat.js');
  assert.equal(extrait('swift-responder.ts'), ref, 'swift-responder.ts diffère de moteur-combat.js');
});

// ================= Combat en relais (championnat, ceintures) =================
// 3 combattants chacun ; à chaque entrée un nouveau trio (combattant + magie + piège) ; une carte déjà jouée n'est pas retirée ;
// le survivant garde PV et statuts ; le nouveau combattant joue en premier ; pas de limite de tours.
const relais = (deckA, deckB, opt = {}) => M.simulerRelais({ pseudo: 'A', deck: deckA }, { pseudo: 'B', deck: deckB }, { seed: 1, ...opt });
const entrees = r => r.journal.filter(e => e.t === 'relais');

test('relais : 3 combattants chacun, celui qui a encore un combattant debout gagne', () => {
  const r = relais([C('A1', 100, 100), C('A2', 100, 100), C('A3', 100, 100)], [C('B1', 1, 100), C('B2', 1, 100), C('B3', 1, 100)]);
  assert.equal(r.gagnant, 0);
  assert.equal(r.journal[0].equipe, 3);
  const e = entrees(r).filter(x => x.c === 1);
  assert.deepEqual(e.map(x => x.n), [2, 3]);
  assert.equal(new Set([r.journal[0].joueurs[1].carte, ...e.map(x => x.joueurs[1].carte)]).size, 3, 'un combattant déjà joué ne revient pas');
});

test('relais : pas de limite de tours, le combat va jusqu\'au KO', () => {
  const r = relais([C('A1', 1, 300)], [C('B1', 1, 300)], { regles: { maxTours: 2, maxProlong: 0, equipe: 1 } });
  assert.notEqual(r.gagnant, null);
  assert.ok(r.journal.filter(e => e.t === 'tour').length > 10);
});

test('relais : le survivant garde ses PV, le nouveau combattant joue en premier', () => {
  const r = relais([C('A1', 60, 1000), C('A2', 60, 1000), C('A3', 60, 1000)], [C('B1', 10, 100), C('B2', 10, 100), C('B3', 10, 100)]);
  const i = r.journal.findIndex(e => e.t === 'relais');
  assert.ok(i > 0);
  assert.equal(r.journal[i].c, 1);
  const avant = r.journal[i].pv[0];
  assert.ok(avant < 1000, 'A a pris des coups pendant le premier duel');
  const t = r.journal.slice(i).find(e => e.t === 'tour');
  assert.equal(t.c, 1, 'le nouveau combattant ouvre le duel');
});

// Les tours de jeu d'un camp : pour chaque ligne « tour » de c, les lignes jusqu'au tour suivant.
const toursDe = (r, c) => r.journal.map((e, i) => [e, i]).filter(([e]) => e.t === 'tour' && e.c === c)
  .map(([, i]) => { const j = r.journal.findIndex((e, k) => k > i && e.t === 'tour'); return r.journal.slice(i, j < 0 ? undefined : j); });

test('relais : le suivant entre tout de suite, puis celui qui a mis KO finit son tour (soin de chaque tour)', () => {
  const r = relais([C('A1', 100, 1000, { passif: { type: 'soin_tour', u: 'pts', val: 10 } })], [C('B1', 20, 50), C('B2', 20, 50), C('B3', 20, 50)]);
  const ko = toursDe(r, 0).filter(t => t.some(e => e.t === 'relais' && e.c === 1));
  assert.equal(ko.length, 2);
  for (const t of ko) {
    const i = t.findIndex(e => e.t === 'relais');
    assert.ok(t.slice(i).some(e => e.t === 'soin' && e.c === 0), 'A1 se soigne après l\'entrée du suivant, dans le même tour');
  }
});

test('relais : les coups restants d\'une attaque frappent le combattant qui vient d\'entrer', () => {
  const r = relais([C('A1', 100, 1000, { passif: { type: 'multi_frappe', chance: 100, frappes: 3 } })], [C('B1', 1, 50), C('B2', 1, 50), C('B3', 1, 50)]);
  assert.equal(r.gagnant, 0);
  const t = toursDe(r, 0)[0];
  assert.equal(t.filter(e => e.t === 'relais' && e.c === 1).length, 2, 'une seule attaque de 3 coups met KO les trois');
  const i = t.findIndex(e => e.t === 'relais');
  assert.ok(t.slice(i).some(e => e.t === 'degats' && e.c === 1), 'le coup suivant frappe le nouveau');
});

test('relais : la suite d\'une salve de missiles s\'abat sur le combattant qui vient d\'entrer', () => {
  const ult = { type: 'missiles', frappes: 4, val: 100, apres_tours: 1, utilisations: 1 };
  const r = relais([C('A1', 0, 1000, { ultime: ult })], [C('B1', 0, 50), C('B2', 0, 50), C('B3', 0, 50)]);
  assert.equal(r.gagnant, 0);
  const t = toursDe(r, 0).find(x => x.some(e => e.t === 'relais' && e.c === 1));
  assert.ok(t, 'la salve met KO pendant le tour de A1');
  assert.equal(t.filter(e => e.t === 'relais' && e.c === 1).length, 2, 'une salve : les trois tombent l\'un après l\'autre');
  const i = t.map(e => e.t === 'relais').lastIndexOf(true);
  assert.ok(t.slice(i).some(e => e.t === 'degats' && e.c === 1), 'B3 prend les missiles restants');
});

test('relais : une magie déjà jouée n\'est pas retirée au combattant suivant', () => {
  const m = n => MAG(n, { type: 'atq_mod', val: 1, cible: 'soi' });
  const r = relais([C('A1', 100, 100), C('A2', 100, 100), C('A3', 100, 100), m('M1'), m('M2'), m('M3')], [C('B1', 1, 100), C('B2', 1, 100), C('B3', 1, 100)]);
  const noms = r.journal.filter(e => e.t === 'magie' && e.c === 0).map(e => e.txt);
  assert.equal(noms.length, 1, 'A garde son premier combattant : sa magie n\'est révélée qu\'une fois');
});

// ================= Sources d'un même effet d'attaque =================
test('cumul : un passif et une magie qui donnent le même effet à l\'attaque additionnent leurs chances (un seul tirage)', () => {
  const poison = { type: 'poison', chance: 50, degtour: 1, tours: 1 };
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = combat([C('A', 1, SOLIDE, { passif: poison }), MAG('Venin', { type: 'atk_poison', chance: 50, degtour: 1, tours: 1 })],
      [C('B', 0, SOLIDE)], { seed, regles: { maxTours: 12, maxProlong: 0 } });
    const attaques = auxAttaquesDeA(r, e => e.t === 'attaque' && e.c === 0);
    const poses = auxAttaquesDeA(r, e => e.t === 'statut' && e.k === 'poison' && e.c === 1);
    assert.ok(attaques.length > 3);
    assert.deepEqual(poses, attaques, '50 % + 50 % = 100 % : chaque attaque empoisonne, une seule fois');
  }
});

// ================= Headshot, ciblage, brume, lien parasitaire, mutation, mue, réaction =================

const degatsAttaque = (r, c) => r.journal.filter(e => e.t === 'degats' && e.c === c && !e.k);

test('headshot : à 100 %, chaque coup ajoute X % de l\'ATQ (50 % par défaut), avant les réductions', () => {
  const r = combat([C('Sniper', 10, SOLIDE, { passif: { type: 'headshot', chance: 100 } })], [C('Cible', 0, SOLIDE)], { regles: { maxTours: 3, maxProlong: 0 } });
  const hs = lignes(r, e => e.k === 'headshot');
  assert.ok(hs.length >= 3);
  assert.ok(hs.every(e => e.n === 5 && e.c === 0 && e.cible === 1));
  assert.ok(degatsAttaque(r, 1).every(e => e.n === 15));
});

test('headshot : à 0 %, aucun coup critique', () => {
  const r = combat([C('Sniper', 10, SOLIDE, { passif: { type: 'headshot', chance: 0, pctcrit: 100 } })], [C('Cible', 0, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  assert.equal(lignes(r, e => e.k === 'headshot').length, 0);
  assert.ok(degatsAttaque(r, 1).every(e => e.n === 10));
});

test('ciblage : la cible verrouillée prend un headshot à chaque coup, et la marque saute au premier (par défaut)', () => {
  const ult = (x = {}) => ({ type: 'ciblage', tours: 3, pctcrit: 100, apres_tours: 1, utilisations: 1, ...x });
  const r = combat([C('Chasseur', 10, SOLIDE, { ultime: ult() })], [C('Proie', 0, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  assert.equal(lignes(r, e => e.k === 'cible' && e.t === 'statut').length, 1);
  const hs = lignes(r, e => e.k === 'headshot');
  assert.equal(hs.length, 1, 'la marque saute au premier headshot');
  assert.equal(hs[0].n, 5, 'puissance critique commune : 50 % de 10 (la vieille puissance de la carte ne compte plus)');
  const r2 = combat([C('Chasseur', 10, SOLIDE, { ultime: ult({ consomme: 'non' }) })], [C('Proie', 0, SOLIDE)], { regles: { maxTours: 6, maxProlong: 0 } });
  assert.equal(lignes(r2, e => e.k === 'headshot').length, 3, 'consomme non : un headshot par tour de ciblage');
  assert.ok(lignes(r2, e => e.t === 'finstatut' && e.k === 'cible').length === 1);
});

test('brume niveau 1 : les statuts négatifs sont dissipés', () => {
  const r = combat([C('Brumeux', 0, SOLIDE, { ultime: { type: 'brume', tours: 50, apres_tours: 1, utilisations: 1 } })],
    [C('Venin', 1, SOLIDE, { passif: { type: 'poison', chance: 100, degtour: 3, tours: 2 } })], { regles: { maxTours: 5, maxProlong: 0 } });
  const brume = r.journal.findIndex(e => e.k === 'brume' && e.t === 'statut');
  assert.ok(brume >= 0);
  assert.ok(lignes(r, e => e.k === 'brume_bloque').length > 0);
  assert.ok(!r.journal.slice(brume).some(e => e.t === 'statut' && e.k === 'poison' && e.c === 0), 'aucun poison après la brume');
});

test('brume niveau 2 (vent tourné) : brume relancée, le statut suivant est renvoyé puis la brume se dissipe', () => {
  const r = combat([C('Brumeux', 0, SOLIDE, { ultime: { type: 'brume', tours: 50, apres_tours: 1, utilisations: 2, delai_tours: 0 } })],
    [C('Venin', 1, SOLIDE, { passif: { type: 'poison', chance: 100, degtour: 3, tours: 2 } })], { regles: { maxTours: 6, maxProlong: 0 } });
  const montee = r.journal.findIndex(e => e.k === 'brume' && e.n === 2);
  assert.ok(montee >= 0, 'la brume passe au niveau 2');
  const renvoi = r.journal.findIndex((e, k) => k > montee && e.k === 'brume_renvoi');
  assert.ok(renvoi > montee);
  assert.equal(r.journal[renvoi + 1].t, 'finstatut');
  assert.ok(r.journal.slice(renvoi).some(e => e.t === 'statut' && e.k === 'poison' && e.c === 1), 'le poison est renvoyé à Venin');
});

test('lien parasitaire : le porteur partage X % de ses soins avec l\'adversaire', () => {
  const r = combat([C('Tique', 0, 1000, { ultime: { type: 'lien_parasite', tours: 5, pctlien: 50, apres_tours: 1, utilisations: 1 } }), MAG('Saignée', { type: 'degats', val: 500 })],
    [C('Hôte', 0, 1000, { passif: { type: 'soin_tour', val: 20 } })], { regles: { maxTours: 4, maxProlong: 0 } });
  const fed = lignes(r, e => e.k === 'lien_soin');
  assert.ok(fed.length > 0);
  assert.ok(fed.every(e => e.c === 1 && e.to === 0 && e.n === 10));
  const k = r.journal.indexOf(fed[0]);
  assert.deepEqual([r.journal[k - 1].t, r.journal[k - 1].c, r.journal[k - 1].n], ['soin', 1, 10], 'l\'hôte ne garde que la moitié');
});

test('mutation : +1 niveau à chaque statut reçu (3 max), niveau I = ATQ et PV en plus, niveau III = mue', () => {
  const mut = { type: 'mutation', matq: 5, mpv: 50, mreduc: 20, mesq: 10, lientours: 2 };
  const r = combat([C('Cafard', 10, SOLIDE, { passif: mut })],
    [C('Venin', 1, SOLIDE, { passif: { type: 'poison', chance: 100, degtour: 1, tours: 1 } })], { regles: { maxTours: 5, maxProlong: 0 } });
  const niv = lignes(r, e => e.k === 'mutation').map(e => e.niv);
  assert.deepEqual(niv, [1, 2, 3]);
  const i1 = r.journal.findIndex(e => e.k === 'mutation');
  assert.equal(r.journal[i1 + 1].atq[0], 15);
  assert.ok(lignes(r, e => e.k === 'mue').length === 1, 'niveau III : mue instantanée');
  assert.ok(lignes(r, e => e.k === 'lien' && e.t === 'statut' && e.c === 1).length === 1, 'niveau III : lien sur l\'adversaire');
});

test('mutation : 4 tours de suite sans statut font aussi monter d\'un niveau', () => {
  const r = combat([C('Cafard', 10, SOLIDE, { passif: { type: 'mutation', matq: 5 } })], [C('Calme', 1, SOLIDE)], { regles: { maxTours: 9, maxProlong: 0 } });
  const niv = lignes(r, e => e.k === 'mutation');
  assert.deepEqual(niv.map(e => e.niv), [1, 2]);
});

test('mue : 2 tours de suite avec un statut lancent la mue, 2 tours plus tard la carte mue (marques et statuts retirés, ATQ et PV perdus)', () => {
  const r = combat([C('Mante', 20, 1000, { passif: { type: 'mue', mueatq: 5, uatq: 'pts', muepv: 100, upv: 'pts' } })],
    [C('Bourreau', 1, SOLIDE, { passif: { briques: [{ type: 'execution', chance: 100 }, { type: 'poison', chance: 100, degtour: 1, tours: 3 }] } })], { regles: { maxTours: 5, maxProlong: 0 } });
  const marque = r.journal.findIndex(e => e.k === 'marque' && e.c === 0);
  const debut = r.journal.findIndex(e => e.k === 'mue_debut');
  const mue = r.journal.findIndex(e => e.k === 'mue');
  assert.ok(marque >= 0 && debut > marque && mue > debut);
  const apres = r.journal.slice(mue, mue + 8);
  assert.ok(apres.some(e => e.t === 'finstatut' && e.k === 'marque' && e.n === 0));
  assert.ok(apres.some(e => e.k === 'mod' && e.d === -5));
  assert.ok(apres.some(e => e.k === 'mod' && e.d === -100));
});

test('mue : une marque d\'exécution seule ne lance pas la mue (ce n\'est pas un statut)', () => {
  const r = combat([C('Mante', 20, 1000, { passif: { type: 'mue' } })], [C('Bourreau', 1, SOLIDE, { passif: { type: 'execution', chance: 100 } })], { regles: { maxTours: 6, maxProlong: 0 } });
  assert.ok(lignes(r, e => e.k === 'marque').length > 0);
  assert.equal(lignes(r, e => e.k === 'mue_debut' || e.k === 'mue').length, 0);
});

test('réaction : quand la carte subit des dégâts, la stat choisie monte, jusqu\'au plafond', () => {
  const r = combat([C('Hérisson', 1, SOLIDE, { passif: { type: 'reaction', quand: 'degats', stat: 'atq', val: 2, plafond: 5 } })],
    [C('Frappeur', 10, SOLIDE)], { regles: { maxTours: 6, maxProlong: 0 } });
  const gains = lignes(r, e => e.k === 'mod' && e.c === 0 && /réaction/.test(e.txt));
  assert.deepEqual(gains.map(e => e.d), [2, 2, 1]);
  assert.equal(r.journal.at(-1).atq[0], 6);
});

test('réaction : réduction des dégâts gagnée sur les coups suivants', () => {
  const r = combat([C('Tortue', 1, SOLIDE, { passif: { type: 'reaction', quand: 'degats', stat: 'reduc', val: 50, plafond: 50 } })],
    [C('Frappeur', 10, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  const coups = degatsAttaque(r, 0).map(e => e.n);
  assert.equal(coups[0], 10);
  assert.ok(coups.slice(1).every(n => n === 5));
});

test('lien parasitaire : les liens sont indépendants et se cumulent (X liens posés d\'un coup)', () => {
  const r = combat([C('Tique', 0, 1000, { ultime: { type: 'lien_parasite', tours: 5, pctlien: 30, nbliens: 2, apres_tours: 1, utilisations: 1 } }), MAG('Saignée', { type: 'degats', val: 500 })],
    [C('Hôte', 0, 1000, { passif: { type: 'soin_tour', val: 20 } })], { regles: { maxTours: 4, maxProlong: 0 } });
  const poses = lignes(r, e => e.k === 'lien' && e.t === 'statut');
  assert.deepEqual(poses.map(e => e.nb), [1, 2]);
  const fed = lignes(r, e => e.k === 'lien_soin');
  assert.ok(fed.length > 0 && fed.every(e => e.n === 12 && e.nb === 2), '30 % + 30 % de 20 = 12');
  const k = r.journal.indexOf(fed[0]);
  assert.deepEqual([r.journal[k - 1].t, r.journal[k - 1].c, r.journal[k - 1].n], ['soin', 1, 8]);
});

test('lien parasitaire : dans les deux sens, celui qui pose le lien partage aussi ses propres soins', () => {
  const r = combat([C('Tique', 0, 1000, { passif: { type: 'soin_tour', val: 20 }, ultime: { type: 'lien_parasite', tours: 9, pctlien: 30, nbliens: 2, apres_tours: 1, utilisations: 1 } }), MAG('Saignée', { type: 'degats', val: 500 })],
    [C('Hôte', 0, 1000, { passif: { type: 'soin_tour', val: 20 } }), MAG('Saignée', { type: 'degats', val: 500 })], { regles: { maxTours: 4, maxProlong: 0 } });
  const fed = lignes(r, e => e.k === 'lien_soin');
  assert.ok(fed.some(e => e.c === 0 && e.to === 1 && e.n === 12), 'Tique partage 60 % de ses soins');
  assert.ok(fed.some(e => e.c === 1 && e.to === 0 && e.n === 12), 'Hôte aussi');
  for (const f of fed) {
    const k = r.journal.indexOf(f);
    assert.equal(r.journal[k + 1].t, 'soin');
    assert.equal(r.journal[k + 1].n, 12, 'le soin reçu par le lien n\'est pas repartagé');
  }
});

test('mue forcée : un piège fait muer sa carte tout de suite (statuts retirés, ATQ et PV perdus)', () => {
  const r = combat([C('Cigale', 20, 1000, { passif: { type: 'mue', mueatq: 3, uatq: 'pts', muepv: 50, upv: 'pts' } }),
    PIE('Exuvie', { type: 'proprio_statut' }, { type: 'mue_forcee' })],
    [C('Venin', 1, SOLIDE, { passif: { type: 'poison', chance: 100, degtour: 2, tours: 3 } })], { regles: { maxTours: 3, maxProlong: 0 } });
  const mue = r.journal.findIndex(e => e.k === 'mue');
  assert.ok(mue > 0, 'le piège fait muer la carte');
  const apres = r.journal.slice(mue, mue + 8);
  assert.ok(apres.some(e => e.t === 'finstatut' && e.k === 'poison'));
  assert.ok(apres.some(e => e.k === 'mod' && e.d === -3), 'valeurs du passif Mue');
  assert.ok(apres.some(e => e.k === 'mod' && e.d === -50));
});

test('réduction des dégâts (magie) : X % de chances de réduire chaque coup de X %, pendant X tours', () => {
  const r = combat([C('Tortue', 0, SOLIDE), MAG('Carapace', { type: 'reduc_degats', val: 50, tours: 2 })], [C('Frappeur', 10, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  assert.equal(lignes(r, e => e.k === 'garde' && e.t === 'statut').length, 1);
  const coups = degatsAttaque(r, 0).map(e => e.n);
  assert.ok(coups.includes(5) && coups.includes(10), 'réduit pendant 2 tours, puis plus');
  assert.equal(lignes(r, e => e.k === 'garde' && e.t === 'finstatut').length, 1);
});

test('magie : elle peut attendre son tour N avant d\'agir, et ne durer que X tours', () => {
  const r = combat([C('Lent', 10, SOLIDE), MAG('Force tardive', { type: 'atq_mod', val: 10, cible: 'soi', magdebut: 3, magduree: 2 })], [C('B', 0, SOLIDE)], { regles: { maxTours: 7, maxProlong: 0 } });
  assert.ok(lignes(r, e => e.k === 'magie_attente').length === 1);
  const coups = degatsAttaque(r, 1).map(e => e.n);
  assert.deepEqual(coups.slice(0, 5), [10, 10, 20, 20, 10], 'ATQ +10 aux tours 3 et 4 seulement');
  assert.equal(lignes(r, e => e.k === 'magie_annulee').length, 1);
});

// ================= Rework d'octobre 2026 : Enracinement, Contamination, Vaporisation =================
const RACINE = (variante, x = {}) => ({ type: 'enracinement', ciblem: 'adversaire', variante, tours: 3, ...x });

test('enracinement épineux : chaque frappe que porte la carte enracinée la blesse (dégâts fixes de la carte)', () => {
  const r = combat([C('A', 1, SOLIDE), MAG('Ronces', RACINE('epineux', { val: 5 }))], [C('B', 10, SOLIDE, { passif: { type: 'multi_frappe', chance: 100, frappes: 3 } })], { regles: { maxTours: 2, maxProlong: 0 } });
  const epines = lignes(r, e => e.k === 'epines' && e.c === 1);
  assert.ok(epines.length >= 3, 'une blessure par frappe (3 frappes) : ' + epines.length);
  assert.ok(epines.every(e => e.n === 5), '5 dégâts chacune');
  assert.ok(r.journal.some(e => /enracinement épineux : 5 dégâts à chaque frappe/.test(e.txt || '')));
});

test('enracinement empoisonné : chaque frappe empoisonne la carte enracinée (niveau du poison de la carte)', () => {
  const r = combat([C('A', 1, SOLIDE), MAG('Lierre', RACINE('empoisonne', { niveau: 1 }))], [C('B', 10, SOLIDE, { passif: { type: 'multi_frappe', chance: 100, frappes: 2 } })], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.ok(r.journal.some(e => /^B est empoisonné encore plus fort \(poison II/.test(e.txt || '')), '2 frappes : poison I puis II');
});

test('enracinement inhibiteur : l\'ultime attend la fin de l\'enracinement, puis se lance', () => {
  const r = combat([C('A', 1, SOLIDE), MAG('Racines', RACINE('inhibiteur', { tours: 2 }))], [C('B', 1, SOLIDE, { ultime: { type: 'degats', val: 1, apres_tours: 1, utilisations: 1 } })], { regles: { maxTours: 5, maxProlong: 0 } });
  const iRetenu = r.journal.findIndex(e => e.k === 'ultime_retenu');
  const iFin = r.journal.findIndex(e => /L'enracinement inhibiteur de B se défait/.test(e.txt || ''));
  const iUlt = r.journal.findIndex(e => e.t === 'ultime' && e.c === 1);
  assert.ok(iRetenu > 0, 'retenu');
  assert.ok(iFin > iRetenu && iUlt > iFin, `lancé après la fin des racines (${iRetenu}, ${iFin}, ${iUlt})`);
});

test('enracinement : deux variantes différentes cohabitent ; la purification les retire', () => {
  const r = combat([C('A', 1, SOLIDE), MAG('Forêt', { briques: [RACINE('epineux'), RACINE('inhibiteur')] })], [C('B', 1, SOLIDE), MAG('Prière', { type: 'purification', cible: 'soi', fois: 2, every: 1 })], { regles: { maxTours: 3, maxProlong: 0 } });
  assert.equal(lignes(r, e => e.k === 'enracinement' && e.t === 'statut').length, 2, 'deux enracinements posés');
  assert.ok(r.journal.some(e => /enracinement dissipé/.test(e.txt || '')), 'purifiés');
});

test('contamination : les statuts déjà là et ceux qui arrivent durent un tour de plus', () => {
  const ticks = (briques) => lignes(combat([C('A', 1, SOLIDE), MAG('Eau', { briques })], [C('B', 1, SOLIDE)], { regles: { maxTours: 6, maxProlong: 0 } }), e => e.t === 'degats' && e.k === 'poison').length;
  const poison = { type: 'poison_effet', ciblem: 'adversaire', niveau: 1, tours: 2 };
  const conta = { type: 'contamination', ciblem: 'adversaire', tours: 6 };
  assert.equal(ticks([poison]), 2, 'sans contamination : 2 tours');
  assert.equal(ticks([poison, conta]), 3, 'poison déjà là : prolongé d\'un tour');
  assert.equal(ticks([conta, poison]), 3, 'poison qui arrive : un tour de plus');
  assert.equal(ticks([poison, conta, { ...conta }]), 4, 'chaque nouvelle contamination prolonge encore');
});

test('vaporisation : brûlure + contamination = la brûlure part en vapeur, la carte est affaiblie (+25 % de dégâts reçus)', () => {
  const r = combat([C('A', 20, SOLIDE), MAG('Vapeur', { briques: [{ type: 'contamination', ciblem: 'adversaire', tours: 5 }, { type: 'brulure_effet', ciblem: 'adversaire', niveau: 3, tours: 3 }] })], [C('B', 1, SOLIDE)], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.k === 'vaporisation'), 'vaporisation');
  assert.ok(!r.journal.some(e => e.t === 'degats' && e.k === 'brulure'), 'plus de brûlure');
  assert.ok(r.journal.some(e => /B est affaibli \(dégâts reçus \+25 %/.test(e.txt || '')));
  const coups = lignes(r, e => e.t === 'degats' && e.c === 1 && /^B subit \d+ dégâts$/.test(e.txt || '')).map(e => e.n);
  assert.equal(coups[0], 25, 'ATQ 20 → 25 dégâts sur une carte affaiblie (' + coups + ')');
  // la contamination reste après la vaporisation, la faiblesse ne se purifie pas
  const p = combat([C('A', 20, SOLIDE), MAG('Vapeur', { briques: [{ type: 'contamination', ciblem: 'adversaire', tours: 5 }, { type: 'brulure_effet', ciblem: 'adversaire', niveau: 1, tours: 3 }] })], [C('B', 1, SOLIDE), MAG('Prière', { type: 'purification', cible: 'soi' })], { seed: 3, regles: { maxTours: 2, maxProlong: 0 } });
  assert.ok(!p.journal.some(e => /faiblesse dissipé/.test(e.txt || '')), 'la faiblesse ne se purifie pas');
});

test('vaporisation : pas sur une carte gelée (la glace fond, la brûlure part avec elle)', () => {
  const r = combat([C('A', 1, SOLIDE), MAG('Mélange', { briques: [{ type: 'gel', ciblem: 'adversaire', annul: 10, tours: 5 }, { type: 'contamination', ciblem: 'adversaire', tours: 5 }, { type: 'brulure_effet', ciblem: 'adversaire', niveau: 1, tours: 3 }] })], [C('B', 1, SOLIDE)], { regles: { maxTours: 1, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.k === 'degel'), 'la glace fond');
  assert.ok(!r.journal.some(e => e.k === 'vaporisation'), 'pas de vaporisation');
});

// ================= Terre : Sédimentation, Réplique sismique =================
test('sédimentation : une couche par coup reçu qui touche ; à 3 couches, un bouclier qui encaisse avant le blocage', () => {
  const r = combat([C('Roc', 1, SOLIDE, { passif: { type: 'sedimentation', val: 30, u: 'pts' } })], [C('B', 10, SOLIDE, { passif: { type: 'multi_frappe', chance: 100, frappes: 4 } })], { regles: { maxTours: 2, maxProlong: 0 } });
  const couches = lignes(r, e => e.k === 'couche').map(e => e.n);
  assert.deepEqual(couches.slice(0, 3), [1, 2, 3]);
  assert.ok(r.journal.some(e => /se fait bouclier : \+30 \(bouclier 30\)/.test(e.txt || '')));
  // la 4e frappe (10 dégâts) est encaissée par le bouclier
  assert.ok(r.journal.some(e => e.k === 'bouclier_encaisse' && e.n === 10 && e.v === 20), 'encaisse 10, reste 20');
});

test('sédimentation : une frappe esquivée ne donne pas de couche', () => {
  const r = combat([C('Roc', 1, SOLIDE, { passif: { briques: [{ type: 'sedimentation' }, { type: 'esquive', chance: 75 }] } })], [C('B', 10, SOLIDE)], { regles: { maxTours: 6, maxProlong: 0 } });
  const esquives = lignes(r, e => e.t === 'esquive' && e.c === 0).length;
  const coups = lignes(r, e => e.t === 'attaque' && e.c === 1).length;
  const couches = lignes(r, e => e.k === 'couche').length;
  assert.equal(couches, coups - esquives, `${coups} coups, ${esquives} esquives, ${couches} couches`);
});

test('bouclier qui encaisse tout : le blocage ne riposte pas (il riposte au 1er coup qu\'il bloque vraiment)', () => {
  const bloc = PIE('Bloc', { type: 'adv_attaque', coups: 1 }, { type: 'bloque_attaque', riposte: 'renvoi', pctriposte: 100 });
  const r = combat([C('Roc', 1, SOLIDE, { passif: { type: 'sedimentation', val: 25, u: 'pts' } }), bloc], [C('B', 10, SOLIDE, { passif: { type: 'multi_frappe', chance: 100, frappes: 3 } })], { regles: { maxTours: 2, maxProlong: 0 } });
  const i = r.journal.findIndex(e => e.k === 'riposte');
  assert.ok(i > 0, 'une riposte');
  // juste avant : le bouclier n'a pris qu'une partie (5 sur 10), le blocage a pris le reste
  assert.ok(r.journal.slice(i - 3, i).some(e => e.k === 'bouclier_encaisse' && e.n === 5 && e.v === 0), 'riposte sur la frappe que le bouclier ne prend pas toute');
  assert.equal(lignes(r, e => e.k === 'riposte').length, 1, 'une seule riposte');
  assert.ok(r.journal.find(e => e.k === 'renvoi' && e.c === 1).n === 5, 'renvoie les 5 dégâts bloqués');
});

test('réplique sismique : à 3 charges, la terre frappe l\'attaquant (% de l\'ATQ), sans que ce soit une attaque', () => {
  const r = combat([C('Faille', 40, SOLIDE, { passif: { type: 'replique', pctatq: 50 } })], [C('B', 1, SOLIDE, { passif: { type: 'multi_frappe', chance: 100, frappes: 3 } })], { regles: { maxTours: 2, maxProlong: 0 } });
  const charges = lignes(r, e => e.k === 'charge').map(e => e.n);
  assert.deepEqual(charges.slice(0, 3), [1, 2, 3]);
  const rep = lignes(r, e => e.t === 'degats' && e.k === 'replique');
  assert.ok(rep.length >= 1 && rep[0].n === 20, '50 % de 40 ATQ = 20');
  // deux cartes à réplique : pas de boucle sans fin
  const r2 = combat([C('A', 5, SOLIDE, { passif: { briques: [{ type: 'replique' }, { type: 'multi_frappe', chance: 100, frappes: 3 }] } })], [C('B', 5, SOLIDE, { passif: { briques: [{ type: 'replique' }, { type: 'multi_frappe', chance: 100, frappes: 3 }] } })], { regles: { maxTours: 3, maxProlong: 0 } });
  assert.ok(r2.journal.length < 400, 'pas de boucle');
});

// ================= Vent : coups critiques, Courant ascendant, Cisaillement =================
test('coup critique : X % de chances par coup, puissance commune (50 % de l\'ATQ par défaut, réglable)', () => {
  const r = combat([C('A', 20, SOLIDE, { passif: { type: 'critique', chance: 100 } })], [C('B', 1, SOLIDE)], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.k === 'critique' && e.n === 10), '+10 (50 % de 20)');
  assert.ok(lignes(r, e => e.t === 'degats' && e.c === 1 && e.n === 30).length > 0, '20 + 10 = 30');
  const r2 = combat([C('A', 20, SOLIDE, { passif: { type: 'critique', chance: 100 } })], [C('B', 1, SOLIDE)], { regles: { maxTours: 2, maxProlong: 0, niveaux: { critique: 100 } } });
  assert.ok(r2.journal.some(e => e.k === 'critique' && e.n === 20), 'puissance réglée à 100 %');
  const r3 = combat([C('A', 20, SOLIDE, { passif: { type: 'critique', chance: 0 } })], [C('B', 1, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  assert.ok(!r3.journal.some(e => e.k === 'critique'), '0 % : jamais');
});

test('headshot : un critique sans tirer la chance de critique (puissance commune)', () => {
  const r = combat([C('A', 20, SOLIDE, { passif: { type: 'headshot', chance: 100, pctcrit: 300 } })], [C('B', 1, SOLIDE)], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.k === 'headshot' && e.n === 10), 'headshot : +50 % de 20, la vieille puissance de la carte ne compte plus');
  assert.ok(!r.journal.some(e => e.k === 'critique'), 'pas de second critique sur le même coup');
});

test('courant ascendant : le critique fait +X %, et la puissance critique monte (cumul plafonné)', () => {
  const r = combat([C('A', 20, SOLIDE, { passif: { briques: [{ type: 'critique', chance: 100 }, { type: 'courant_ascendant', val: 20, pctcrit: 10, tours: 2, max: 2 }] } })], [C('B', 1, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  const crits = lignes(r, e => e.k === 'critique').map(e => e.n);
  assert.deepEqual(crits.slice(0, 3), [10, 12, 14], '50 %, puis 60 %, puis 70 % (plafond 2 cumuls)');
  const cour = lignes(r, e => e.k === 'courant' && e.t === 'statut').map(e => e.s);
  assert.deepEqual(cour.slice(0, 3), [1, 2, 2], 'cumul plafonné à 2');
  const coups = lignes(r, e => e.t === 'degats' && e.c === 1 && /^B subit \d+ dégâts$/.test(e.txt || '')).map(e => e.n);
  assert.equal(coups[0], 36, '(20 + 10) × 1,2 = 36');
});

test('cisaillement : les lames frappent ensemble après X tours de la cible, chaque pose garde sa durée', () => {
  const r = combat([C('A', 1, SOLIDE), MAG('Vent', { briques: [{ type: 'cisaillement', lames: 3, val: 20, tours: 2 }, { type: 'cisaillement', lames: 1, val: 5, tours: 1 }] })], [C('B', 1, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  const coups = lignes(r, e => e.k === 'lames' && e.t === 'degats').map(e => e.n);
  assert.deepEqual(coups, [5, 60], '1 × 5 après 1 tour, puis 3 × 20 après 2 tours');
  // ni purifié, ni prolongé
  const r2 = combat([C('A', 1, SOLIDE), MAG('Vent', { briques: [{ type: 'contamination', ciblem: 'adversaire', tours: 5 }, { type: 'cisaillement', lames: 2, val: 10, tours: 2 }] })], [C('B', 1, SOLIDE), MAG('Prière', { type: 'purification', cible: 'soi' })], { regles: { maxTours: 4, maxProlong: 0 } });
  assert.deepEqual(lignes(r2, e => e.k === 'lames' && e.t === 'degats').map(e => e.n), [20]);
});

// ================= Foudre : marque de foudre =================
test('marque de foudre : niveau I amplifie le prochain coup reçu (+40 %), une fois', () => {
  const r = combat([C('A', 1, SOLIDE), MAG('Éclair', { type: 'marque_foudre' })], [C('B', 1, SOLIDE)], { regles: { maxTours: 1, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.k === 'foudre' && e.n === 1), 'niveau I');
  const r2 = combat([C('A', 50, SOLIDE), MAG('Éclair', { type: 'marque_foudre' })], [C('B', 1, SOLIDE)], { regles: { maxTours: 3, maxProlong: 0 } });
  const coups = lignes(r2, e => e.t === 'degats' && e.c === 1 && /^B subit \d+ dégâts$/.test(e.txt || '')).map(e => e.n);
  assert.deepEqual(coups.slice(0, 2), [70, 50], '50 +40 % = 70, puis normal');
});

test('marque de foudre : niveau II, l\'éclair charge la magie puis le piège, détruit une carte déjà chargée, puis la marque revient à zéro', () => {
  const foudre = { type: 'foudre', chance: 100 };
  const r = combat([C('Orage', 1, SOLIDE, { passif: foudre })], [C('B', 1, SOLIDE), MAG('Bouclier', { type: 'atq_mod', cible: 'soi', val: 1 }), PIE('Fosse', { type: 'tour_n', ntour: 99 }, { type: 'degats', val: 1 })], { regles: { maxTours: 6, maxProlong: 0 } });
  const rebonds = lignes(r, e => e.k === 'foudre_rebond').map(e => `${e.s}:${e.r}`);
  assert.deepEqual(rebonds.slice(0, 4), ['magie:charged', 'piege:charged', 'magie:destroyed', 'piege:destroyed'], JSON.stringify(rebonds));
  assert.ok(r.journal.some(e => e.k === 'foudre' && e.t === 'finstatut'), 'la marque revient à zéro');
});

test('marque de foudre : la purification la retire', () => {
  const r = combat([C('A', 1, SOLIDE, { ultime: { type: 'marque_foudre', apres_tours: 1, utilisations: 1 } })], [C('B', 1, SOLIDE, { passif: { type: 'purification', every: 1 } })], { regles: { maxTours: 3, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.k === 'foudre' && e.n === 1), 'posée');
  assert.ok(r.journal.some(e => /marque de foudre dissipé/.test(e.txt || '')), 'purifiée');
});

test('dégâts doublés : ils se cumulent (×2, puis ×4), chacun avec sa durée', () => {
  const r = combat([C('A', 10, SOLIDE), MAG('Rituel', { briques: [{ type: 'double_degats', tours: 3 }, { type: 'double_degats', tours: 1 }] })], [C('B', 1, SOLIDE)], { regles: { maxTours: 5, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.txt === 'A double ses dégâts'), '×2');
  assert.ok(r.journal.some(e => e.txt === 'A double encore ses dégâts (×4)'), '×4');
  const coups = lignes(r, e => e.t === 'degats' && e.c === 1 && /^B subit \d+ dégâts$/.test(e.txt || '')).map(e => e.n);
  assert.deepEqual(coups.slice(0, 4), [40, 20, 20, 10], '×4 un tour, puis ×2 jusqu\'au 3e, puis normal');
});

test('embrasement : 2 tours, ATQ +30 %, chaque coup brûle (niveau I qui se cumule), la carte se calcine de 10 % de ses PV max par tour', () => {
  const r = combat([C('A', 10, 1000, { ultime: { type: 'embrasement', apres_tours: 1, utilisations: 1 } })], [C('B', 1, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.k === 'embrasement' && /^A s'embrase : ATQ \+30 %/.test(e.txt || '')), 'embrasé');
  const coups = lignes(r, e => e.t === 'degats' && e.c === 1 && /^B subit \d+ dégâts$/.test(e.txt || '')).map(e => e.n);
  assert.deepEqual(coups.slice(0, 3), [13, 13, 10], '10 + 30 % pendant 2 tours, puis normal');
  const brulures = lignes(r, e => e.k === 'brulure' && e.c === 1).map(e => e.n);
  assert.deepEqual(brulures.slice(0, 2), [1, 2], 'brûlure I à chaque coup, qui se cumule');
  const calc = lignes(r, e => e.t === 'stat' && e.c === 0 && /calcination/.test(e.txt || '')).map(e => e.txt);
  assert.deepEqual(calc, ['PV max de A −100 (calcination)', 'PV max de A −90 (calcination)'], '10 % des PV max à chacun de ses 2 tours');
  assert.ok(r.journal.some(e => e.txt === "L'embrasement de A s'éteint"), 'éteint');
});

test("embrasement : la glace l'éteint (et s'use), l'eau l'éteint avec une vaporisation (faiblesse)", () => {
  const A = () => C('A', 10, 1000, { ultime: { type: 'embrasement', apres_tours: 1, utilisations: 1 } });
  const glace = combat([A()], [C('B', 1, SOLIDE, { passif: { type: 'gel', chance: 100, tours: 2 } })], { regles: { maxTours: 4, maxProlong: 0 } });
  assert.ok(glace.journal.some(e => e.txt === "La glace éteint l'embrasement de A !"), 'glace');
  const eau = combat([A()], [C('B', 1, SOLIDE, { passif: { type: 'contamination', chance: 100, tours: 2 } })], { regles: { maxTours: 4, maxProlong: 0 } });
  assert.ok(eau.journal.some(e => e.txt === "L'eau éteint l'embrasement de A !"), 'eau');
  assert.ok(eau.journal.some(e => /VAPORISATION .*l'embrasement part en vapeur/.test(e.txt || '')), 'vaporisation');
  assert.ok(eau.journal.some(e => e.k === 'faiblesse' && e.c === 0), 'faiblesse');
});

// ================= Compétences d'octobre 2026 =================
test('embrasement en magie, et une carte déjà contaminée : l\'eau l\'éteint tout de suite', () => {
  const r = combat([C('A', 10, 1000), MAG('Feu', { type: 'embrasement' })], [C('B', 1, SOLIDE)], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.k === 'embrasement' && /s'embrase/.test(e.txt || '')), 'magie');
  const eau = combat([C('A', 10, 1000, { ultime: { type: 'embrasement', apres_tours: 2, utilisations: 1 } })], [C('B', 1, SOLIDE, { passif: { type: 'contamination', chance: 100, tours: 5 } })], { regles: { maxTours: 4, maxProlong: 0 } });
  const i = eau.journal.findIndex(e => /s'embrase/.test(e.txt || ''));
  assert.equal(eau.journal[i + 1].txt, "L'eau éteint l'embrasement de A !", 'éteint aussitôt');
});

test('fureur incandescente : +5 % d\'ATQ par perte de PV (50 % au plus), un soin en retire un', () => {
  const r = combat([C('A', 20, 1000, { passif: { type: 'fureur_incandescente' } })], [C('B', 5, SOLIDE)], { regles: { maxTours: 30, maxProlong: 0 } });
  const f = lignes(r, e => e.k === 'fureur').map(e => e.n);
  assert.deepEqual(f.slice(0, 3), [5, 10, 15]);
  assert.equal(Math.max(...f), 50, 'plafond');
  const coups = lignes(r, e => e.t === 'degats' && e.c === 1 && /^B subit \d+ dégâts$/.test(e.txt || '')).map(e => e.n);
  assert.deepEqual(coups.slice(0, 3), [21, 22, 23], '20 +5 %, +10 %, +15 %');
  const s = combat([C('A', 20, 1000, { passif: { briques: [{ type: 'fureur_incandescente' }, { type: 'soin_tour', val: 1 }] } })], [C('B', 5, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  assert.ok(s.journal.some(e => /^La fureur de A (retombe|s'apaise)/.test(e.txt || '')), 'le soin en retire un');
});

test('sangsue toxique : chaque tic de poison de l\'adversaire soigne 20 / 35 / 50 % selon le niveau', () => {
  const r = combat([C('A', 10, 1000, { passif: { briques: [{ type: 'sangsue_toxique' }, { type: 'poison', chance: 100, niveau: 2, tours: 3 }] } })], [C('B', 50, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  const i = r.journal.findIndex(e => e.k === 'sangsue_soin');
  assert.ok(i > 0, 'aspire');
  assert.equal(r.journal[i].txt, 'Sangsue toxique : A aspire 35 % du poison de B');
  assert.equal(r.journal[i + 1].txt, 'A récupère 3 PV', '35 % de 8');
});

test('injection virulente : pose un poison I, le monte d\'un niveau, puis au III fait 50 % des dégâts restants', () => {
  const inj = { type: 'injection_virulente' };
  const r = combat([C('A', 1, 1000), MAG('Venin', { briques: [inj, inj, inj, inj] })], [C('B', 1, SOLIDE)], { regles: { maxTours: 1, maxProlong: 0 } });
  assert.deepEqual(lignes(r, e => e.k === 'poison' && e.t === 'statut').map(e => e.n), [1, 2, 3]);
  const d = lignes(r, e => e.t === 'degats' && /venin explose/.test(e.txt || ''));
  assert.equal(d.length, 1);
  assert.equal(d[0].n, 21, '50 % de 14 × 3 tours');
});

test('surcharge : s\'électrocute (10 % des PV max), ATQ −40 %, la foudre à chaque coup, 2 tours', () => {
  const r = combat([C('A', 10, 1000, { ultime: { type: 'surcharge', apres_tours: 1, utilisations: 1 } })], [C('B', 1, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.txt === "A s'électrocute (surcharge) : 100 dégâts"), 'auto-électrocution');
  assert.ok(lignes(r, e => e.k === 'foudre' && e.c === 1).length >= 2, 'foudre à chaque coup');
  assert.ok(r.journal.some(e => e.txt === 'La surcharge de A retombe'), 'fin');
  let max = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = combat([C('A', 10, 1000, { ultime: { type: 'surcharge', apres_tours: 1, utilisations: 1 } })], [C('B', 1, SOLIDE)], { seed, regles: { maxTours: 4, maxProlong: 0 } });
    let n = 0; g.journal.forEach(e => { if (e.t === 'attaque' && / attaque$/.test(e.txt || '')) n = 0; if (e.t === 'degats' && e.c === 1 && /^B subit/.test(e.txt || '')) max = Math.max(max, ++n); });
  }
  assert.equal(max, 3, 'enchaîne jusqu\'à 3 coups, pas plus');
});

test('accumulateur : 3 marques de foudre posées, la prochaine attaque fait +50 %', () => {
  const r = combat([C('A', 10, 1000, { passif: { briques: [{ type: 'accumulateur' }, { type: 'foudre', chance: 100 }] } })], [C('B', 1, SOLIDE)], { regles: { maxTours: 8, maxProlong: 0 } });
  assert.ok(r.journal.some(e => /^L'accumulateur de A est plein \(3\/3\)/.test(e.txt || '')), 'plein');
  const i = r.journal.findIndex(e => e.k === 'decharge');
  const coup = r.journal.slice(i).find(e => e.t === 'degats' && e.c === 1);
  assert.equal(coup.n, 21, '(10 + 50 %) puis la marque I (+40 %)');
});

test('étreinte maudite : chaque attaque du maudit lui retire 1 ATQ par malédiction ; brisure de volonté : 2 × l\'ATQ perdue', () => {
  const r = combat([C('A', 1, 1000, { passif: { briques: [{ type: 'etreinte_maudite' }, { type: 'malediction', chance: 100, tours: 3 }] }, ultime: { type: 'brisure_volonte', apres_tours: 4, utilisations: 1 } })], [C('B', 20, SOLIDE)], { regles: { maxTours: 8, maxProlong: 0 } });
  assert.deepEqual(lignes(r, e => /étreinte maudite/.test(e.txt || '')).map(e => e.d).slice(0, 3), [-1, -2, -3]);
  assert.ok(r.journal.some(e => e.txt === 'BRISURE DE VOLONTÉ ! B a perdu 15 ATQ aux malédictions : A le brise (30 dégâts)'));
});

test('verrouillage total : les 3 prochains coups sont des headshots ; visée maintenue peut garder la cible', () => {
  const r = combat([C('A', 10, 1000, { ultime: { type: 'verrouillage_total', apres_tours: 1, utilisations: 1 } })], [C('B', 1, SOLIDE)], { regles: { maxTours: 10, maxProlong: 0 } });
  assert.equal(lignes(r, e => e.k === 'headshot').length, 3);
  let gardee = false;
  for (let seed = 1; seed <= 20 && !gardee; seed++) {
    const g = combat([C('A', 10, 1000, { passif: { type: 'visee_maintenue' }, ultime: { type: 'verrouillage_total', apres_tours: 1, utilisations: 1 } })], [C('B', 1, SOLIDE)], { seed, regles: { maxTours: 10, maxProlong: 0 } });
    gardee = g.journal.some(e => e.k === 'visee') && lignes(g, e => e.k === 'headshot').length > 3;
  }
  assert.ok(gardee, 'au moins une fois gardée');
});

test('étreinte maudite donnée par une magie : agit comme le passif', () => {
  const r = combat([C('A', 1, 1000, { passif: { type: 'malediction', chance: 100, tours: 3 } }), MAG('Étreinte', { type: 'etreinte_maudite' })], [C('B', 20, SOLIDE)], { regles: { maxTours: 6, maxProlong: 0 } });
  assert.ok(r.journal.some(e => e.k === 'etreinte'), 'donnée');
  assert.deepEqual(lignes(r, e => /étreinte maudite\)/.test(e.txt || '')).map(e => e.d).slice(0, 2), [-1, -2]);
});

test('évite la mort par un piège, contré par une salve de missiles (adv_piege) : les missiles frappent la carte restée à 1 PV', () => {
  const salve = PIE('Salve', { type: 'adv_piege' }, { type: 'missiles', val: 4, bonus: 5, conso: 100, frappes: 4, mstatut: 'aucun' });
  const gardien = PIE('Gardien', { type: 'proprio_meurt' }, { type: 'mort_evitee', cond: 'aucune' });
  for (const seed of [1, 2, 3, 4]) {
    const r = combat([C('a', 50, SOLIDE), salve], [C('b', 1, 30), gardien], { seed });
    // la frappe mortelle laisse b à 1 PV le temps que son piège se joue : le 1er missile l'achève
    assert.equal(r.gagnant, 0, 'b meurt sous les missiles');
    assert.equal(r.journal.filter(e => e.t === 'protege').length, 0, 'b ne survit pas');
    assert.equal(r.journal.filter(e => e.t === 'missile').length, 1, 'un seul missile suffit');
    const coup = r.journal.find(e => e.t === 'degats' && e.c === 1);
    assert.match(coup.txt, /subit 29 dégâts/, 'la frappe mortelle laisse b à 1 PV');
  }
});
