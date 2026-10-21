# Legacy : moteur de combat

Notes sur `moteur-combat.js` au commit de référence. Elles listent ce qu'une réécriture iso doit reproduire, y compris ce qui ressemble à un défaut.

## Interface

```
Moteur.simuler(pA, pB, { seed?, regles? }) → { seed, regles, gagnant, recompenses, journal }
pA / pB = { pseudo, deck: Card[], dos? }
```

Le calcul est synchrone. Sans seed, la fonction en tire une avec `Math.random()`. `REG` contient les valeurs par défaut : `maxTours: 10`, `gain: 50`, `perte: 10`, `nul: 20`, `plafondEsquive: 75`, `maxProlong: 3`.

## Le journal est le contrat

Chaque événement vaut `{ t, txt, ...champs, tour, pv: [a, b], max: [a, b], atq: [a, b] }`. Les trois tableaux sont un instantané pris au moment de l'émission.

Ajout du moteur TS (absent du legacy) : tant qu'une carte est en rage ou a ses dégâts doublés, chaque ligne porte aussi `boost: [[rage, x2], [rage, x2]]` (bonus de rage en cours, `1` si les dégâts sont doublés, sinon `0`). L'overlay affiche alors l'ATQ finale d'un coup (`atq × 2` si doublé, `+ rage`) avec un effet. Une rage cesse de compter dès sa ligne « La rage de … retombe ».

- `t` : catégorie (`debut`, `tour`, `attaque`, `frappe`, `degats`, `soin`, `statut`, `finstatut`, `stat`, `magie`, `piege`, `ultime`, `vol`, `esquive`, `bloque`, `protege`, `reanim_mort`, `reanim`, `souffle`, `prolongation`, `fin`, `inconnu`).
- `k` : sous-type, lu par l'overlay pour choisir l'animation.
- `c` : index de la carte concernée (0 ou 1). On trouve aussi `n` (montant), `d` (delta de stat), `from`, `to`, `cs`, `el`, etc.
- `txt` : phrase française. L'edge function la stocke dans `historique_combats.deroule`. `combat.html` la découpe sur `' : '` pour afficher le nom d'un effet aléatoire (`k === 'alea'`).

L'edge function retouche le dernier événement après le calcul (`fin.recompenses`, `fin.bounty`). Ça se passe hors du moteur.

## Pièges pour l'iso

### Ordre du RNG

Un seul générateur mulberry32, `r()`, consommé dans l'ordre des appels. Chaque `roll()`, `r()` ou `tire()` avance l'état. Les court-circuits (`a && roll(x)`) décident si le tirage a lieu. Déplacer, ajouter ou supprimer un seul tirage fait diverger tout le reste du combat.

`tire()` appelle `r()` même si la liste ne contient qu'une carte, ou aucune. Au début, il y a donc toujours 6 tirages (3 par joueur) avant `first = r() < .5`. Le premier joueur ne dépend que de la seed.

### Fonctions à effet de bord qui ont l'air pures

- `over()` appelle `flush()`, qui joue les réanimations (`pendRev`) et les effets différés (`pendEv`, pièges, « évite la mort »). Retirer un `over()` qui semble redondant change l'ordre des événements.
- `L('degats', …)` appelle `flush()` après l'émission, et aussi quand `n === 0` (sans rien émettre).
- `L('stat', …)` avec `d === 0` n'émet rien.

Dans la réécriture, ces `flush()` doivent rester dans le moteur. Si l'émission passe par une abstraction (journal complet ou simulation rapide), elle ne doit pas les porter.

### Annonce différée d'un piège « évite la mort »

