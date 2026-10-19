# Run d'iso

Compare un moteur candidat à l'oracle `legacy/moteur-combat.js` sur des rencontres reproductibles. La réécriture est iso quand le run complet passe sans divergence (voir « La preuve » ci-dessous).

## La preuve

La réécriture est iso quand le run complet (`vp run iso:full`) passe sur la machine de Romain avec zéro divergence. Tant que ce n'est pas le cas, elle ne remplace rien en prod. Ce run n'est pas de la CI : il est trop long. L'ancien moteur, gardé tel quel, sert d'oracle, et les deux tournent en mémoire, sans journal stocké.

| Axe                       | Contenu                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Rencontres                | tous les trios (combattant, magie, piège) × tous les trios, en paires ordonnées                                                   |
| Ordre de départ           | couvert par symétrie : le premier joueur ne dépend que de la seed, donc `(X, Y, s)` et `(Y, X, s)` font commencer chacun des deux |
| Chemins aléatoires        | 1 seed par paire ordonnée de trios : `(X, Y)` et `(Y, X)` partagent leurs seeds. `--seeds N` multiplie le run par N               |
| Effets absents des cartes | cartes synthétiques pour chaque type d'effet, de passif, de condition et de déclencheur qu'aucune carte réelle n'utilise          |
| Prolongations             | combats avec de vrais decks de 10 cartes (le tirage « cartes jamais jouées » ne s'exerce pas avec un deck réduit à un trio)       |

Avec le snapshot de cartes `docs/legacy/cartes-2026-10-19.json` (93 cartes, toutes actives : 50 combattants, 25 magies, 18 pièges), on a 22 500 trios, soit environ 506 M de rencontres par seed. Snapshots précédents : `cartes-2026-10-18.json` (90 cartes, 20 736 trios, 430 M de rencontres, base des rapports d'iso du 2026-10-18) et `cartes-2026-10-17.json` (87 cartes, 18 612 trios, 346 M, base du rapport de la phase 4b).

## Ce qui est comparé

Pour chaque rencontre, les deux moteurs reçoivent chacun leur propre copie des mêmes decks, de la même seed et des mêmes règles. Leurs résultats sont comparés **sous forme JSON**, puisque c'est le contrat : l'edge function renvoie du JSON, l'overlay reçoit du JSON et l'historique stocke du JSON. L'ordre des clés, une propriété `undefined` et `-0` ne comptent donc pas comme des différences. Tout le reste compte : types, valeurs, ordre des événements, `txt`.

Si un moteur lève une erreur, la rencontre est identique seulement quand les deux lèvent le même message.

## Les quatre suites

| Suite       | Rencontres                                                                                                                                                                    | Ce qu'elle couvre                                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `real`      | tous les trios réels × tous les trios réels, en paires ordonnées, `--seeds` seeds par paire (22 500² ≈ 506 M par seed avec le snapshot du 2026-10-19)                         | toutes les rencontres possibles entre cartes réelles. `(X, Y)` et `(Y, X)` partagent leurs seeds, et le premier joueur ne dépend que de la seed, donc chaque trio commence                                         |
| `synthetic` | `--count` trios tirés parmi les cartes réelles et synthétiques (`src/synthetic.ts`), dont 5 % sans magie ou sans piège                                                        | chaque type d'effet, de passif, de condition de piège et de déclencheur d'ultime, y compris ceux qu'aucune carte réelle n'utilise                                                                                  |
| `decks`     | `--count` decks légaux de 10 cartes, dans un ordre mélangé. Une rencontre sur deux joue avec `maxTours: 2`                                                                    | les prolongations avec tirage de cartes jamais jouées                                                                                                                                                              |
| `dirty`     | les rencontres de `synthetic`, avec des données abîmées comme en base (signalé par l'auteur) : nombres en texte, `""`, `null`, passifs stockés en tableau, ATQ et PV en texte | les coercitions JavaScript (`\|\|`, `+x`, `parseInt`, concaténation de `+` avec un texte). Sur un échantillon, 84 % des combats diffèrent de leur version propre et 35 % finissent avec des PV ou une ATQ en texte |

Chaque rencontre est une fonction pure de `(suite, k)`. Une rencontre se rejoue seule, et un run s'arrête puis reprend à n'importe quel `k`. La suite `real` visite les indices dans un ordre mélangé (bijection), ce qui fait apparaître tôt une divergence propre à quelques trios.

## Commandes

Depuis la racine du repo :

```bash
vp run iso --suite real --candidate <moteur.js>          # run complet de la suite real (1 seed)
vp run iso --suite real --seeds 3 --candidate <moteur.js>
vp run iso --suite synthetic --count 5000000 --candidate <moteur.js>
vp run iso --suite decks --count 2000000 --candidate <moteur.js>
vp run iso --suite dirty --count 3000000 --candidate <moteur.js>

vp run iso --suite real --limit 1000000                  # échantillon : 1 M de rencontres
vp run iso --suite real --resume                         # reprend au dernier point de contrôle
vp run iso --suite synthetic --count 20000 --stats       # histogramme des événements (couverture)
vp run iso --suite real --bench --limit 400000           # vitesse du moteur de référence seul
vp run iso --suite real --replay 123456                  # rejoue une rencontre, écrit les deux résultats complets

vp run iso:mutants                                       # valide le harnais lui-même (voir plus bas)
```

Le candidat de la réécriture est `packages/journal/src/index.ts` (moteur TS + projection du journal). ⚠ Sans `--candidate`, le candidat est une seconde instance indépendante du legacy : c'est le contrôle « legacy contre legacy », qui ne teste pas la réécriture. Pour `vp run`, les options suivent directement le nom de la tâche, sans `--`.

Les points de contrôle, les rapports de divergence et les rejeux sont écrits dans `tools/iso/.out/`, que git ignore.

## La preuve complète : `vp run iso:full`

Enchaîne les quatre suites contre `packages/journal/src/index.ts` : `synthetic` (5 M), `dirty` (5 M), `decks` (2 M), puis `real` (toutes les paires de trios réels, 1 seed). Les suites rapides passent d'abord, pour qu'une divergence rare apparaisse vite.

```bash
vp run iso:full                  # tous les cœurs
vp run iso:full --workers 1      # un seul cœur (la suite real prend alors environ 34 h)
```

Toujours reprenable : chaque suite note où elle en est dans `tools/iso/.out/full-<suite>-seeds<S>-<empreinte>.json`, et relancer la même commande repart de là. L'empreinte couvre les deux moteurs, le harnais et les cartes : après le moindre changement, le run repart de zéro au lieu de reprendre un point de contrôle périmé. Le run s'arrête à la première divergence. Le rapport est `tools/iso/.out/full-report.md` ; une divergence est écrite dans `full-failure-<suite>-<k>.json`, à rejouer avec `--replay`.

## Lire une divergence

Le run s'arrête à la première divergence et affiche :

- `suite:k`, la rencontre à rejouer avec `--replay k` (même `--seeds`, `--count` et `--candidate`) ;
- l'index du premier événement du journal qui diffère, ou « outside the journal » si la différence porte sur `gagnant`, `recompenses`, `seed` ou `regles` ;
- les deux événements côte à côte.

Le fichier `failure-<suite>-<k>.json` contient l'entrée complète de la rencontre.

## Valider le harnais : les mutants

Un harnais incapable de voir un moteur cassé validerait une réécriture cassée. `vp run iso:mutants` lance plusieurs versions du legacy, chacune modifiée d'un seul changement volontaire, et vérifie que le run attrape chaque changement de comportement :

| Mutant               | Changement                                                                                               | Attendu                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `rng-short-circuit`  | le tirage d'esquive passe avant sa garde : un tirage RNG de plus                                         | détecté                                      |
| `over-without-flush` | `over()` ne vide plus les réanimations et effets en attente                                              | détecté                                      |
| `text`               | un mot change dans une ligne du journal                                                                  | détecté                                      |
| `overtime-count`     | 2 prolongations au lieu de 3                                                                             | détecté                                      |
| `trap-chain-depth`   | chaîne de pièges limitée à 4 au lieu de 3                                                                | détecté (seulement par la suite `synthetic`) |
| `text-coercion`      | somme des chances d'esquive faite en nombres : ne change rien sauf quand une chance est stockée en texte | détecté (seulement par la suite `dirty`)     |
| `control-key-order`  | même journal, clés dans un autre ordre                                                                   | **non** détecté (contrôle négatif)           |

Après tout changement du harnais (`src/`), le contrôle « legacy contre legacy » et les mutants doivent repasser.

Un mutant non détecté n'est pas forcément une faille du harnais : il peut être **équivalent** et ne rien changer au comportement. Exemple rencontré : muter le `?? 3` de `reg.maxProlong ?? 3`, qui est du code mort (`docs/legacy/moteur.md`). On vérifie ce point avant de conclure.

## Ordres de grandeur (Ryzen 9 9950X3D, 32 threads)

| Mesure                                                       | Valeur                                        |
| ------------------------------------------------------------ | --------------------------------------------- |
| legacy seul (`--bench`, échantillon court de 400 000)        | ~98 500 combats/s                             |
| legacy contre legacy, `real`, 20 M de rencontres             | ~54 700 rencontres/s, soit ~109 500 combats/s |
| legacy contre legacy, `synthetic`, 5 M                       | ~52 400 rencontres/s                          |
| legacy contre legacy, `decks`, 2 M (combats plus longs)      | ~27 200 rencontres/s                          |
| suite `real` complète, 1 seed, legacy contre legacy (estimé) | ~1 h 45                                       |

Les échantillons courts sous-estiment la vitesse : le démarrage des workers et le JIT pèsent sur les premières secondes. Le surcoût du mode comparaison vient de la copie des entrées et de la sérialisation JSON des deux résultats. La durée du run final dépendra aussi de la vitesse du moteur TypeScript.
