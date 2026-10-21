# Atelier des écriteaux (atelier.html)

Outil de l'auteur pour l'écriteau de ses cartes : l'ultime (ligne du haut, plus grande) et les passifs, colorés selon le code couleur des effets (le même que le catalogue et le site, `packages/describe/src/categories.ts`), dans une police au choix, en texte coloré ou en pastilles. L'écriteau s'ajuste par défaut à la hauteur du texte (marge réglable) : la bande du PNG de la rareté est étirée ou resserrée en hauteur, centrée sur le texte.

- **Écriteau seul** : un PNG transparent de 1488 × 2070, la taille des cadres (`assets/cadres/`). Il se pose tel quel en calque sur la carte, entre le dessin et le cadre.
- **Aperçu sur la carte**, facultatif : avec le dessin, le cadre du type et de la rareté, ATQ et PV. Deux exports : la carte complète avec chiffres, et l'image pour le combat (sans chiffres).

Page autonome en un seul fichier, servie telle quelle à `atelier.html` (`tools/pages/assemble.ts`). Elle lit les cadres à `cadres/` : l'export ne fonctionne que depuis le site (même origine), pas en fichier local.

Si les couleurs des catégories changent dans `packages/describe/src/categories.ts`, reporter le tableau `CAT` de la page.