Dans `dmg`, les lignes du piège sont retirées du journal (`J.splice`) puis remises après la ligne de dégâts, avec `pv`, `max` et `atq` recalculés mais le reste inchangé, `tour` compris. Si aucune ligne de dégâts ne vide les effets en attente (dégâts ramenés à 0, par exemple le recul d'une détonation sur une carte à 1 PV), elles ressortent au round suivant en gardant leur round d'origine. Le moteur TS fait de même (`releaseNow`, `combat/combat.ts`).

### Déclencheurs sur événement (hook de `L()`)

`L()` appelle `trig(t, o, txt)` juste après `J.push` et **avant** le `flush()` de `degats`. `trig` classe la ligne en fait (`st`, `esq`, `coup`, `piege`, `tour`, `bloque`, `soin2`, `ult`, `atk`), puis :

1. pose tout de suite `h.trg = 1` sur les emplacements d'ultime dont le `udecl` est rempli, sans tirage ni ligne, avec les compteurs de ce moment (`coups`) ;
2. si `TRP`, empile `() => scan(ev)` dans `pendEv` : la condition est évaluée au prochain `flush()`, avec l'état de ce moment-là.

Le hook ne tourne que si `TRIG` (un piège a une condition de `NEWC`, ou un ultime a un `udecl`), calculé une fois sur les deux decks entiers. Il voit la première écriture d'une ligne : les lignes capturées puis remises par `J.push` (« évite la mort ») n'y repassent pas. Les faits portent des noms à part (`soin2`, `ult`, `atk`) : aucune condition ancienne ne les reconnaît, et leurs scans différés sont sans effet pour elles.

Le moteur TS n'a pas de journal : il classe l'**événement** au moment où il est **émis** (`emit`, y compris pendant un `hold` ; jamais à la libération, qui passe par `deliver`). Le classement (`TRIGGER_FACT`, `mechanics/triggers.ts`) se déduit de la ligne que la projection produit pour chaque événement, et `tools/iso/src/triggers.test.ts` le compare au `trig` du legacy, événement par événement.

### État global au combat

`tour`, `rv` (soin compté comme réanimation), `SRC` (origine de l'effet en cours : magie, piège, ultime, passif), `PCH` (profondeur de chaîne de pièges, plafonnée à 3), `EXEC` (exécution en cours, ignore « évite la mort »), `NOREV` (dégâts de détonation ou de missile : pas de réanimation ; remis à 0 après chaque appel, jamais restauré). Ce sont des variables de closure modifiées et restaurées à la main autour des appels.

## Bizarreries à conserver (corrections après l'iso)

- Effets perso : l'admin crée un effet en saisissant un libellé, et la clé est fabriquée à partir de ce libellé (`'perso_' + slug`, formulaire `#fe` de l'admin dans `index.html`). Le moteur exécute un effet perso seulement si sa clé contient `etourd` (`canon`, `canonP`), avec `val` comme chance si `chance` est vide. Tous les autres effets perso n'ont aucun effet en combat. Le libellé décide donc du comportement. Exemple réel : la carte 29 « Toile de l'Araignée Humanoide », `{"type": "perso_a_une_chance_x_d_etourdir_la_cible", "val": 50}`. Correction prévue après l'iso : une correspondance explicite au lieu de la regex sur le libellé.

- Code mort : `const MAXP = reg.maxProlong ?? 3`. `reg` vaut `{...REG, ...opt.regles}` et `REG.maxProlong` vaut 3, donc le `?? 3` n'est jamais atteint. Le run d'iso l'a confirmé : muter ce `3` ne change aucun combat.

- Attaque de base à détonation (`atk_detonation`) : le journal annonce « L'attaque de X peut maintenant undefined (50 %) ». La table des verbes de `fx` n'a pas d'entrée `detonation` ; le moteur TS reproduit le texte (`ATTACK_EFFECT_VERBS`, `packages/journal`).

- Description du souffle (site) : un statut inconnu s'affiche « Souffle undefined) : … » (`{…}[el]+')'` ne retombe jamais sur la valeur par défaut). `packages/describe` le reproduit.

- Description de la programmation (site) : une brique `null` dans `passifs` ou `ultimes` fait planter la description (pas de filtre), comme sur l'ancienne page.

Cette liste est incomplète. Je la complète pendant la réécriture.

