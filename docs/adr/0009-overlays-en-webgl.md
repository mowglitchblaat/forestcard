# Les overlays en WebGL (Pixi), à côté de l'overlay legacy

Les effets de combat et les cartes de l'overlay OBS passent en WebGL avec Pixi 8 (`packages/overlay-3d`), servis par une page à part, `combat-3d.html` (`apps/overlay-3d`). `combat.html` (l'overlay legacy) reste en place et continue d'annoncer les résultats à Streamer.bot : la nouvelle page se teste dans OBS à côté de lui, puis le remplacera.

- **Une carte est construite à l'affichage**, depuis son dessin seul, son cadre et son écriteau : `packages/layout` décrit la face en calques, avec les mêmes mesures et les mêmes règles que le compositeur de l'admin (`apps/site/src/composeur.js`). Une carte de l'overlay ressemble à l'image que l'admin fabrique avec les mêmes réglages.
- **Les effets d'auteur gardent leur dessin legacy** (`packages/overlay-3d/src/original/`) : la fracture, l'exécution, l'avalage, la brume et le lien parasitaire sont repris de `combat.html` presque ligne à ligne, sur un canvas 2D posé au-dessus de la scène et actif seulement pendant un effet.
- **La qualité « éco »** (`?qualite=eco`) allège le GPU : bruit des shaders à 3 octaves au lieu de 5, moitié moins de particules, boucles longues à 30 images par seconde.

## Conséquences

`pixi.js` et `pixi-filters` entrent dans le catalogue de dépendances (`pnpm-workspace.yaml`). La page est servie à la racine du site (`tools/pages/assemble.ts`) : `combat-3d.html`, ses scripts dans `overlay-3d/`.
