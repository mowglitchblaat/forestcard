# Overlay OBS des boosters (overlay.html)

L'overlay qui montre l'ouverture d'un booster pendant le stream. Il ne contient pas de moteur de combat : il n'a pas de build, la page est servie telle quelle (`src/overlay.html` → `/overlay.html`, voir `tools/pages/assemble.ts`). Il partage un verrou avec `combat.html` : un seul overlay à l'écran.

Tant que l'amont est la référence, `src/overlay.html` est une copie exacte de `legacy/overlay.html`. Si l'amont la modifie, `tools/legacy-sync/test/copies.test.ts` échoue jusqu'à ce qu'on la recopie.
