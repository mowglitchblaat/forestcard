# `@forestcard/layout` : la face d'une carte en calques

Le compositeur de cartes de l'admin (`apps/site/src/composeur.js`), réécrit en données pour les overlays WebGL (`packages/overlay-3d`) : le fond, le dessin seul (zoom et décalage des réglages), l'écriteau et ses lignes (pastilles, ultime en italique rouge sombre, explications), le cadre, l'ATQ et les PV, et les zones des lignes (que l'overlay allume quand un effet agit). Mêmes mesures (bandes de l'écriteau par rareté, zone libre des magies et des pièges), mêmes règles (taille réduite jusqu'à tenir, quatre lignes d'explication au plus), mêmes couleurs (`CATEGORY_STYLES` de `packages/describe`).

Pur : aucun DOM. L'appelant mesure le texte (`measure`, avec la police réelle) et donne la taille du dessin. Un changement du compositeur se reporte ici dans le même changement, pour que les deux continuent de dessiner la même carte.