## « Tour » a deux sens

1. **Le tour d'une carte** : une carte agit une fois (début, ultime, attaque, statuts, fin). L'écran l'affiche sous la forme `Tour N`, numéroté en continu : `base + (tour − 1) × 2 + oi + 1`, de 1 à 20 par manche, et la numérotation continue pendant les prolongations. `legacy/docs/workflow-combat.md` suit ce sens (« Tour 1 = 1er joueur, Tour 2 = 2e joueur »).
2. **La variable `tour` du moteur** : un passage où chaque carte joue une fois, de 1 à `maxTours` (10) par manche. Les champs des cartes l'utilisent : `apres_tours` et `delai_tours` (ultime), `every` (passifs), `atq_tours` et `pv_tours`, et `maxTours` lui-même.

Comme chaque carte joue exactement une fois par passage, la variable `tour` est égale au nombre de tours que la carte a joués dans la manche. Les deux comptes ne divergent donc pas en comportement. La confusion se voit sur le nommage et à l'écran : un ultime « après 3 tours » se déclenche quand l'écran affiche `Tour 5` ou `Tour 6`, selon qui joue en premier.

Une note précédente classait `tour % X` comme une bizarrerie de comportement. C'était faux, l'équivalence ci-dessus l'explique.

## Correspondance des noms (legacy → moteur TS)

Pour lire `legacy/moteur-combat.js` et `packages/engine/src/` côte à côte. Les clés des données (cartes, règles, journal) ne changent pas : seuls les noms internes changent.

