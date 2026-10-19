# Catalogue imprimable (catalogue.html)

Depuis la phase 4b, le catalogue affiche **le même texte que le site** : il vient de `packages/describe`, la source unique du texte des effets. Le catalogue ne garde que sa présentation : un effet par ligne colorée selon sa catégorie (voir la légende), la ligne de déclenchement ou de condition au-dessus, « aucun » pour une section vide.

## Générer la page

```bash
vp run build        # depuis apps/catalogue
```

Le build produit `dist/catalogue.html`. C'est le gabarit `src/catalogue.html` dans lequel, à l'emplacement de l'ancien bloc de description, le build insère :

- le code de rendu (global `CatalogueDescribe`) ;
- la ligne `const { COL, esc, sectionsHTML } = CatalogueDescribe;`.

On ne modifie jamais `dist/catalogue.html`.

## Ce qui est où

- `src/describe.ts` : la légende (`COL`), la catégorie de couleur de chaque type d'effet, et `sectionsHTML(carte)`, qui rend les sections de `describeCard` (de `packages/describe`) avec la présentation du catalogue.
- `src/catalogue.html` : la page legacy, avec exactement deux remplacements :
  - le bloc de description devient le marqueur `/*@@DESCRIBE@@*/` ;
  - dans `cardHTML`, le calcul des sections devient `const secs=sectionsHTML(c);`.
- `report.ts` : génère `docs/rapports/phase-4b-catalogue-avant-apres.md`, l'ancien texte et le nouveau pour chaque carte réelle.

## Vérifier

`vp run test` (depuis `apps/catalogue`) vérifie trois choses :

- le gabarit est le legacy avec ces deux remplacements seulement, et la page générée est identique au legacy partout ailleurs ;
- chaque texte et chaque ligne de condition affichés sont exactement ceux de `packages/describe` (le test du site prouve que ce sont ceux du site), sur les cartes réelles, synthétiques et `dirty` ;
- les couleurs de chaque effet et la légende restent celles du catalogue legacy.
