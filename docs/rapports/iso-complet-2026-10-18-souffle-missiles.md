# Run d'iso complet du 2026-10-18 : souffle et missiles

Preuve du report de la synchro amont « Souffle et missiles » (détonation, missiles, souffle étendu, attaque bloquée, programmation) dans le moteur TS.

Référence : `legacy/moteur-combat.js` au commit amont `4e77fd8`. Candidat : le moteur TS et la projection du journal (`packages/journal`) de la branche `sync-souffle-missiles` au commit `b36abfe`. Cartes : `docs/legacy/cartes-2026-10-18.json` (90 cartes). Empreinte du code et des cartes : `0003c00c98fe`. 32 workers, 1 seed par rencontre réelle.

| Suite | Rencontres | Résultat | Durée cumulée |
|---|---|---|---|
| synthetic | 5 000 000 | 0 divergence | 0.04 h |
| dirty | 5 000 000 | 0 divergence | 0.05 h |
| decks | 2 000 000 | 0 divergence | 0.05 h |
| real | 429 981 696 | 0 divergence | 3.05 h |

**Iso prouvée : aucune divergence sur les quatre suites.**

Avant ce run, la suite synthetic avait divergé à la rencontre 564841, sur le seul champ `tour` : une annonce de piège « évite la mort » retenue puis libérée était projetée avec le round courant au lieu de celui de sa capture. Corrigé par `b36abfe` (voir `docs/legacy/moteur.md`), puis ce run complet.

Le run précédent (`iso-complet-2026-10-18.md`) prouvait le moteur avant cette synchro, contre l'amont `81471e8` et 87 cartes.
