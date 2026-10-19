# Un moteur, des événements de domaine, une projection du journal

Le moteur existait en trois copies (`moteur-combat.js`, `combat.html`, `swift-responder.ts`), et ses règles étaient dupliquées dans le site et le catalogue. Il n'y a plus qu'un package, `packages/engine`, que l'edge function, l'overlay, le simulateur et les pages importent. Le moteur est le domaine : il calcule un combat et émet des **événements de domaine typés, sans texte**. Il ne dépend ni du DOM, ni de Node, ni de Deno. Le journal (`t`, `txt`, instantanés) est une **projection** de ces événements, dans `packages/journal`. Le parallélisme, l'affichage et les entrées et sorties vivent dans les utilisations (`apps/`, `tools/`), jamais dans le moteur. L'affichage rejoue le journal, il ne recalcule rien.

Règles des événements, pour ne pas perdre ce que le texte portait :

1. Pas de texte libre dans un événement : une variante de phrase devient un type distinct ou un champ énuméré (`source`, `cause`).
2. Un événement porte des faits, pas leur formulation (`stacked: true`, jamais `suffix: ' encore plus'`).
3. La projection lit la vue (`CombatView`) uniquement pendant l'appel `onEvent`, sans en garder de référence.
4. Un champ manquant se voit : le texte projeté diverge au premier combat concerné.

## Options écartées

- **Garder le texte dans le moteur** : une utilisation qui a besoin d'un fait doit alors le retrouver dans une phrase. L'overlay le fait déjà pour l'effet aléatoire, en lisant un morceau de `txt`.
- **Un moteur par utilisation** : c'était l'état de départ, trois copies tenues alignées par un test de comparaison de texte et par de la discipline.
