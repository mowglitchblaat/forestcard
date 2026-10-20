# Glossaire

Pont entre les clés des données (en base, en français, contrat inchangé), les identifiants du code (en anglais) et le sens dans le jeu. Tout nouveau terme entre ici dans le même changement que le code qui l'introduit.

## Structure d'un combat

```
combat
└─ manche          la 1re, puis jusqu'à 3 prolongations
   └─ round 1..10  chaque carte joue une fois
      └─ tour      une carte agit
```

| Terme du jeu | Clé en base / legacy | Identifiant TS | Sens |
|---|---|---|---|
| combat | `simuler()` | `simulate()` (moteur), `simuler()` (`@forestcard/journal`, signature legacy) | un affrontement complet entre deux joueurs, jusqu'au KO ou à la fin de la dernière manche |
| manche | `manche` | `period` (`simulate.ts`) | la 1re manche, puis chaque prolongation. Au début d'une prolongation, chaque joueur tire un nouveau trio |
| round | variable `tour` du legacy ; champ `tour` de chaque ligne du journal ; règle `maxTours` | `c.round` (contexte de combat) ; la règle garde sa clé `maxTours` (contrat) | un passage où chaque carte joue une fois. 10 rounds par manche |
| tour | lignes `t: 'tour'` du journal (« Tour N »), dont le serveur compte le nombre (`tours` de l'historique) ; champs `apres_tours`, `delai_tours`, `tours`, `every` | `turn` (événement `turnStarted`), `turnsPlayed` | une carte agit une fois : début de tour, ultime, attaque, effets « à chaque tour », statuts, fin de tour. Les durées « X tours » se comptent en tours de la carte concernée. Les champs d'ultime et de passif (`apres_tours`, `delai_tours`, `every`) sont comparés au numéro de round (`c.round`, de 1 à 10, remis à 1 à chaque manche) ; comme chaque carte joue une fois par round, c'est le nombre de tours qu'elle a joués dans la manche |

⚠ Pendant la réécriture iso, l'écran et le journal affichent encore `Tour N`, N étant le numéro du tour compté en continu : 1 à 20 dans la première manche, puis 21 à 40 dans la première prolongation, sans remise à zéro. Après l'iso, l'affichage passera à `Round r`.

## Cartes et emplacements

| Terme | Clé | Identifiant TS | Sens |
|---|---|---|---|
| combattant | `type: 'combattant'` | `fighter` | la carte qui se bat (ATQ, PV, passifs, ultime) |
| magie | `type: 'magie'` | `magic` | effet joué au début de la manche ; annulable, destructible, volable |
| piège | `type: 'piege'` | `trap` | effet caché, déclenché par une condition (`condition`), au plus `declenchements` fois |
| trio | — | — | le combattant, la magie et le piège tirés dans un deck pour une manche |
| deck | `sauver_deck`, `mes_decks` (`cartes`) | `SavedDeck` (`apps/web`) | 10 cartes différentes du joueur : au moins 3 combattants, 3 magies, 3 pièges, la dixième libre. Un joueur garde jusqu'à 10 decks nommés ; un deck enregistré peut être incomplet |
| deck de combat | table `deck` (`carte_id`), écrite par `enregistrer_deck` | `combatDeckId`, `setCombatDeck` (`apps/web`) | le deck que les combats du joueur utilisent ; doit être complet. Sur le site, c'est une marque portée par l'un des decks nommés (pas « en combat », qui se lirait comme un combat en cours) |
| passif | `passif` (objet ou `{ briques }`) | `passives` | règle permanente du combattant |
| ultime | `ultime` | `ultimates` (emplacements : le sien, volé ou copié) | effet déclenché après X tours (`apres_tours`), quand une carte s'active (`sur_carte` : un piège qui se déclenche, une magie qui revient, un vol ; pas la magie du début du combat) ou par un déclencheur (`udecl`, voir « Déclencheurs d'ultime »), avec délai et nombre d'utilisations |
| brique | `briques` | — | un effet élémentaire ; un effet composé est une liste de briques |
| effet perso | `type: 'perso_…'` | `canonEffect`, `canonPassive` | effet créé dans l'admin. Exécuté seulement si sa clé contient `etourd` (comme un étourdissement), sinon texte seul |