| Legacy | TS | Où |
|---|---|---|
| `simuler()` | `simulate()` (moteur) et `simuler()` (journal) | `simulate.ts`, `packages/journal` |
| `S`, `s.card` / `s.mag` / `s.pie` | `c.sides`, `fighter` / `magic` / `trap` | `combat/state.ts` |
| `pv`, `max`, `atq` | `hp`, `maxHp`, `atq` | `Side` |
| `pl`, `uh` (`u`, `last`, `src`) | `passives`, `ultimates` (`effect`, `lastRound`, `copiedFrom`) | `Side` |
| `magOn`, `pieOn`, `decl`, `pbl` | `magicActive`, `trapActive`, `trapTriggers`, `trapBlocked` | `Side` |
| `magAnn`, `magAnnT`, `magNew`, `magVol` | `magicCancelStage`, `magicCancelTurns`, `magicNeverActed`, `magicStolen` | `Side` |
| `mdelta` | `magicDeltas` | `Side` |
| `cum`, `coups`, `rt`, `pend` | `damageDealt`, `attacks`, `hitsTaken`, `cardActivated` | `Side` |
| `st` | `status` | `Side` |
| `st.cl`, `st.cret` | `atqLostToCurses`, `curseReturns` | `Status` |
| `st.fat`, `st.rage`, `st.hots` | `fatigues`, `rages`, `regens` | `Status` |
| `st.frost`, `st.fract`, `st.dots`, `st.bleeds`, `st.curses` | `frosts`, `fractures`, `dots`, `bleeds`, `curses` | `Status` |
| `st.stun`, `st.skip`, `st.dbl`, `st.solide` | `stunTurns`, `nextAttackCancelled`, `doubleDamageTurns`, `solidTurns` | `Status` |
| `st.marques`, `st.mseuil` | `executionMarks`, `executionThreshold` | `Status` |
| `st.joues`, `st.trA`, `st.transc` | `turnsPlayed`, `transcendence`, `transcendenceLevel` | `Status` |
| `st.atkfx`, `st.esqb`, `st.ren`, `st.insens`, `st.prog` | `attackEffects`, `dodgeBonus`, `reflects`, `trapImmunityTurns`, `delayedDamages` | `Status` |
| `st.vols`, `st.volDiff`, `st.pvol` | `timedThefts`, `deferredThefts`, `theftPassivesUsed` | `Status` |
| `st.av`, `st.avaleur`, `st.avale`, `st.repos` | `swallowMarks`, `swallowedBy`, `swallowing`, `digestTurns` | `Status` |
| `st.evite`, `st.mortUsed`, `st.bonus` | `avoidDeathCharges`, `magicAvoidDeathUsed`, `counterBonus` | `Status` |
| `st.pcnt`, `st.rUsed`, `st.reanL`, `st.purs` | `purificationUses`, `usedReviveSources`, `grantedRevives`, `scheduledPurifications` | `Status` |
| `tour`, `manche`, `rv`, `SRC`, `PCH`, `EXEC` | `c.round`, `period` (variable locale de `simulate.ts`), `c.reviving`, `c.source`, `c.trapChainDepth`, `c.executing` | `combat/combat.ts` |
| `pendRev`, `pendEv`, `flush`, `over` | `pendingRevives`, `pendingEffects`, `flush`, `over` | `combat/combat.ts` |
| `L(t, txt, o)` | `emit(c, domainEvent)` | `combat/combat.ts`, `events.ts` |
| `fx`, `effetAlea` | `applyEffect` (le registre des règles d'effet, assemblé depuis les mécaniques), `randomEffect` | `combat/effects.ts`, `mechanics/random.ts` |
| `poolAlea`, `poolPassifs` ; le `lib` d'un effet tiré par une programmation sans liste | `randomEffectPool`, `randomPassivePool` ; `Programming.drawn` (la clé du tirage, que le journal traduit en nom) | `mechanics/random.ts`, `mechanics/programming.ts` |
| `dmg`, `heal`, `reanSrc`, `flushRev` | `damage`, `heal` ; `avoidDeath` ; `reviveSource`, `flushRevives` | `combat/damage.ts` ; `mechanics/avoid-death.ts` ; `mechanics/revive.ts` |
| `scan` | `scan` | `combat/traps.ts` |
| `trig`, `TRIG` / `TRP`, `NEWC`, `h.trg` | `noticeTrigger` (classement : `TRIGGER_FACT`), `c.triggers` (`any` / `traps`), `FACT_CONDITIONS`, `slot.triggered` | `mechanics/triggers.ts`, `combat/combat.ts` |
| `tikUn`, `maudire`, `saigner`, `dotUn`, `fatiguer`, `geler`, `fracturer`, `purifier`, `solidifier` | `tickDot` / `tickBleed` / `tickCurse`, `curse`, `bleed`, `damageOverTime`, `fatigue`, `freeze`, `fracture`, `purify`, `solidify` | un module par statut dans `mechanics/` (`dot.ts`, `bleed.ts`, `curse.ts`, `fatigue.ts`, `frost.ts`, `fracture.ts`, `purification.ts`, `solidification.ts`) |
| `voler`, `rendre`, `undo` | `steal`, `giveBack`, `undoMagic` | `mechanics/theft.ts` |
| `marquerAv`, `avaler`, `transfertAv`, `macher`, `recracher` | `markSwallow`, `swallow`, `transferStatuses`, `chew`, `spitOut` | `mechanics/swallow.ts` |
| `marquer`, `executer` | `mark`, `execute` | `mechanics/execution.ts` |
| `porterTransc`, `transcender` | `armTranscendence`, `transcend` | `mechanics/transcendence.ts` |
| `attaque` | `attack` : le squelette (portes, nombre de coups, boucle des coups) ; les étapes, dans leurs mécaniques | `combat/moments.ts`, `combat/attack.ts` |
| `debutTour`, `ultime`, `passifsTour`, `statutsCarte`, `finTourCarte` | `startTurn`, `ultimate`, `everyTurn`, `endOfTurnEffects`, `endTurn` : des listes ordonnées d'étapes ; `ultimate` dans `mechanics/ultimates.ts` | `combat/moments.ts` |

Champs du legacy supprimés parce qu'ils sont écrits mais jamais lus : `s.ult`, `s.uses`, `s.last` (au niveau de la carte), `st.pg`. Leur suppression ne change aucune sortie.
