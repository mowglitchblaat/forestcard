# `combat-3d.html` et `booster-3d.html` : les overlays en WebGL

La page OBS qui joue les combats avec `@forestcard/overlay-3d` (Pixi 8). La décision : `docs/adr/0009-overlays-en-webgl.md`.

## Dans OBS

Source navigateur 1920 × 1080 sur `https://mowglitchblaat.github.io/forestcard/combat-3d.html`. Comme `combat.html`, la page écoute Streamer.bot (`ws://127.0.0.1:8080`, événements `General.Custom`) et joue chaque combat reçu, l'un après l'autre. Elle n'annonce rien à Streamer.bot : `combat.html` continue de le faire. Pour l'essayer, masquer la source de `combat.html` et afficher celle-ci.

## Ouvertures de boosters

`booster-3d.html` est la même page en mode booster (`<body data-mode="booster">`) : source navigateur 1920 × 1080 sur `https://mowglitchblaat.github.io/forestcard/booster-3d.html`, à la place de `overlay.html`. Elle lit les mêmes messages (`cartes`, enveloppés ou non dans `data` ou `ouvrir_booster`) et l'image du booster comme `overlay.html` : celle du message (`image_path`), sinon lue dans `types_boosters` d'après son nom. Retour en arrière : réafficher `overlay.html`. En test (`?test`), le bouton « Ouvrir un booster » tire des cartes du snapshot (`?cartes=10` pour un booster de 10, `?booster=<nom>` pour son nom).

Les tailles sont celles de l'ancien overlay : cartes de combat de 540 px de haut (`config/combat.ts`), boosters centrés, cartes d'environ 330 px de large (`config/booster.ts`).

## Paramètres

- `?test` : un panneau pour jouer des combats calculés dans la page par le moteur, avec les cartes du snapshot (`docs/legacy/cartes-2026-10-19.json`), simple ou en relais. Sans live ni Streamer.bot.
- `?qualite=eco` : la qualité éco (moins de travail pour la carte graphique, voir `packages/overlay-3d/src/config/quality.ts`).
- `?local` : pas de connexion à Streamer.bot.

## Images

Les cadres et les écriteaux viennent du site (`cadres/`), gardés pour toute la vie de la page. Les images des cartes viennent du miroir GitHub (`img/`, copié chaque nuit) quand elles y sont, sinon de Supabase, comme pour `combat.html`.

## Construire

`vp build` (dans `apps/overlay-3d`) : `dist/index.html` et ses scripts dans `dist/overlay-3d/`, publiés par `tools/pages/assemble.ts`.
