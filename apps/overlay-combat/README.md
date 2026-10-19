# Overlay de combat (combat.html)

La page OBS qui rejoue un combat à partir du journal reçu par WebSocket, avec ses modes test (`combat.html?test`), démo et simulateur. Elle fonctionne seule, en un seul fichier, comme avant.

## Générer la page

```bash
vp run build        # depuis apps/overlay-combat
```

Le build produit `dist/combat.html`. Elle est publiée automatiquement à la même adresse que l'ancienne, par `.github/workflows/pages.yml` (voir `docs/guides/basculement.md`).

Le build fait deux choses :

1. `vp pack` construit le moteur partagé (`@forestcard/journal` + `@forestcard/engine`) sous forme d'un script classique qui définit le global `Moteur` (`simuler`, `REG`), comme le faisait la copie intégrée ;
2. `build.ts` insère ce script dans `src/combat.html`, à l'emplacement du marqueur `/*@@ENGINE@@*/`, c'est-à-dire là où se trouvait la copie du moteur.

On ne modifie jamais `dist/combat.html`. La page se modifie dans `src/combat.html`, le moteur dans `packages/`.

## Vérifier

```bash
vp run test         # depuis apps/overlay-combat : reconstruit, puis teste
```

- **Présentation** : hors du bloc moteur, `dist/combat.html` est identique octet pour octet au `combat.html` legacy (contrainte de l'auteur sur `combat.html?test`).
- **Moteur** : le script inliné est exécuté comme dans le navigateur, puis comparé au moteur legacy sur des rencontres des quatre suites d'iso.
- **Dérive** : `src/combat.html` doit rester le legacy avec son bloc moteur remplacé par le marqueur. Si l'amont modifie la page, ce test échoue jusqu'au report.
