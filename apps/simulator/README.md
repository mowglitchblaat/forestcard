# Simulateur d'équilibrage

Les statistiques de winrate du panneau « 📊 Statistiques de winrate » de `combat.html`, en ligne de commande, sur tous les cœurs et sans animation. **Mêmes chiffres que la page** : même calcul (`wrCalc`), mêmes seeds, mêmes tirages d'équipement.

## Lancer

Depuis la racine du repo :

```bash
vp run sim --kind combattant --test Légendaire        # winrate des combattants légendaires contre tous les autres
vp run sim --kind combattant --test 45,62 --n 100     # deux cartes précises, 100 duels par adversaire
vp run sim --kind magie --n 500                       # effet de chaque magie (avec / sans), 500 duels par carte
vp run sim --kind piege --mt '' --mo s                # pièges ; cartes testées sans magie, adversaires comme les testées
vp run sim --kind combattant --json > resultats.json  # résultats bruts
```

| Option        | Sens                                                                                         | Défaut                               |
| ------------- | -------------------------------------------------------------------------------------------- | ------------------------------------ |
| `--cards`     | export JSON de la table `cartes` (format du catalogue)                                       | `docs/legacy/cartes-2026-10-19.json` |
| `--kind`      | `combattant`, `magie` ou `piege`                                                             | `combattant`                         |
| `--test`      | `all`, un nom de rareté, ou des ids séparés par des virgules                                 | `all`                                |
| `--mode`      | combattants : adversaires `all`, de même rareté `rar`, ou seulement les cartes testées `sel` | `all`                                |
| `--n`         | duels par adversaire (combattants) ou par carte testée (magies, pièges)                      | 50 / 500                             |
| `--mt` `--pt` | magie / piège des cartes testées : `''` aucun, `r` au hasard, ou un id                       | `r`                                  |
| `--mo` `--po` | magie / piège des adversaires : idem, plus `s` « comme les cartes testées »                  | `r`                                  |
| `--workers`   | nombre de workers                                                                            | tous les cœurs                       |
| `--json`      | sortie JSON au lieu du tableau                                                               | non                                  |

L'ordre des cartes compte, puisque les seeds dépendent de la position de chaque carte. L'export du catalogue est trié par nom par la base, comme la requête de la page, donc on garde l'ordre du fichier.

## Vérifier

`vp run test` (depuis `apps/simulator`) exécute **le vrai `wrCalc` extrait de `combat.html`** sur le moteur legacy et le compare à ce simulateur sur plusieurs configurations : combattants, magies, pièges, modes et équipements. Chaque compteur doit être identique. Un test vérifie aussi qu'un calcul découpé entre workers donne les mêmes chiffres qu'un calcul d'un seul bloc.
