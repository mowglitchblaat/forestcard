# Le texte du journal (`txt`) est un contrat

Le journal d'un combat est stocké en base (`historique_combats.deroule`, réduit à `c`, `t`, `txt` et `tour` par ligne), affiché par l'overlay et l'historique, et l'overlay en lit un morceau pour l'effet aléatoire. Son texte n'est donc pas un détail d'affichage : on ne le change que par un changement explicite, à part, avec la liste des phrases avant → après. Jamais comme effet de bord d'un refactor.

Le seul endroit où vit ce texte est `packages/journal/src/project.ts` (ADR 0001).

## Conséquences

Les bizarreries du texte (la numérotation « Tour N », « peut maintenant undefined » de la détonation…) se corrigent une par une, chacune dans son propre changement, et les combats déjà stockés gardent l'ancien texte.
