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
| combat en relais | règle `equipe` (combattants par joueur, 3) ; ligne `t: 'relais'` du journal (`c`, `n`, `of`, `joueurs`), `equipe` sur la ligne `debut` ; statut `k: 'epuise'` | `simulateRelay()` (`relay.ts`), `simulerRelais()` (`@forestcard/journal`) ; événements `fighterEntered`, `fighterExhausted` ; `RELAY_ROUND_CAP` | le combat du championnat : jusqu'à 3 combattants par joueur, l'un après l'autre. Quand un combattant tombe, son joueur envoie le suivant avec un nouveau trio (combattant, magie, piège ; une carte déjà jouée n'est pas retirée), qui joue en premier ; seule sa magie est révélée. Le survivant garde PV, statuts, magie et piège joués ; ses ultimes repartent à zéro. Pas de limite de rounds : chaque duel va jusqu'au KO (garde-fou : après 60 rounds sans KO, le combattant le plus entamé tombe, épuisé). Gagne celui qui a encore un combattant debout |
| Basique | `cartes.collection_id` vide | — (`COMMON` dans `apps/web`) | le groupe des cartes sans collection, qui sortent dans tous les boosters (`18-communes-partout.sql`) ; appelé « Basique » sur le site, le catalogue et la boutique (avant : « Communes »). À ne pas confondre avec la rareté commune |
| ceinture, championnat | tables `ceintures`, `regnes`, `defis_titre`, `decks_championnat` (`33-championnat.sql`) ; divisions `rare`, `epique`, `libre` ; modes `defi`, `accepter`, `refuser`, `ceintures` de swift-responder | — (hors moteur : base, edge, site) | trois titres, un champion chacun, vacants au lancement. Deck de championnat : 15 cartes, 5 combattants, 5 magies, 5 pièges ; Rare : cartes communes et rares, Épique : jusqu'à épique, Libre : toutes. Un défi (un seul en attente par ceinture, 24 h pour répondre) se lance et se joue uniquement en live (!defi puis !accepter dans le chat), jamais depuis le site (qui permet seulement de refuser un défi), en combat en relais ; 500 gold au vainqueur, 150 au perdant ; un challenger a droit à un combat pour le titre par jour et par ceinture (`34-titre-par-ceinture.sql`), le champion défend sa ceinture sans limite par jour (`35-champion-sans-limite.sql`) ; un match nul ne compte pas dans cette limite, ni une défense de sa ceinture : un champion détrôné peut redéfier le jour même (`41-titre-nul-et-defense.sql`). Jeu en pause : les 7 jours et les 24 h d'un défi sont arrêtés. Primes verrouillées (réglage `titre_primes_verrou`, Admin > Réglages, `42-primes-verrou.sql`), pour les jours sans live : une journée verrouillée sans combat pour le titre ne paie pas de prime mais garde la série, et les compteurs sont arrêtés comme en pause. Pas de spoil : tant que l'animation d'un combat pour le titre n'est pas finie à l'écran, l'onglet Ceintures et !ceintures montrent la ceinture comme avant le combat (`37-ceintures-sans-spoil.sql`). Prime : à chaque minuit d'une journée de règne avec un combat pour le titre, 90 gold par ceinture, +10 % par journée active consécutive (une journée sans : pas de prime, la série repart de zéro), +15 % par ceinture détenue en plus. Le champion perd sa ceinture s'il perd, à son 3e refus, ou après 7 jours sans combat pour le titre ; une ceinture vacante va au vainqueur du premier combat pour elle. Overlay : un combat pour le titre s'annonce par un bandeau doré (ceinture en jeu, champion qui défend ou ceinture vacante) au centre de l'écran, qui reste ensuite en haut et annonce à la fin qui repart avec la ceinture ; en relais, les pastilles des combattants restants ont leur propre ligne sous le pseudo |
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
| écriteau | `cadres/ecriteau-<rareté>.png` ; `variantes_carte.compo` | `plaqueLines` (`packages/describe/src/plaque.ts`) | la bande d'une carte combattant où sont écrits l'ultime (1re ligne) et les passifs, avec un nom court par effet |
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
| `bloque_attaque` | la prochaine attaque de l'adversaire est **bloquée** : elle a lieu et touche, à 0 dégât, mais ses statuts et ses marques (exécution, avalage) s'appliquent ; bloque aussi son prochain souffle ou missile. Options : `nbbloque`, seuls les X premiers coups de l'attaque sont bloqués (vide ou 0 = toute l'attaque) ; **riposte** (`riposte`), une fois, au 1er coup bloqué : `renvoi`, `pctriposte` % des dégâts bloqués renvoyés à l'attaquant, ou `statut`, le statut `rstatut` (brûlure, gel, malédiction, poison, saignement, fatigue, étourdissement ou aléatoire ; `sval`, `tours`, `reducsoin`) infligé à l'attaquant ; `chance` % (100 si vide). Événement `blockRiposte`, ligne `k: 'riposte'` | `block.ts` |
| `detonation` | **détonation** : fait exploser la brûlure, le poison et le saignement de la cible (`conso` % de leurs dégâts restants, 100 par défaut, + `bonus` %, 50 par défaut, + `val` dégâts bruts) ; moitié des dégâts des statuts contre une carte solidifiée ; le détonateur subit `recul` % du souffle ; une carte tuée ne peut pas être réanimée (« réduite en cendres ») | `detonation.ts` |
| `missiles` | tire `frappes` missiles (3 par défaut) ; chacun explose (une détonation avec `val` dégâts bruts), puis peut poser un statut (`mstatut`, `aleatoire` : tiré à chaque missile). Esquivé : il explose à côté, les deux cartes subissent le souffle (`val` × `recul` %) ; bloqué : pas d'explosion, le statut passe ; renvoyé par le renvoi de dégâts : il explose sur le tireur | `detonation.ts` |
| `insensible_piege` | les pièges adverses se déclenchent sans effet pendant X tours | `trap-immunity.ts` |
| `annule_magies` | annule la magie adverse (`tours` à 0 ou vide : jusqu'à la fin du combat) | `magic-cancel.ts` |
| `detruire` | détruit la magie ou le piège adverse (`carte`) | `cards.ts` |
| `voler` | vole la magie ou le piège adverse, tout de suite ou au début du tour X (`tourdecl`), pour `duree` tours ou tout le combat ; un piège volé garde ses déclenchements (déjà utilisé, il ne se redéclenche pas chez le voleur) | `theft.ts` |
| `equiper` | équipe une autre magie ou un autre piège du deck | `cards.ts` |
| `echange_atq` | échange les ATQ des deux cartes | `stats.ts` |
| `echange_pv` | échange les PV (et PV max) des deux cartes | `stats.ts` |
| `echange_tout` | échange ATQ et PV | `stats.ts` |
| `echange_atq_def` | échange l'ATQ et les PV d'une même carte (l'adversaire par défaut) ; ses PV max deviennent ses nouveaux PV (5 ATQ → 5/5 PV) | `stats.ts` |
| `malediction` | sans niveau : −3 d'ATQ (tableau des niveaux, `malediction`) au début du tour de la carte maudite, pendant `tours` de ses tours, puis l'ATQ revient. Elle ne s'aggrave pas d'elle-même ; une autre malédiction ajoute ses −3, avec sa propre durée | `curse.ts` |
| `saignement` | **à niveaux** : % des PV max perdus en fin de tour et soins réduits, selon le niveau | `bleed.ts` |
| `poison_effet` | **à niveaux** : dégâts fixes en fin de tour, selon le niveau | `dot.ts` |
| `brulure_effet` | **à niveaux** : % des PV max en fin de tour, selon le niveau ; chaque dégât de brûlure **calcine** des PV max, pour de bon (la purification arrête la brûlure, pas la calcination) : une part de ses dégâts, la même pour toutes les cartes (tableau des niveaux, `calcination`, 100 % par défaut ; l'ancien réglage par carte `calcine` ne compte plus). Posée sur une carte gelée, elle fait fondre la glace d'un niveau avec un choc thermique (un tick tout de suite), et la brûlure part avec la glace | `dot.ts` |
| `glas_effet` | **le Glas**, la mécanique anti-survie : une ombre avance sur la barre de vie de la cible depuis la gauche, d'un % de ses PV max à chaque début de son tour, selon le niveau ; dès que ses PV passent sous l'ombre, elle meurt, sans évite la mort ni réanimation. Relancé, il monte de niveau (III au plus). Une purification brise un de ses 3 crânes et fait reculer l'ombre d'un tiers, la 3e l'efface | `knell.ts` |
| `enracinement` | **enracinement** (rework d'octobre 2026), un statut à trois variantes (`variante`), sans niveau : **épineux** (chaque frappe que porte la carte enracinée, qu'elle touche ou non, lui inflige `val` dégâts directs, 5 si vide), **empoisonné** (chaque frappe qu'elle porte l'empoisonne : poison de niveau `niveau`, I si vide, pendant `ptours` tours, 2 si vide), **inhibiteur** (ses ultimes ne se lancent pas tant qu'il dure : un ultime qui arrive attend, puis se lance dès la fin). Des variantes différentes cohabitent ; la même variante reposée garde la plus longue durée et les plus fortes valeurs. Purifié, pris par la brume, prolongé par la contamination | `rooting.ts` |
| `contamination` | **contamination** (eau), un amplificateur de statut : sur la carte contaminée, chaque statut négatif dure un tour de plus, ceux déjà là à son arrivée comme ceux qui arrivent pendant qu'elle dure ; reposée, elle prolonge encore d'un tour. Ne prolonge ni l'étourdissement, ni la faiblesse, ni elle-même. Avec une brûlure sur la même carte : **vaporisation** (la brûlure part en vapeur, la contamination reste, la carte est **affaiblie** : +`faiblesse` % de dégâts reçus pendant `faiblesseTours` tours, 25 % et 2 tours par défaut ; la faiblesse ne se purifie pas, une mue la retire). Pas de vaporisation sur une carte gelée : la glace fond et la brûlure part avec elle | `contamination.ts` |
| `cisaillement` | **cisaillement** (Vent) : pose une vague de `lames` lames d'air (1 si vide) de `val` dégâts chacune (10 si vide) sur l'adversaire ; elles frappent ensemble après `tours` de ses tours (2 si vide), en fin de son tour, après les dégâts sur la durée : lames × dégâts, esquivable à ce moment-là. Chaque pose garde sa propre durée. Une marque, pas un statut : ni purifiée, ni prolongée, ni prise par la brume ; une mue la retire | `blades.ts` |
| `marque_foudre` | **marque de foudre** (Foudre) : pose un niveau de marque sur l'adversaire. Niveau I : le prochain coup qu'il reçoit est amplifié (tableau des niveaux, `foudre`, +40 % par défaut), une fois. Niveau II : l'éclair rebondit deux fois, sur sa magie puis sur son piège ; une carte touchée est **chargée**, une carte déjà chargée touchée de nouveau est détruite (un emplacement sans carte vivante laisse passer son rebond) ; puis la marque revient à zéro. La charge reste sur la carte : une magie ou un piège volé la garde. Purifiée, retirée par la mue ; la brume ne la prend ni ne la renvoie | `lightning.ts` |
| `gel` | +1 niveau de gel (3 au plus) : 1 **givre** (`annul` % d'attaque annulée, et autant de points d'esquive en moins), 2 **gelée** (×2,5 pour les deux, 100 % au plus), 3 **glaciation** (n'attaque pas à son tour suivant, puis la glace éclate : `eclat` dégâts, 10 par défaut, et le gel est fini). Chaque gel garde les plus fortes valeurs et relance la durée (`tours`). Une carte solidifiée ne dépasse pas le niveau 2 ; une fracture sur une carte gelée fait éclater la glace ; la purification retire le gel. **Feu contre glace** : geler une carte qui brûle éteint le feu (la brûlure part, aucun gel n'est posé) ; brûler une carte gelée fait fondre la glace d'un niveau et inflige un tick de brûlure tout de suite (choc thermique) | `frost.ts`, `dot.ts` |
| `fracture` | **à niveaux** : chance de se blesser en attaquant et dégâts en % de sa propre ATQ, selon le niveau ; brise la solidification | `fracture.ts` |
| `fatigue` | **à niveaux** : un % de l'ATQ en moins pendant `fattours` tours, rendu ensuite | `fatigue.ts` |
| `rage` | dégâts en plus par coup pendant X tours, puis une fatigue dont le niveau suit l'intensité de la rage (bonus jusqu'à 5 : I ; jusqu'à 12 : II ; plus : III), ou le niveau réglé sur la carte (`fatniv`) | `rage.ts` |
| `etourdir_effet` | étourdit la cible pendant X tours ; `essais` jets de chance, le premier succès suffit ; sans effet sur une carte solidifiée | `stun.ts` |
| `souffle` | dégâts, puis chance de poser un statut élémentaire (`statut` ; `aleatoire` : tiré à chaque souffle) ; `rechance` % de souffler encore, jusqu'au premier échec, `remax` souffles en plus au maximum (3 par défaut). Esquivable, blocable et réductible ; le renvoi ne renvoie que les dégâts | `breath.ts` |
| `purification` | retire les statuts négatifs (sauf l'étourdissement), rend l'ATQ perdue ; éventuellement répétée | `purification.ts` |
| `solidification` | X % de chances d'être insensible à l'étourdissement pendant X tours adverses ; solidifiée, la carte ne prend que la moitié des dégâts de statuts d'une détonation ou d'un missile | `solidification.ts` |
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
| `atk_fatigue`, `atk_detonation`, `atk_enchainement`, `atk_brulure`, `atk_poison`, `atk_etourdir`, `atk_saignement`, `atk_malediction`, `atk_fracture`, `atk_gel`, `atk_glas`, `atk_enracinement`, `atk_contamination`, `atk_cisaillement`, `atk_critique`, `atk_foudre` | donnent à l'attaque de base le passif du même nom (sans `atk_`) (retiré avec la magie si elle est annulée ou détruite). Plusieurs sources du même effet sur une carte (passif + magie, deux magies…) n'en font qu'une : leurs chances s'additionnent (100 % au plus), un seul tirage par coup, et les valeurs (durée, dégâts…) sont celles d'une des sources, tirée au prorata de sa chance, comme pour l'étourdissement (`combat/sources.ts`). Hors enchaînement, où chaque source retente seule | `attack-effects.ts` |
| `atk_headshot` | donne à l'attaque de base le passif `headshot` (chances additionnées avec le passif) | `headshot.ts`, `attack-effects.ts` |
| `ciblage` | **ciblage** (ultime) : `chance` % (100 si vide) de marquer l'adversaire pendant `tours` tours de la carte qui l'a marqué ; chaque coup de cette carte sur lui est un **headshot** (un coup critique, puissance critique commune). `consomme` : la marque saute au premier headshot (`oui` par défaut) ou reste jusqu'à la fin de ses tours (`non`). Une mue la retire | `headshot.ts` |
| `brume` | **brume** : `chance` % (100 si vide) de s'entourer de brume pendant `tours` de ses tours. Niveau 1 : tout statut négatif posé sur la carte (malédiction, saignement, poison, brûlure, gel, Glas, fracture, étourdissement, fatigue, lien parasitaire) se dissipe. Relancée sur une carte déjà embrumée : niveau 2, **vent tourné** : le prochain statut est renvoyé à l'adversaire, puis la brume se dissipe. La fatigue qui suit une rage n'est pas concernée. Une brume de magie part avec la magie | `mist.ts` |
| `lien_parasite` | **lien parasitaire** sur l'adversaire (le porteur) pendant `tours` de ses tours (3 si vide) : `pctlien` % (50 si vide) de chacun de ses soins part chez l'autre carte au lieu de le soigner, et **dans l'autre sens** : la carte qui a posé le lien partage de même ses propres soins avec le porteur (pas ceux que les liens lui apportent). `nbliens` liens posés d'un coup (1 si vide). Les liens sont **indépendants** : chacun a sa part et ses tours, ils se cumulent (ensemble, tout le soin au plus). Un statut négatif : la brume en prend un à la fois, la mue les retire tous | `parasite.ts` |
| `reduc_degats` (effet) | **protection** : pendant `tours` tours de la carte (vide ou 0 : tout le combat), chaque coup, souffle ou missile reçu a `chance` % (100 si vide) d'être réduit de `val` % (ou `val` points avec `u` = `pts`). Plusieurs protections tirent chacune | `guard.ts` |
| `mue_forcee` | **mue forcée** : `chance` % (100 si vide) de faire muer tout de suite la cible (`cible` : soi par défaut, ou l'adversaire), comme une mue : statuts négatifs (étourdissement compris), marques d'exécution, ciblage et liens retirés, et perte de `mueatq` d'ATQ (`uatq`) et `muepv` de PV max (`upv`) ; vides : les valeurs du passif `mue` de la cible, sinon 10 %. Une magie annulée puis revenue ne la rejoue pas | `insect.ts` |

**Début et durée d'une magie** (champs de son effet, `magdebut`, `magduree`) : la magie agit au début du tour `magdebut` de sa carte (vide, 0 ou 1 : dès le début du combat ; en attendant, elle est montrée « en attente »), et seulement `magduree` tours (vide ou 0 : tout le combat) ; à la fin, tout ce qu'elle a fait est défait, comme une magie annulée (`magic-timing.ts`).

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
| `brulure`, `poison`, `saignement`, `malediction`, `fracture`, `gel`, `glas`, `fatigue`, `enracinement`, `contamination` | X % de chances de poser ce statut à chaque coup | `dot.ts`, `bleed.ts`, `curse.ts`, `fracture.ts`, `frost.ts`, `knell.ts`, `fatigue.ts`, `rooting.ts`, `contamination.ts` |
| `sedimentation` | **sédimentation** (Terre, compétence) : chaque frappe reçue qui touche (dégâts, ou prise toute par ses propres défenses : blocage, réduction, bouclier ; pas une esquive, ni une frappe sans dégâts) donne une couche de roche ; à 3 couches, un **bouclier** se lève (`val`, unité `u` : points ou % de ses PV max ; 20 % si vide) et les couches repartent de zéro. Le bouclier, des PV temporaires, encaisse les coups (et souffles, missiles) avant le blocage et les réductions, jusqu'à être épuisé ; deux boucliers s'additionnent. S'il prend tout un coup bloqué, le blocage ne riposte pas sur ce coup. Une mue retire les couches | `earth.ts` |
| `replique` | **réplique sismique** (Terre, compétence) : chaque frappe reçue qui touche (même règle) donne une charge ; à 3 charges, la terre frappe l'attaquant (`pctatq` % de l'ATQ de la carte, 50 si vide) et les charges repartent de zéro. Ce sont des dégâts directs, pas une attaque (aucun compteur, aucun piège « attaqué N fois », jamais critique) ; l'attaquant peut l'esquiver. Une mue retire les charges | `earth.ts` |
| `critique` | **coup critique** : `chance` % à chaque coup d'ajouter la **puissance critique** au coup, un % de l'ATQ, la même pour toutes les cartes (tableau des niveaux, `critique`, 50 % par défaut) ; seul un boost comme le courant ascendant la monte. Aussi en effet d'attaque (`atk_critique`) ; plusieurs sources additionnent leurs chances. Après le headshot, avant le bouclier, le blocage et les réductions | `critical.ts` |
| `courant_ascendant` | **courant ascendant** (Vent) : à chaque coup critique de la carte (headshot compris), ce coup fait +`val` % (20 si vide) et sa puissance critique monte de `pctcrit` points (10 si vide) pendant `tours` de ses tours (2 si vide) ; des critiques de suite se cumulent, `max` fois au plus (3 si vide), et chacun relance la durée | `critical.ts` |
| `cisaillement` | **cisaillement** (Vent) : X % de chances à chaque coup de poser des lames d'air (comme l'effet `cisaillement`) | `blades.ts` |
| `foudre` | **foudre** : X % de chances à chaque coup de poser un niveau de marque de foudre (comme l'effet `marque_foudre`) | `lightning.ts` |
| `execution` | X % de chances de poser une marque d'exécution à chaque coup, avec le coup, avant ses dégâts ; à 3 marques, un coup qui laisserait la cible sous le seuil **est** l'exécution (« évite la mort » ne se déclenche pas et l'exécution le **brise** dans tous les cas : passif, protection reçue, magie ou piège « évite la mort » (tranché, même s'il réanime aussi), il ne sauvera plus la carte ; la réanimation reste possible). **Statut marquant** (`statmarque` : `saignement`, `brulure`, `poison`, `tous` ; `chancemarque` %), sur toutes les formes de l'exécution : la carte marquée garde jusqu'à la fin du combat X % de chances de recevoir une marque à chaque dégât de ce statut (le plus haut % est gardé) | `execution.ts` |
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
| `headshot` | **headshot**, un coup critique spécial : `chance` % (100 si vide) à chaque coup, sans tirer la chance de critique, de faire un coup critique (puissance critique commune, courant ascendant compris ; l'ancien `pctcrit` de la carte ne compte plus), juste après sa puissance, avant blocage et réductions. Un ciblage le force | `headshot.ts` |
| `lien_parasite` | `chance` % à chaque coup de poser `nbliens` liens parasitaires sur la cible (`tours`, `pctlien`), qui s'ajoutent à ceux déjà posés | `parasite.ts` |
| `mutation` | **mutation insecte** : +1 niveau (3 au plus, pour tout le combat) à chaque statut négatif reçu, et après 4 de ses tours de suite sans statut négatif. Chaque niveau s'ajoute aux précédents. I : ATQ +`matq`, PV +`mpv` (unité `u`). II : dégâts subis −`mreduc` %, et son attaque fait saigner (`msaignch` % de chances, 100 si vide ; `msaignpct` % des PV max par tour ; `msaigntours` tours, 2 si vide). III : **mue instantanée** (valeurs `mueatq`/`muepv` de la mutation, sinon celles du passif `mue`, sinon 10 %), esquive +`mesq` %, lien parasitaire sur l'adversaire (`lientours`, `pctlien`) | `insect.ts` |
| `mue` | **mue** : commence après 2 de ses tours de suite finis avec un statut négatif (une marque d'exécution n'est pas un statut : elle ne la lance pas) ; 2 tours plus tard, au début de son tour (avant l'attaque), la carte mue : statuts négatifs (étourdissement compris), marques d'exécution, ciblage et lien parasitaire retirés, et elle perd `mueatq` d'ATQ (`uatq`) et `muepv` de PV max (`upv`), 10 % si vide. Elle peut muer de nouveau | `insect.ts` |
| `reaction` | **réaction** : quand la carte subit des dégâts (`quand` : `degats`) ou reçoit un statut négatif (`statut`), la stat `stat` monte de `val` : `atq`, `pv` (unité `u`), `esquive`, `blocage` (chance de bloquer un coup, 75 % au plus), `reduc` (réduction des dégâts des coups, 90 % au plus), en points de % pour ces trois. `plafond` : gain total maximum (vide ou 0 : aucun) | `reaction.ts` |

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
| `proprio_meurt` | son propriétaire va mourir (avant la réanimation ; un piège « évite la mort » passe en premier). Piège qui réanime : la carte se brise, le piège se montre (un contre-piège peut le détruire ou le voler), puis la carte se reforme seulement si le piège tient encore ; contré, il ne fait rien et seule une autre réanimation (passif, magie) peut ramener la carte |
| `proprio_statut` | son propriétaire reçoit un statut négatif (brûlure, poison, saignement, malédiction, gel, fatigue, étourdissement, fracture) |
| `adv_statut` | l'adversaire reçoit un statut négatif |
| `proprio_esquive` | son propriétaire esquive (attaque, souffle ou missile) |
| `adv_esquive` | l'adversaire esquive |
| `proprio_attaque` | son propriétaire a attaqué N fois, puis toutes les N attaques (`coups`) |
| `proprio_coup_fort` | son propriétaire subit au moins X dégâts en un coup (`seuildeg` ; poison, brûlure et saignement ne comptent pas) |
| `adv_piege` | le piège de l'adversaire se déclenche : il répond aussitôt, avant l'effet de ce piège (contre-piège) ; s'il le détruit ou le vole, le piège adverse ne fait rien |
| `tour_n` | le tour N du combat commence (`ntour`, numéro affiché « Tour N », prolongations comprises) |
| `proprio_bloque` | son propriétaire bloque (attaque annulée ou bloquée, dégâts réduits, souffle ou missile bloqué) |
| `proprio_ultime` | son propriétaire lance un ultime (programmé compris) |

Les dix dernières conditions lisent des **faits** (`mechanics/triggers.ts`) : le moteur les relève à l'émission de chaque événement, et le scan du piège attend le prochain `flush`, sauf le déclenchement d'un piège (`adv_piege`), scanné aussitôt. Un piège détruit ou volé pendant qu'il agit s'arrête : il n'applique plus ses effets restants.

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
| `adv_soigne` | après un soin reçu par l'adversaire | — |
| `adv_statut` | après un statut négatif reçu par l'adversaire | — |
| `adv_esquive` | après une esquive de l'adversaire | — |
| `adv_bloque` | après un blocage de l'adversaire | — |
| `inflige_coup_fort` | après un coup d'au moins X dégâts infligé à l'adversaire (hors poison, brûlure, saignement) | 1 |
| `purifie` | après une purification qui lui retire quelque chose | — |
| `adv_purifie` | après une purification de l'adversaire qui lui retire quelque chose | — |
| `evite_mort` | après avoir évité la mort | — |
| `adv_evite_mort` | après que l'adversaire a évité la mort | — |
| `reanime` | après sa réanimation | — |
| `adv_reanime` | après la réanimation de l'adversaire | — |
| `atq_baisse` | après une baisse de son ATQ (malédiction, fatigue, effet, échange…) | — |
| `adv_atq_baisse` | après une baisse de l'ATQ de l'adversaire | — |
| `pvmax_baisse` | après une baisse de ses PV max (calcination, effet…) | — |

Un déclencheur d'événement pose un drapeau sur l'emplacement d'ultime (`triggered`) ; l'ultime part au prochain passage de `ultimate`, au tour de sa carte, et le drapeau retombe. Un ultime volé ou copié arrive sans drapeau. Les faits `purify`, `avoidDeath`, `revive`, `atqDown` et `maxDown` ne servent qu'aux ultimes : aucune condition de piège ne les lit, et ils ne lancent pas de scan de piège.

## Niveaux de statut

Depuis le rework d'octobre 2026, poison, saignement, brûlure, fatigue, fracture et Glas ont un **niveau**, I à III. Ce que fait chaque niveau vit dans un seul tableau (`packages/engine/src/model/levels.ts`, `DEFAULT_LEVELS`), réglable par la règle `niveaux` (`Rules`) ; la carte ne garde que son niveau, sa durée et sa chance.

| Terme du jeu | Clé en base / règle | Identifiant TS | Sens |
|---|---|---|---|
| niveau | `niveau` (1 à 3) sur l'effet, le passif ou l'effet d'attaque (pour l'enracinement empoisonné : le niveau du poison posé) ; `msaignniv` (saignement de la mutation), `fatniv` (fatigue de fin de rage) | `levelOf()`, `explicitLevel()` | I, II ou III. Posé sur un statut déjà là, les niveaux s'additionnent (I + II = III), III au plus, et la plus longue durée reste |
| tableau des niveaux | réglage `niveaux_statuts` (table `reglages_jeu`, JSON, Admin > Réglages ; lu par l'edge function et passé en règle `niveaux`) : `poison`, `saignement`, `saignementSoin`, `brulure`, `calcination`, `fatigue`, `fractureChance`, `fractureAtq`, `glas`, `malediction`, `faiblesse`, `faiblesseTours`, `critique`, `foudre` | `StatusLevels`, `levelTable()`, `Combat.levels` | les valeurs de chaque niveau ; une valeur absente garde sa valeur par défaut (poison 4/8/14, saignement 3/5/8 % et −25/−50/−75 % de soins, brûlure 2/4/7 %, calcination 100 %, fatigue 15/30/50 %, fracture 15/30/50 % de chances et 10/20/30 % de l'ATQ, Glas 5/8/12 %, malédiction 3) |
| niveau d'une ancienne carte | anciennes valeurs (`degtour`, `pctpv`, `fatval`, `fchance`, `glasv`, `sval`, `msaignpct`) | `legacyLevel()` | une carte sans `niveau` prend le niveau dont la valeur par défaut est la plus proche de son ancienne valeur (à égalité, le plus bas). Même règle que la conversion des cartes en base |

## Statuts (état interne)

Noms des statuts dans l'état du moteur (`Status`, `packages/engine/src/combat/state.ts`) ; la correspondance avec les noms abrégés du legacy est dans `docs/legacy/moteur.md`.

| Statut | Identifiant TS | Événement de fin |
|---|---|---|
| malédiction | `curses` (une entrée par malédiction : `lost`, `turns`, `pending`) | `statusEnded: 'curse'` (à la fin de la dernière) |
| saignement | `bleeds` (`level`, `turns`) | `statusEnded: 'bleed'` |
| brûlure, poison | `dots` (`kind: 'brûlure' \| 'poison'`, `level`, `turns`) | `statusEnded: 'burn' \| 'poison'` |
| gel | `frosts` | `statusEnded: 'frost'` |
| fracture | `fractures` (une au plus : `level`, `turns`) | `statusEnded: 'fracture'` |
| fatigue | `fatigues` (`level`, `lost`, `turns`) | `statusEnded: 'fatigue'` |
| enracinement | `rootings` (une entrée par variante : `variant`, `turns`, `val`, `level`, `poisonTurns`) | `rootEnded` (avec sa variante) |
| contamination | `contamination` (`turns`) | `statusEnded: 'contamination'` |
| faiblesse | `weakness` (`pct`, `turns`) | `statusEnded: 'weakness'` |
| couches, charges, bouclier (Terre) | `layers`, `charges`, `shield` | aucun : le bouclier s'épuise (`shieldAbsorbed`, `left: 0`) |
| courant ascendant | `updraft` (`stacks`, `turns`) | `updraftEnded` |
| lames d'air (sur la cible) | `blades` (une vague par pose : `blades`, `damage`, `turns`) | `bladesStruck` |
| marque de foudre (sur la cible), cartes chargées | `lightning` (`level`, `primed`), `chargedCards` (du côté qui les a chargées) | `lightningFaded` |
| rage | `rages` | `statusEnded: 'rage'` |
| dégâts doublés | `doubleDamageTurns` | aucun : le compteur baisse en fin de tour de la carte |

ATQ boostée (affichage) : l'ATQ finale d'un coup montrée en direct sur la carte pendant une rage ou des dégâts doublés. Vue : `SideView.rage`, `SideView.doubled` ; journal : champ `boost` (`docs/legacy/moteur.md`).
| étourdissement | `stunTurns` | `statusEnded: 'stun'` |
| attaque bloquée | `nextAttackBlocked` (legacy : `blk`) | consommée par la prochaine attaque, souffle ou missile ; retirée par une purification |
| solidification | `solidTurns` | `statusEnded: 'solid'` |
| ciblage (sur la carte ciblée) | `targeted` | `targetEnded` |
| brume | `mist` (`level` 1 ou 2) | `mistFaded` |
| liens parasitaires (sur le porteur) | `parasites` (une entrée par lien) | `parasiteEnded` (un par lien, `links` : ceux qui restent) |
| mutation, mue | `mutationLevel`, `quietTurns`, `statusTurns`, `moltTurns` | `molted` |
| défenses gagnées | `armorPct` (réduction %), `blockChance` (blocage %) | aucun : pour tout le combat |
