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
  const r = combat([C('Feu', 5, SOLIDE, { passif: { type: 'brulure', chance: 100, pctpv: 5, tours: 2 } })], [C('b', 5, 200)], { regles: { maxTours: 3, maxProlong: 0 } });
  const iB = r.journal.findIndex(e => e.txt === 'b subit 10 (brûlure)');
  assert.ok(iB > 0, 'tick de brûlure : 5 % de 200');
  assert.equal(r.journal[iB + 1].txt, 'PV max de b −10 (calcination)');
  assert.equal(r.journal[iB + 1].k, 'calcine');
  const fin = r.journal.at(-1);
  assert.ok(fin.max[1] < 200, 'les PV max restent brûlés');
});

test('brûlure : la part calcinée se règle par carte (calcine, % des dégâts ; vide = 100 %, 0 = aucune)', () => {
  const moitie = combat([C('Feu', 5, SOLIDE, { passif: { type: 'brulure', chance: 100, pctpv: 5, tours: 2, calcine: 50 } })], [C('b', 5, 200)], { regles: { maxTours: 3, maxProlong: 0 } });
  const iB = moitie.journal.findIndex(e => e.txt === 'b subit 10 (brûlure)');
  assert.ok(iB > 0, 'tick de brûlure : 5 % de 200');
  assert.equal(moitie.journal[iB + 1].txt, 'PV max de b −5 (calcination)', '50 % des 10 dégâts');
  const sans = combat([C('Feu', 5, SOLIDE, { passif: { type: 'brulure', chance: 100, pctpv: 5, tours: 2, calcine: 0 } })], [C('b', 5, 200)], { regles: { maxTours: 3, maxProlong: 0 } });
  assert.ok(sans.journal.some(e => e.txt === 'b subit 10 (brûlure)'), 'la brûlure brûle toujours');
  assert.ok(!sans.journal.some(e => e.k === 'calcine'), 'mais ne calcine rien');
});

