# Le texte des effets : une seule formulation, dans `packages/describe`

Le texte de chaque effet, passif, condition de piège et déclencheur d'ultime a une seule formulation, la même sur toutes les pages. Il vit dans `packages/describe`, puisque le moteur ne contient pas de texte. Chaque page n'ajoute que sa présentation. Les tables de texte sont indexées sur les listes de types du moteur (`EFFECT_TYPES`, `PASSIVE_TYPES`, `TRAP_CONDITION_TYPES`, `ULTIMATE_TRIGGER_TYPES`) : un type sans texte ne compile pas. Les listes de l'éditeur de l'admin (libellés et champs à saisir) sont aussi du texte d'effet et vivent au même endroit (`src/editor.ts`).

La formulation de départ est celle du site. Celle du catalogue, qui interprétait les données autrement et contenait des erreurs visibles, n'a pas été reprise.

## Conséquences

Un changement de texte se fait à un seul endroit et se voit sur toutes les pages. Il s'accompagne d'un rapport « avant → après » par carte (`docs/rapports/`), relu par l'auteur.
