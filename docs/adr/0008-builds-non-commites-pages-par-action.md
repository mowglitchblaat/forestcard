# Les fichiers générés ne sont pas commités ; Pages est publié par une Action

Les pages servies (`combat.html`, le site, le catalogue) sont générées par le build (`apps/*/dist/`), et ces fichiers ne sont jamais commités. Une GitHub Action (`pages.yml`) reconstruit à chaque push sur `main` et publie sur GitHub Pages, aux mêmes adresses qu'avant (sources OBS, miroir des images, liens entre pages). `tools/pages/assemble.ts` assemble `_site/`, et échoue s'il manque un fichier servi. Chaque fichier servi a un propriétaire dans le repo : les pages générées dans `apps/*/dist`, l'overlay des boosters dans `apps/overlay-boosters`, `patchnotes.json` dans `apps/site/public`, les cadres et les images dans `assets/`.

## Conséquences

Pages doit être réglé sur « GitHub Actions » : sinon il sert la racine du repo, où les pages générées n'existent pas.