## Stream et économie (edge function)

Termes du serveur (`apps/edge`, code legacy repris tel quel) : pas d'identifiant TS.

| Terme | Clé / commande | Sens |
|---|---|---|
| combat gratuit | `!combat`, mode `quotidien` | combat contre un adversaire tiré au hasard ; nombre par jour réglable (Admin > Réglages) |
| duel | mode `payant` | combat contre un joueur précis (`@pseudo`), payant |
| gains | `gain_victoire`, `gain_defaite`, `gain_nul` | gold reçu à la fin d'un combat (`recompenses` dans le journal) |
| multiplicateur | `multiplicateur_gains`, `multiplicateur_fin` | multiplie les gains (×10 au plus) jusqu'à une heure de fin facultative : les soirées spéciales |
| bounty | `bounty_actif`, `bounty_min`, `bounty_max`, `bounty_chance`… | prime aléatoire qui apparaît à la fin d'un combat avec une certaine chance, partagée entre les joueurs (le gagnant en prend la plus grosse part, parfois tout) ; s'ajoute aux gains |
| booster quotidien | `!quotidien`, mode `booster_quotidien` | 1 à 3 boosters offerts une fois par jour |
| dos | `dos` (joueur) | le dos de carte choisi par le joueur, montré par l'overlay ; `Player.dos` dans le moteur, qui le transmet sans l'utiliser |

## Effets (magies, ultimes, contenu des pièges)

