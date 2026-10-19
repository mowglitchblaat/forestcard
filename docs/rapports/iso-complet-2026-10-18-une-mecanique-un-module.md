# Run d'iso complet du 2026-10-18 : une mécanique, un module

Preuve du refactor « une mécanique = un module » du moteur TS (`docs/decisions.md`, « Une mécanique, un module (moteur) ») : chaque mécanique dans `packages/engine/src/mechanics/`, l'ordre des étapes d'un tour dans `combat/moments.ts`, les effets en registre assemblé depuis les mécaniques. Aucun changement de comportement attendu.

Référence : `legacy/moteur-combat.js` au commit amont `4e77fd8`. Candidat : le moteur TS et la projection du journal (`packages/journal`) de la branche `engine-mechanics` au commit `866ce30`. Cartes : `docs/legacy/cartes-2026-10-18.json` (90 cartes). Empreinte du code et des cartes : `dec128db08f7`. 1 seed par rencontre réelle.

| Suite | Rencontres | Résultat | Durée cumulée |
|---|---|---|---|
| synthetic | 5 000 000 | 0 divergence | 0.04 h |
| dirty | 5 000 000 | 0 divergence | 0.05 h |
| decks | 2 000 000 | 0 divergence | 0.05 h |
| real | 429 981 696 | 0 divergence | 3.34 h |

**Iso prouvée : aucune divergence sur les quatre suites.**

Le run a été interrompu une fois, dans la suite real à 381 450 000 rencontres : la machine manquait de mémoire (32 workers, environ 1,4 Go libres), et la tâche a été arrêtée de l'extérieur. Il a repris à ce point depuis son checkpoint, avec la même empreinte, sur 24 workers. Les suites synthetic, dirty et decks avaient tourné sur 32 workers.

Débit de la suite real : environ 35 000 rencontres/s sur 32 workers sous pression mémoire, environ 36 800 sur 24 workers ; le run précédent (`iso-complet-2026-10-18-souffle-missiles.md`, avant le refactor) tenait 3.05 h sur 32 workers. L'écart de durée n'est pas une mesure du coût du refactor (machine chargée, workers différents) : la comparaison de performance `main` contre `engine-mechanics` reste à faire au calme.
