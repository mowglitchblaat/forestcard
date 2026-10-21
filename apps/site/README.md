# Site joueur et admin (index.html)

Le site : collection, decks, boutique, admin… Deux parties passent par le build : la **description des effets** (l'ancien bloc `/* FX-BEGIN */ … /* FX-END */`) et les **listes de l'éditeur admin** (`P`, `PAS`, `ULT`, `MAG`, `CON`). Les deux viennent de `packages/describe`. Le reste de la page est inchangé.

## Générer la page

```bash
vp run build        # depuis apps/site
```

Le build produit `dist/index.html`. C'est le gabarit `src/index.html` dans lequel, à l'emplacement du bloc FX, le build insère :

- le code de description (`vp pack`, global `SiteDescribe`) ;
- la ligne `const { nz, fxPassif, fxEffet, fxCond, fxTrigUlt, lignesCarte } = SiteDescribe;`.

Et, à l'emplacement des listes de l'éditeur (marqueur `/*@@EDITOR@@*/`), la ligne `const { P, PAS, ULT, MAG, CON } = SiteDescribe;`.

Le reste de la page utilise ces noms comme avant. On ne modifie jamais `dist/index.html`.

## Composeur de carte (admin)

Dans Admin → Cartes, l'admin envoie le **dessin seul** : la page pose le cadre (`cadres/<type>-<rareté>.png`), l'écriteau ajusté au texte (`cadres/ecriteau-<rareté>.png`, bande sombre pour une commune), l'ultime à sa DA (italique rouge sombre) et les passifs au code couleur des effets, puis l'ATQ et les PV. À l'enregistrement, elle crée l'image normale et l'image de combat (sans chiffres), et garde le dessin et ses réglages sur la version Standard (`dessin_path`, `compo` : `db/migrations/29-composition-cartes.sql`). Quand la carte est modifiée sans nouvelle image, ses images sont refaites avec la carte telle qu'elle est. Les noms courts de l'écriteau viennent de `packages/describe/src/plaque.ts` (le build les livre sous `lignesEcriteau`, avec les couleurs `COULEURS_CAT`) ; l'admin peut remplacer chaque ligne. L'ancien envoi d'images déjà prêtes reste possible.

## Ce qui est où

- `src/describe.ts` : les icônes du site autour du texte commun (`packages/describe`, qui garde la formulation du site). Le texte est indexé sur les listes de types du moteur : un type ajouté au moteur sans texte **ne compile pas**.
- `src/index.html` : la page legacy, avec le bloc FX remplacé par le marqueur `/*@@DESCRIBE@@*/` et les listes de l'éditeur par `/*@@EDITOR@@*/`.
- `packages/describe/src/editor.ts` : les listes de l'éditeur admin (champs, passifs, ultimes, magies, conditions), indexées sur les listes de types du moteur. Un passif ou une condition ajouté au moteur sans entrée **ne compile pas** ; un effet ajouté au moteur sans entrée en magie ni en ultime fait échouer `test/editor.test.ts`, sauf s'il est listé dans `NOT_EDITABLE` (aujourd'hui `echange_pv` et `echange_tout`, obtenus seulement par l'effet aléatoire).

## Vérifier

`vp run test` (depuis `apps/site`) vérifie trois choses :

- hors du bloc FX et des listes de l'éditeur, `dist/index.html` est identique octet pour octet à la page legacy ;
- les listes de l'éditeur livrées dans la page sont celles du legacy, ordre des clés compris (c'est l'ordre des options) ;
- le code livré dans la page et le bloc FX legacy (qui lit les listes de l'éditeur de la page), exécutés dans des contextes isolés, donnent le même texte, ou la même erreur, sur environ 4 200 entrées : cartes réelles, synthétiques et `dirty`, effets inconnus, effets perso, clés d'un autre genre (un passif en effet, un effet en passif).

Aucune différence voulue avec le legacy. Celle de la phase 4b (décrire un passif ou un effet `execution` faisait planter la page, `X is not defined`) a disparu : l'amont a fait la même correction, au caractère près (`078e524`).
