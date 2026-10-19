# Forest Card

Jeu de cartes Twitch : des combats entre decks de viewers, calculés par une edge function Supabase et rejoués en animation dans OBS, un site pour la collection et l'admin, un catalogue imprimable.

Ce repo est la réécriture en TypeScript du moteur de combat et des pages qui l'utilisent. **Un seul moteur** (`packages/engine`) sert l'edge function, l'overlay OBS, le simulateur, le site et le catalogue. Il calcule un combat et émet des événements typés ; le texte du journal et la description des effets vivent à part.

La réécriture est **iso** : mêmes decks + même seed ⇒ même journal que l'ancien moteur, champ par champ. La preuve est le run d'iso complet, qui compare les deux moteurs sur des centaines de millions de combats ; la réécriture ne remplace l'ancien code qu'une fois ce run passé sans divergence (`tools/iso/README.md`).

## Démarrer

Node 24 (22.18 au minimum) et pnpm 12 (`corepack enable` le fournit, la version est fixée dans `package.json`).

```bash
pnpm install
pnpm run ready     # format, lint, types et tous les tests
pnpm run pages     # construit les pages et assemble le site dans _site/
```

Les outils passent par Vite+ (`vp`), installé avec les dépendances : `pnpm exec vp …`, ou `vp …` s'il est installé globalement.

## Ce qui est où

```
packages/
  engine/      le moteur de combat : le domaine, sans texte, sans DOM, sans Node
  journal/     le journal du combat (texte en français), produit à partir des événements du moteur
  describe/    le texte de chaque effet, passif et condition, et les listes de l'éditeur admin
apps/
  edge/             l'edge function swift-responder : un fichier à coller dans Supabase
  overlay-combat/   combat.html, l'overlay OBS du combat (et ses modes test, démo, winrate)
  overlay-boosters/ overlay.html, l'overlay OBS des boosters
  site/             index.html, le site joueur et l'admin
  catalogue/        catalogue.html, le catalogue imprimable
  simulator/        les winrates d'équilibrage en ligne de commande
assets/        fichiers servis tels quels : cadres des cartes, images des cartes (img/)
db/migrations/ les scripts SQL de la base
tools/
  iso/           le run d'iso : nouveau moteur contre l'ancien
  pages/         l'assemblage du site publié
  copier-images/ la copie nocturne des images depuis Supabase
  legacy-sync/   la synchro avec l'ancien code (tant qu'il reste la référence)
legacy/        copie exacte de l'ancien code, l'oracle du run d'iso
docs/          la documentation (en français)
```

Chaque app a son `README.md` : comment la générer, et la preuve qu'elle fait la même chose que l'ancienne page.

## Publier

| Quoi                      | Comment                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Site, overlays, catalogue | automatique : `.github/workflows/pages.yml` publie sur GitHub Pages à chaque push sur `main`, aux mêmes adresses qu'avant                       |
| Images des cartes         | automatique : `.github/workflows/images.yml`, chaque nuit                                                                                       |
| Edge function             | à la main : `vp run build` dans `apps/edge`, puis coller `apps/edge/dist/swift-responder.ts` dans le dashboard Supabase (`apps/edge/README.md`) |
| Migration SQL             | à la main, dans l'éditeur SQL de Supabase (`db/README.md`)                                                                                      |

## Équilibrage

```bash
pnpm run sim --kind combattant --test Légendaire   # winrate des combattants légendaires contre tous les autres
```

Mêmes chiffres que le simulateur de `combat.html`, sur tous les cœurs (`apps/simulator/README.md`).

## Documentation

| Document                          | Pour                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `docs/glossaire.md`               | le vocabulaire du jeu : clé en base ↔ nom dans le code ↔ sens (combat > manche > round > tour, chaque effet) |
| `docs/guides/ajouter-un-effet.md` | ajouter un effet, un passif ou une condition de piège : les dix endroits à toucher                           |
| `docs/guides/basculement.md`      | le passage de l'ancien code à celui-ci : adresses, workflows, gestes à faire à la main                       |
| `docs/adr/`                       | les décisions du projet, et pourquoi (une par fichier)                                                       |
| `docs/legacy/`                    | l'ancien moteur : son fonctionnement, ses pièges, ses bizarreries conservées                                 |
| `AGENTS.md`                       | les règles du projet, pour un agent (Claude…) comme pour un humain                                           |