test('feu contre glace : brûler une carte gelée fait fondre la glace d\'un niveau, avec un choc thermique', () => {
  const r = combat([C('Feu', 5, SOLIDE, { passif: { type: 'brulure', chance: 100, pctpv: 5, tours: 2 } }), MAG('Givre', { type: 'gel', ciblem: 'adversaire', annul: 20, tours: 5 })], [C('b', 5, 200)], { regles: { maxTours: 2, maxProlong: 0 } });
  const iD = r.journal.findIndex(e => e.k === 'degel');
  assert.ok(iD > 0, 'la glace fond');
  assert.equal(r.journal[iD].n, 0, 'gel 1 → 0');
  assert.ok(r.journal.slice(iD, iD + 4).some(e => e.txt === 'b subit 10 dégâts (choc thermique)'), 'choc thermique');
  assert.ok(r.journal.slice(iD).some(e => /b brûle/.test(e.txt || '')), 'la brûlure prend quand même');
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

test('Glas : relancé, il accélère de moins en moins (+1/2, +1/4…)', () => {
  const r = combat([C('Faucheur', 8, SOLIDE, { passif: GLAS() })], [C('b', 8, SOLIDE)], { regles: { maxTours: 4, maxProlong: 0 } });
  const v = r.journal.filter(e => e.k === 'glas').map(e => e.v);
  assert.deepEqual(v.slice(0, 3), [8, 12, 14]);
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
  const att = { brulure: /brûle/, gel: /se couvre de givre \(gel 1\/3 : 12 %/, malediction: /maudit \(ATQ −12/, poison: /empoisonné/, saignement: /saigne \(12 %/, fatigue: /fatigué \(ATQ −\d+/ };
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
  const pose = MAG('Pose', { briques: [{ type: 'poison_effet', ciblem: 'adversaire', degtour: 10, tours: 3 }, { type: 'brulure_effet', ciblem: 'adversaire', pctpv: 1, tours: 2 }] });
  const ult = { type: 'detonation', bonus: 50, val: 0, recul: 20, apres_tours: 1, utilisations: 1 };
  const r = combat([C('a', 0, 5000, { ultime: ult }), pose], [C('b', 0, 1000)], { regles: { maxTours: 1, maxProlong: 0 } });
  const i = r.journal.findIndex(e => e.t === 'detonation');
  assert.ok(i > 0, 'détonation');
  assert.deepEqual([...r.journal[i].parts].sort(), ['brulure', 'poison']);
  // b joue en premier : 1 TIK déjà passé → reste poison 10 × 2 + brûlure 10 × 1 = 30, +50 % = 45
  assert.ok(r.journal.some(e => e.txt === 'b subit 45 dégâts (détonation)'), JSON.stringify(r.journal.filter(e => e.k === 'detonation').map(e => e.txt)));
  assert.ok(r.journal.some(e => e.txt === "a subit 9 dégâts (souffle de l'explosion)"), 'dégâts de zone 20 %');
  assert.ok(!r.journal.slice(i).some(e => /\((poison|brûlure)\)/.test(e.txt || '')), 'plus aucun TIK ensuite');
  // solidifié : moitié
  const r2 = combat([C('a', 0, 5000, { ultime: ult }), pose], [C('b', 0, 1000, { passif: { type: 'solidification', chance: 100, tours: 9 } })], { regles: { maxTours: 1, maxProlong: 0 } });
  assert.ok(r2.journal.some(e => /b subit 2[23] dégâts \(détonation\)/.test(e.txt || '')), JSON.stringify(r2.journal.filter(e => e.k === 'detonation').map(e => e.txt)));
});

test('détonation partielle : X % des dégâts restants, statuts purgés quand même + dégâts bruts jamais réduits', () => {
  const pose = MAG('Pose', { briques: [{ type: 'poison_effet', ciblem: 'adversaire', degtour: 10, tours: 3 }, { type: 'brulure_effet', ciblem: 'adversaire', pctpv: 1, tours: 2 }] });
  const ult = { type: 'detonation', bonus: 50, val: 100, conso: 50, apres_tours: 1, utilisations: 1 };
  const r = combat([C('a', 0, 5000, { ultime: ult }), pose], [C('b', 0, 1000)], { regles: { maxTours: 3, maxProlong: 0 } });
  const i = r.journal.findIndex(e => e.t === 'detonation');
  assert.ok(i > 0, 'détonation');
  // reste poison 10 × 2 + brûlure 10 × 1 → moitié consumée : 5 × 2 + 5 × 1 = 15, +50 % = 22,5 → 22 ou 23, + 100 bruts
  assert.ok(r.journal.some(e => /^b subit 12[23] dégâts \(détonation\)$/.test(e.txt || '')), JSON.stringify(r.journal.filter(e => e.k === 'detonation').map(e => e.txt)));
  assert.ok(!r.journal.slice(i).some(e => /\((poison|brûlure)\)/.test(e.txt || '')), 'les statuts sont purgés quand même');
  // solidifié : seuls les dégâts des statuts sont divisés par deux, pas les dégâts bruts
  const r2 = combat([C('a', 0, 5000, { ultime: ult }), pose], [C('b', 0, 1000, { passif: { type: 'solidification', chance: 100, tours: 9 } })], { regles: { maxTours: 1, maxProlong: 0 } });
  assert.ok(r2.journal.some(e => /^b subit 11[12] dégâts \(détonation\)$/.test(e.txt || '')), JSON.stringify(r2.journal.filter(e => e.k === 'detonation').map(e => e.txt)));
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
  const ult = { type: 'missiles', frappes: 3, val: 20, bonus: 50, mstatut: 'brulure', sval: 1, tours: 2, apres_tours: 1, utilisations: 1 };
  const r = combat([C('a', 0, 5000, { ultime: ult })], [C('b', 0, 1000)], { regles: { maxTours: 2, maxProlong: 0 } });
  assert.equal(lignes(r, e => e.t === 'missile').length, 3);
  // n°1 : 20 bruts · n°2 et n°3 : brûlure 10 × 2 = 20, +50 % = 30, + 20 bruts = 50
  assert.deepEqual(lignes(r, e => /\(missile\)$/.test(e.txt || '')).map(e => e.n), [20, 50, 50]);
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

test('relais : une magie déjà jouée n\'est pas retirée au combattant suivant', () => {
  const m = n => MAG(n, { type: 'atq_mod', val: 1, cible: 'soi' });
  const r = relais([C('A1', 100, 100), C('A2', 100, 100), C('A3', 100, 100), m('M1'), m('M2'), m('M3')], [C('B1', 1, 100), C('B2', 1, 100), C('B3', 1, 100)]);
  const noms = r.journal.filter(e => e.t === 'magie' && e.c === 0).map(e => e.txt);
  assert.equal(noms.length, 1, 'A garde son premier combattant : sa magie n\'est révélée qu\'une fois');
});
