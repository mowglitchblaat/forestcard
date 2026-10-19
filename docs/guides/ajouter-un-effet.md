# Ajouter un effet, un passif ou une condition de piège

Ce guide s'adresse à un humain comme à un agent. Un effet touche plusieurs endroits du projet. Le compilateur et les tests en signalent la plupart ; ce guide liste les autres.

## Avant le basculement : l'amont reste la référence

Tant que le site tourne sur le code de `mowglitchblaat/forestcard`, c'est **l'auteur qui ajoute l'effet en amont**, dans `moteur-combat.js` et ses pages. Ici, on le reporte :

1. `node tools/legacy-sync/sync.ts` : le diff montre la nouvelle règle. `--apply` met à jour `legacy/` et `SOURCE`.
2. On reporte la règle en suivant la liste ci-dessous.
3. Le run d'iso doit repasser : le moteur TS et le legacy doivent donner le même journal, nouvel effet compris.

Ajouter un effet seulement ici casserait la preuve d'iso : le legacy ne le connaîtrait pas et émettrait « Effet non géré par le moteur ».

Les tests de dérive (gabarits `apps/*/src/*.html`, code serveur de l'edge) échouent tant que le report n'est pas fait. C'est voulu.

## Les endroits à toucher

L'ordre est celui dans lequel les erreurs arrivent quand on suit le compilateur. Sans installation (`tools/node-only/README.md`), le compilateur et les tests de la colonne « Qui le signale » ne tournent qu'en CI, à chaque push : la liste se suit alors à la main, et `node --test tools/node-only/rules.test.ts` puis le run d'iso vérifient la règle elle-même.

| # | Fichier | Quoi | Qui le signale |
|---|---|---|---|
| 1 | `packages/engine/src/model/types.ts` | ajouter la clé (telle qu'en base) à `EFFECT_TYPES`, `PASSIVE_TYPES` ou `TRAP_CONDITION_TYPES` | personne : c'est le point de départ |
| 2 | `packages/engine/src/mechanics/` | la règle, dans le module de sa mécanique (un nouveau module pour une nouvelle mécanique) : l'effet dans sa table `effects` (avec `once`, `withoutTarget`, `undoesStatuses` si besoin) ; un passif, comme étape d'un moment (sa place dans une liste de `combat/moments.ts`) ou dans une table par type (`LAID_ON_HIT`, `EVERY_TURN_PASSIVES`) ; son état, dans la part de `Status` que la mécanique déclare. Une condition de piège : une entrée de `conditions` dans `combat/traps.ts` | le compilateur : le registre des effets (`combat/effects.ts`) doit couvrir tout `EFFECT_TYPES` ; `packages/engine/test/types.test.ts` pour les passifs et les conditions |
| 3 | `packages/engine/src/events.ts` | si l'effet produit un fait nouveau à montrer, une variante de `DomainEvent` qui porte toutes ses données (pas de texte) ; et son classement dans `TRIGGER_FACT` (`mechanics/triggers.ts`) : le fait déclencheur que le legacy lirait dans sa ligne du journal (`statut` à statut négatif, `esquive`, `degats`…), ou `null` | le compilateur, à l'étape 4 et pour `TRIGGER_FACT` ; `tools/iso/src/triggers.test.ts` pour le classement lui-même |
| 4 | `packages/journal/src/project.ts` | la ligne du journal pour ce nouvel événement : `t`, `k`, `txt`, champs | le compilateur : `toLine` doit traiter chaque type d'événement |
| 5 | `packages/describe/src/index.ts` | le texte de l'effet, du passif ou de la condition (une seule formulation, pour toutes les pages) | le compilateur : les tables de texte sont indexées sur les listes de l'étape 1 |
| 6 | `tools/iso/src/synthetic.ts` | une carte synthétique qui utilise l'effet, pour que le run d'iso l'exerce | `tools/iso/src/coverage.test.ts` |
| 7 | `apps/catalogue/src/describe.ts` | la catégorie de couleur (`CATS`) | personne : sans entrée, l'effet est classé « Autres » |
| 8 | `apps/overlay-combat/src/combat.html`, fonction `jouer()` | une animation dédiée, si le nouvel événement en mérite une | personne : sans animation, l'overlay affiche le texte et met à jour PV et ATQ |
| 9 | `packages/describe/src/editor.ts` | l'entrée de l'éditeur de l'admin : libellé et champs à saisir, dans `EDITOR_MAGICS` et / ou `EDITOR_ULTIMATES` (effet), `EDITOR_PASSIVES` (passif), `EDITOR_CONDITIONS` (condition) ; un nouveau champ va dans `EDITOR_FIELDS` | le compilateur pour un passif, une condition ou un champ inconnu ; `apps/site/test/editor.test.ts` pour un effet (ou l'ajouter à `NOT_EDITABLE`) |
| 10 | `docs/glossaire.md`, `legacy/docs/workflow-combat.md` | le terme et la règle | personne |

Ensuite :

- un test de règle dans `packages/engine/test/` (Vitest, contre `simuler()` du journal, importé par chemin relatif `../../journal/src/index.ts` comme dans `legacy-rules.test.ts` : le moteur ne dépend pas du journal), sur le modèle de `legacy/tests/moteur.test.js` ;
- `vp check`, puis `vp run test` dans chaque package et chaque app concernés ;
- le run d'iso sur échantillon (`vp run iso --suite synthetic --count 200000 --candidate packages/journal/src/index.ts`), puis complet (`vp run iso:full`) avant de considérer le travail fini.

## Pièges

- **L'ordre des étapes est du comportement.** Il vit dans `combat/moments.ts` et nulle part ailleurs : placer l'étape d'un passif avant ou après une autre change l'ordre des tirages. Une étape qui s'arrête (`'stop'`, `'next'`, `'break'`) reprend un `return`, un `continue` ou un `break` du legacy.

- **L'ordre des tirages aléatoires est du comportement.** Un `roll()` ajouté dans du code commun (pas seulement dans la branche du nouvel effet) décale la suite de tous les combats. Les tirages du nouvel effet se placent dans sa propre branche.
- **Le tirage de l'effet aléatoire.** Ajouter une entrée au pool (`randomEffectPool`, `mechanics/random.ts`) change la probabilité de toutes les autres entrées, donc le comportement des cartes existantes à effet aléatoire (Morph de peinture, Pot de peinture du morph) et des programmations sans liste. Même chose pour `randomPassivePool`. C'est un changement d'équilibrage, à décider comme tel.
- **Les valeurs en base sont parfois du texte** (`"50"`), `""` ou `null`. Le moteur applique les coercions JavaScript (`||`, `+x`, `parseInt`) sans valider. Un nouvel effet suit les mêmes conventions que ses voisins, et la suite `dirty` du run d'iso les exerce.
- **Les effets « perso » de l'admin** ne sont exécutés que si leur clé contient `etourd` (`canonEffect`). Un nouvel effet de jeu est un vrai type dans `EFFECT_TYPES`, pas un effet perso.
- **Le moteur ne contient aucun texte.** Une phrase à afficher passe par un événement (étape 3) et sa projection (étape 4), ou par `packages/describe` (étape 5).
