# Une mécanique, un module ; l'ordre des étapes dans un seul fichier

Une mécanique (un statut, une défense, l'avalage, la détonation…) vit dans un seul fichier, `packages/engine/src/mechanics/<nom>.ts` : son état sur la carte, ses effets, son passif et ses étapes du tour. L'ordre de toutes les étapes vit dans un seul fichier, `combat/moments.ts`, en listes ordonnées (début de tour, autorisation d'attaquer, chaque coup, coup arrivé, fin de tour), une position commentée à chaque fois. Le déroulé suit ces listes sans connaître les mécaniques. Avant, une mécanique était éclatée par moment du tour : la détonation vivait dans 8 fichiers, et `effects.ts` était un `switch` de 60 cas.

L'ordre est du comportement (tirages aléatoires, `flush()`, retours anticipés) : déplacer une mécanique dans une liste change le comportement, et ça se voit dans le diff.

## Options écartées

- **Un dossier par mécanique sur toute la chaîne** (règle, texte, journal, éditeur) : il mêlerait le moteur, qui ne contient pas de texte, et les packages de texte, qui ont déjà une table par clé vérifiée par le compilateur. Gain faible pour ce mélange.
