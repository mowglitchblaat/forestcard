# Fichiers statiques servis par le site

Copiés tels quels dans le site par `tools/pages/assemble.ts`, aux mêmes adresses qu'avant.

| Dossier   | Servi en   | Contenu                                                                                                                                                               | Qui l'écrit                                                                                                                                                           |
| --------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cadres/` | `/cadres/` | cadres des cartes, selon le type et la rareté (`index.html`) ; `ceinture-rare/epique/libre.webp` : les ceintures du championnat (onglet Ceintures, overlay du combat) | à la main. Copie de `legacy/cadres/` tant que l'amont est la référence (test de dérive : `tools/legacy-sync/test/copies.test.ts`)                                     |
| `img/`    | `/img/`    | images des cartes, plus `liste.json` (images disponibles) et `rapport.json`                                                                                           | le job de nuit `.github/workflows/images.yml` (`tools/copier-images/copier-images.mjs`). Absent d'un clone neuf de ce repo : il n'existe que dans le repo de l'auteur |

Le site lit les images à l'adresse `https://mowglitchblaat.github.io/forestcard/img/` (`MIROIR_URL` dans `index.html`) : l'adresse ne dépend pas de l'emplacement du dossier dans le repo.
