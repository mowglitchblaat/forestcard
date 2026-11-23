# `combat-3d.html` : l'overlay de combat en WebGL

La page OBS qui joue les combats avec `@forestcard/overlay-3d` (Pixi 8). La décision : `docs/adr/0009-overlays-en-webgl.md`.

## Dans OBS

Source navigateur 1920 × 1080 sur `https://mowglitchblaat.github.io/forestcard/combat-3d.html`. Comme `combat.html`, la page écoute Streamer.bot (`ws://127.0.0.1:8080`, événements `General.Custom`) et joue chaque combat reçu, l'un après l'autre. Elle n'annonce rien à Streamer.bot : `combat.html` continue de le faire. Pour l'essayer, masquer la source de `combat.html` et afficher celle-ci.

## Paramètres

- `?test` : un panneau pour jouer des combats calculés dans la page par le moteur, avec les cartes du snapshot (`docs/legacy/cartes-2026-10-19.json`), simple ou en relais. Sans live ni Streamer.bot.
- `?qualite=eco` : la qualité éco (moins de travail pour la carte graphique, voir `packages/overlay-3d/src/config/quality.ts`).
- `?local` : pas de connexion à Streamer.bot.

## Images

Les cadres et les écriteaux viennent du site (`cadres/`), gardés pour toute la vie de la page. Les images des cartes viennent du miroir GitHub (`img/`, copié chaque nuit) quand elles y sont, sinon de Supabase, comme pour `combat.html`.

## Construire

`vp build` (dans `apps/overlay-3d`) : `dist/index.html` et ses scripts dans `dist/overlay-3d/`, publiés par `tools/pages/assemble.ts`.