Clés de `EFFECT_TYPES`, exécutées par `applyEffect` (`packages/engine/src/combat/effects.ts`) selon la règle que déclare leur mécanique. `cible` / `ciblem` : `soi` ou `adversaire`. `u` : unité de `val`, `pct` (pourcent d'une stat) ou `pts`.

| Clé | Sens | Mécanique (`packages/engine/src/mechanics/`) |
|---|---|---|
| `atq_mod` | ATQ ± valeur | `stats.ts` |
| `pv_mod` | PV max ± valeur (les PV suivent) | `stats.ts` |
| `soin` | soin immédiat | `healing.ts` |
| `soin_tours` | régénération : soin au début de chaque tour, pendant X tours | `healing.ts` |
| `degats` | dégâts directs | `direct-damage.ts` |
| `vol_vie` | dégâts directs, puis soin du même montant | `life-steal.ts` |
| `degats_tours` | dégâts différés, infligés après X tours de la cible | `direct-damage.ts` |
| `double_degats` | dégâts de l'attaque doublés pendant X tours | `double-damage.ts` |
| `renvoi` | renvoie X % des dégâts reçus pendant X tours | `reflect.ts` |
| `annule_attaque` | la prochaine attaque de l'adversaire est annulée : elle n'a pas lieu (ni dégâts, ni statuts, ni marques) | `block.ts` |
| `bloque_attaque` | la prochaine attaque de l'adversaire est **bloquée** : elle a lieu et touche, à 0 dégât, mais ses statuts et ses marques (exécution, avalage) s'appliquent ; bloque aussi son prochain souffle ou missile | `block.ts` |
| `detonation` | **détonation** : fait exploser la brûlure, le poison et le saignement de la cible (`conso` % de leurs dégâts restants, 100 par défaut, + `bonus` %, 50 par défaut, + `val` dégâts bruts) ; moitié des dégâts des statuts contre une carte solidifiée ; le détonateur subit `recul` % du souffle ; une carte tuée ne peut pas être réanimée (« réduite en cendres ») | `detonation.ts` |
| `missiles` | tire `frappes` missiles (3 par défaut) ; chacun explose (une détonation avec `val` dégâts bruts), puis peut poser un statut (`mstatut`, `aleatoire` : tiré à chaque missile). Esquivé : il explose à côté, les deux cartes subissent le souffle (`val` × `recul` %) ; bloqué : pas d'explosion, le statut passe ; renvoyé par le renvoi de dégâts : il explose sur le tireur | `detonation.ts` |
| `insensible_piege` | les pièges adverses se déclenchent sans effet pendant X tours | `trap-immunity.ts` |
| `annule_magies` | annule la magie adverse (`tours` à 0 ou vide : jusqu'à la fin du combat) | `magic-cancel.ts` |
| `detruire` | détruit la magie ou le piège adverse (`carte`) | `cards.ts` |
| `voler` | vole la magie ou le piège adverse, tout de suite ou au début du tour X (`tourdecl`), pour `duree` tours ou tout le combat | `theft.ts` |
| `equiper` | équipe une autre magie ou un autre piège du deck | `cards.ts` |
| `echange_atq` | échange les ATQ des deux cartes | `stats.ts` |
| `echange_pv` | échange les PV (et PV max) des deux cartes | `stats.ts` |
| `echange_tout` | échange ATQ et PV | `stats.ts` |
| `echange_atq_def` | échange l'ATQ et les PV d'une même carte (l'adversaire par défaut) | `stats.ts` |
| `malediction` | l'ATQ baisse à chaque début de tour, puis revient petit à petit | `curse.ts` |
| `saignement` | X % des PV max perdus en fin de tour, soins réduits | `bleed.ts` |
| `poison_effet` | dégâts fixes en fin de tour | `dot.ts` |
| `brulure_effet` | X % des PV max en fin de tour | `dot.ts` |
| `gel` | chance d'attaque annulée et d'étourdissement | `frost.ts` |
| `fracture` | chance de se blesser en attaquant ; brise la solidification | `fracture.ts` |
| `fatigue` | ATQ baissée pendant X tours, rendue ensuite | `fatigue.ts` |
| `rage` | dégâts en plus par coup pendant X tours, puis fatigue | `rage.ts` |
| `etourdir_effet` | étourdit la cible pendant X tours ; `essais` jets de chance, le premier succès suffit ; sans effet sur une carte solidifiée | `stun.ts` |
| `souffle` | dégâts, puis chance de poser un statut élémentaire (`statut` ; `aleatoire` : tiré à chaque souffle) ; `rechance` % de souffler encore, jusqu'au premier échec, `remax` souffles en plus au maximum (3 par défaut). Esquivable, blocable et réductible ; le renvoi ne renvoie que les dégâts | `breath.ts` |
| `purification` | retire les statuts négatifs (sauf l'étourdissement), rend l'ATQ perdue ; éventuellement répétée | `purification.ts` |
| `solidification` | X % de chances d'être insensible à l'étourdissement pendant X tours adverses | `solidification.ts` |
| `mort_evitee` | évite la mort une fois (reste à 1 PV). En magie, lue par `damage` sous condition (`cond` : `aucune`, `pv_max`, ou dégâts infligés ≥ `seuil`) ; en ultime ou en piège, donne une charge | `avoid-death.ts` |
| `reanimation` | revient avec X % des PV max après la mort (une fois) | `revive.ts` |
| `execution` | l'attaque peut poser des marques d'exécution | `execution.ts` |
| `execution_direct` | pose X marques d'exécution | `execution.ts` |
| `transcendance` | trois niveaux, aux tours X, 2X, 3X : purifiée, ATQ et PV max en hausse, vol de vie | `transcendence.ts` |
| `programmation` | donne le passif `programmation` à la carte qui la joue jusqu'à la fin du combat (`chance` 50 et `nbpassif` 2 par défaut, tirage parmi tous les passifs et ultimes du jeu) ; une magie qui part (annulée, détruite, volée) reprend le passif, ce qui est déjà programmé reste | `programming.ts` |
| `atk_avalage` | l'attaque peut préparer un avalage | `swallow.ts` |
| `marque_avalage` | pose la fourchette (et le couteau) d'avalage | `swallow.ts` |
| `vol_ultime` | vole l'ultime adverse | `ultimates.ts` |
| `copie_ultime` | copie l'ultime adverse (il le garde) | `ultimates.ts` |
| `reset_ultime` | l'ultime redevient utilisable | `ultimates.ts` |
| `esquive_mod` | esquive ± X % | `dodge.ts` |
| `aleatoire` | tire un effet au hasard parmi 45 (`POOL`), une ou plusieurs fois | `random.ts` |
| `atk_fatigue`, `atk_detonation`, `atk_enchainement`, `atk_brulure`, `atk_poison`, `atk_etourdir`, `atk_saignement`, `atk_malediction`, `atk_fracture`, `atk_gel` | donnent à l'attaque de base le passif du même nom (sans `atk_`) (retiré avec la magie si elle est annulée ou détruite) | `attack-effects.ts` |

## Passifs

Clés de `PASSIVE_TYPES`, lues par le moteur au moment indiqué.

| Clé | Sens | Mécanique (`packages/engine/src/mechanics/`) |
|---|---|---|
| `esquive` | X % de chances d'esquiver chaque frappe (cumul plafonné à 75 %) | `dodge.ts` |
| `reduc_degats` | X % de chances de réduire les dégâts reçus | `block.ts` |
| `renvoi` | renvoie une part des dégâts reçus | `reflect.ts` |
| `multi_frappe` | X % de chances de frapper plusieurs fois | `strikes.ts` |
| `enchainement` | X % de chances d'une frappe de plus, retentée jusqu'à l'échec (10 au plus par défaut) | `strikes.ts` |
| `vol_pct_atq` | X % de chances de se soigner d'une part des dégâts infligés | `life-steal.ts` |
| `etourdir` | X % de chances d'étourdir à chaque coup | `stun.ts` |
| `brulure`, `poison`, `saignement`, `malediction`, `fracture`, `gel`, `fatigue` | X % de chances de poser ce statut à chaque coup | `dot.ts`, `bleed.ts`, `curse.ts`, `fracture.ts`, `frost.ts`, `fatigue.ts` |
| `execution` | X % de chances de poser une marque d'exécution à chaque coup, avec le coup, avant ses dégâts ; à 3 marques, un coup qui laisserait la cible sous le seuil **est** l'exécution (« évite la mort » ne se déclenche pas, la réanimation reste possible). **Statut marquant** (`statmarque` : `saignement`, `brulure`, `poison`, `tous` ; `chancemarque` %), sur toutes les formes de l'exécution : la carte marquée garde jusqu'à la fin du combat X % de chances de recevoir une marque à chaque dégât de ce statut (le plus haut % est gardé) | `execution.ts` |
| `avalage` | fourchette, couteau, puis avalage à la 3e attaque réussie | `swallow.ts` |
| `bonus_frappe` | frappé X fois depuis son dernier tour : prochaine attaque renforcée | `counter.ts` |
| `solidification` | à chacun de ses tours, X % de chances de se solidifier | `solidification.ts` |
| `voler` | vole une fois la magie ou le piège adverse au tour X | `theft.ts` |
| `transcendance` | transcendance tenue dès le début du combat | `transcendence.ts` |
| `aleatoire` | effet aléatoire tous les X tours | `random.ts` |
| `soin_tour` | soin à chaque tour | `healing.ts` |
| `atq_tours`, `pv_tours` | ATQ / PV max en hausse tous les X tours | `stats.ts` |
| `purification` | purification tous les X tours, X fois au plus, s'il y a un statut à retirer | `purification.ts` |
| `evite_mort` | évite la mort une fois | `avoid-death.ts` |
| `detonation` | à chaque coup, `chance` % de faire détoner les statuts de la cible (comme l'effet `detonation`), avant de poser les nouveaux statuts du coup | `detonation.ts` |
| `programmation` | à chacun de ses tours, avant l'attaque, `chance` % de lancer une programmation. Les `nbpassif` premières sont passives (la carte acquiert au hasard un passif de `passifs` ou un ultime de `ultimes`, qui dort), ensuite 50 % passive / 50 % active. Active : les passifs programmés s'activent pour toujours, et tous les ultimes programmés se lancent. Sans liste (`passifs` et `ultimes` vides), la programmation passive tire au hasard parmi tous les passifs du jeu (50 %) ou tous les ultimes (le pool de l'effet aléatoire), avec des valeurs adaptées aux cartes. `lib` : le nom d'un effet programmé, donné par l'admin | `programming.ts` |
| `reanimation` | revient après la mort (une fois) | `revive.ts` |

## Conditions de piège

Clés de `TRAP_CONDITION_TYPES`, évaluées par `scan` (`packages/engine/src/combat/traps.ts`) à chaque événement du combat.

| Clé | Le piège se déclenche quand… |
|---|---|
| `adv_attaque` | l'adversaire a attaqué N fois, puis toutes les N attaques (`coups`) |
| `adv_ultime` | l'adversaire lance son ultime |
| `proprio_pv_sous` | son propriétaire passe sous X % de PV (`seuilpv`) |
| `adv_pv_bas` | l'adversaire passe sous X % de PV |
| `adv_soigne` | l'adversaire se soigne |
| `proprio_soigne` | son propriétaire se soigne |
| `proprio_meurt` | son propriétaire va mourir (avant la réanimation ; un piège « évite la mort » passe en premier) |
| `proprio_statut` | son propriétaire reçoit un statut négatif (brûlure, poison, saignement, malédiction, gel, fatigue, étourdissement, fracture) |
| `adv_statut` | l'adversaire reçoit un statut négatif |
| `proprio_esquive` | son propriétaire esquive (attaque, souffle ou missile) |
| `adv_esquive` | l'adversaire esquive |
| `proprio_attaque` | son propriétaire a attaqué N fois, puis toutes les N attaques (`coups`) |
| `proprio_coup_fort` | son propriétaire subit au moins X dégâts en un coup (`seuildeg` ; poison, brûlure et saignement ne comptent pas) |
| `adv_piege` | le piège de l'adversaire se déclenche |
| `tour_n` | le tour N du combat commence (`ntour`, numéro affiché « Tour N », prolongations comprises) |
| `proprio_bloque` | son propriétaire bloque (attaque annulée ou bloquée, dégâts réduits, souffle ou missile bloqué) |
| `proprio_ultime` | son propriétaire lance un ultime (programmé compris) |

Les dix dernières conditions lisent des **faits** (`mechanics/triggers.ts`) : le moteur les relève à l'émission de chaque événement, et le scan du piège attend le prochain `flush`.

## Déclencheurs d'ultime

Clés de `ULTIMATE_TRIGGER_TYPES`, dans le champ `udecl` de l'ultime, avec leur X dans `udx`. Elles s'ajoutent à `apres_tours` et `sur_carte` (l'ultime part si l'une des conditions tient), dans les mêmes limites (`delai_tours`, `utilisations`).

| Clé | L'ultime part… | X par défaut |
|---|---|---|
| `pv_sous` | au début de son tour, si sa carte est sous X % de PV | 50 |
| `adv_pv_sous` | au début de son tour, si l'adversaire est sous X % de PV | 50 |
| `coups_recus` | à son prochain tour après la X-ième attaque de l'adversaire (puis toutes les X) | 1 |
| `attaques` | à son prochain tour après sa X-ième attaque (puis toutes les X) | 1 |
| `coup_fort` | après un coup d'au moins X dégâts reçu (hors poison, brûlure, saignement) | 1 |
| `statut` | après un statut négatif reçu | — |
| `esquive` | après une esquive | — |
| `bloque` | après un blocage | — |
| `soigne` | après un soin reçu | — |
| `son_piege` | après le déclenchement de son piège | — |
| `piege_adv` | après le déclenchement du piège adverse | — |
| `adv_ultime` | après un ultime de l'adversaire | — |

Un déclencheur d'événement pose un drapeau sur l'emplacement d'ultime (`triggered`) ; l'ultime part au prochain passage de `ultimate`, au tour de sa carte, et le drapeau retombe. Un ultime volé ou copié arrive sans drapeau.

## Statuts (état interne)

Noms des statuts dans l'état du moteur (`Status`, `packages/engine/src/combat/state.ts`) ; la correspondance avec les noms abrégés du legacy est dans `docs/legacy/moteur.md`.

| Statut | Identifiant TS | Événement de fin |
|---|---|---|
| malédiction | `curses`, `curseReturns`, `atqLostToCurses` | `statusEnded: 'curse'` |
| saignement | `bleeds` | `statusEnded: 'bleed'` |
| brûlure, poison | `dots` (`kind: 'brûlure' \| 'poison'`) | `statusEnded: 'burn' \| 'poison'` |
| gel | `frosts` | `statusEnded: 'frost'` |
| fracture | `fractures` | `statusEnded: 'fracture'` |
| fatigue | `fatigues` | `statusEnded: 'fatigue'` |
| rage | `rages` | `statusEnded: 'rage'` |
| étourdissement | `stunTurns` | `statusEnded: 'stun'` |
| attaque bloquée | `nextAttackBlocked` (legacy : `blk`) | consommée par la prochaine attaque, souffle ou missile ; retirée par une purification |
| solidification | `solidTurns` | `statusEnded: 'solid'` |
