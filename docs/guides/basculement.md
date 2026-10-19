# Basculement : ce repo remplace le code de l'auteur

Ce qui change dans le repo `mowglitchblaat/forestcard` le jour où ce projet y entre, et les gestes à faire à la main. Ce sont nos recommandations : une fois le code chez lui, l'auteur en fait ce qu'il veut.

## Le run d'iso ne sert qu'à la réécriture

Le run d'iso (`tools/iso`) prouve une seule chose : que le moteur réécrit donne le même journal que le moteur de l'auteur, sur toutes les rencontres. C'est la preuve que la réécriture n'a rien changé, pas un test du jeu.

**Après la bascule, nous recommandons de le retirer : le garder serait contre-productif.** Une fois le code chez l'auteur, le moteur TS devient la référence et l'ancien moteur n'a plus de rôle. Corriger une bizarrerie, faire évoluer une règle, ajouter un effet : chaque changement voulu ferait diverger le moteur de l'ancien, et le run échouerait. Il bloquerait alors les évolutions sans plus rien protéger. Le filet, ce sont alors les tests : ceux de l'auteur (`moteur.test.js`) et ceux du moteur.

**Les nouveautés que la réécriture n'a pas reprises.** `legacy/SOURCE` donne le dernier commit de l'auteur reporté dans le moteur TS. Si le moteur de l'auteur a changé après ce commit, ces changements ne sont pas dans le moteur TS : pour les garder, il faut les refaire dans le moteur TS, et les tester sans run d'iso pour guider (un test par nouveauté dans `moteur.test.js`, comme l'auteur le fait déjà).

## Sans accès à la base, au rôle admin, ni au dépôt GitHub

La réécriture a été faite sans accès à la base Supabase de l'auteur, sans rôle admin, et sans accès à son dépôt GitHub. Ce qui touche à la base (la lecture des données pour un combat, `apps/web`, les vues d'admin, qui ne sont pas implémentées) n'a donc jamais tourné contre la vraie base. Les workflows GitHub Actions (`.github/workflows/` : tests, publication du site, copie des images) n'ont jamais tourné non plus : la CI et la publication n'ont pas été testées. Le vérifier, et détecter ce qui ne va pas, revient à l'auteur et à son Claude.

## Ce qui est servi, avant → après

Les adresses publiques ne changent pas : les sources OBS, `MIROIR_URL` et les liens entre pages restent valides.

| Adresse | Avant (racine du repo, Pages « depuis la branche ») | Après (Pages « GitHub Actions », `_site/` assemblé) |
|---|---|---|
| `/index.html` | `index.html` | `apps/site/dist/index.html` (généré) |
| `/combat.html` | `combat.html` | `apps/overlay-combat/dist/combat.html` (généré) |
| `/catalogue.html` | `catalogue.html` | `apps/catalogue/dist/catalogue.html` (généré) |
| `/edge/swift-responder.ts` | (nouveau) | `apps/edge/dist/swift-responder.ts` (généré) : le fichier de l'edge à coller dans Supabase |
| `/overlay.html` | `overlay.html` | `apps/overlay-boosters/src/overlay.html` |
| `/patchnotes.json` | `patchnotes.json` | `apps/site/public/patchnotes.json` |
| `/cadres/` | `cadres/` | `assets/cadres/` |
| `/img/` | `img/` | `assets/img/` |

Les autres fichiers de la racine trouvent leur place ainsi : `NN-*.sql` → `db/migrations/`, `outils/copier-images.mjs` → `tools/copier-images/`, `moteur-combat.js` → remplacé par `packages/engine`, ses tests (`tests/moteur.test.js`) → gardés, ils tournent contre le moteur TS (`packages/engine/test/legacy-rules.test.ts`, qui les lit aujourd'hui dans `legacy/`), `swift-responder.ts` → généré par `apps/edge`.

## Workflows

| Workflow | Rôle |
|---|---|
| `tests.yml` | `pnpm run ready` (format, lint, types, tous les tests) et un échantillon d'iso, à chaque push |
| `pages.yml` | build, vérifications, assemblage (`pnpm run pages`) et publication du site. À chaque push sur `main`, à la main, ou appelé par `images.yml` |
| `images.yml` | copie nocturne des images vers `assets/img/`, puis appelle `pages.yml` s'il y a du nouveau. Remplace l'appel à `gh api …/pages/builds` : avec Pages en mode « GitHub Actions », il faut relancer le build par le workflow |

## À faire à la main, dans l'ordre

1. **Déplacer les images** : `git mv img assets/img`. Sans ce déplacement, le job de nuit ne voit pas les images déjà copiées et les retélécharge toutes, et d'ici là le site est publié sans `/img/` : `assemble.ts` traite `assets/img` comme facultatif et ne bloque pas (le site retombe alors sur les images Supabase, qui consomment le quota).
2. **Réglages → Pages → Source : « GitHub Actions »**. Sans ce réglage, Pages continue de servir la racine du repo, où les pages générées n'existent pas.
3. **Secret `SUPABASE_SERVICE_KEY`** : inchangé, `images.yml` l'utilise sous le même nom.
4. **Retirer `legacy/`** :
   - d'abord, déplacer `legacy/tests/moteur.test.js` dans `packages/engine/test/` et pointer `legacy-rules.test.ts` dessus : ce sont les tests de règles de l'auteur, ils restent ;
   - retirer ce qui ne sert qu'à comparer avec l'ancien code : le run d'iso (`tools/iso` en entier, son échantillon dans `tests.yml`, les tâches `iso*` du `package.json` racine et ses commandes dans `tools/node-only/README.md` et la section « Vérifier » d'`AGENTS.md` : voir « Le run d'iso ne sert qu'à la réécriture » plus haut), les tests de dérive (`tools/legacy-sync/test/`), les tests « identique au legacy » des apps (site, catalogue, overlay, edge, et `apps/simulator/test/winrate.test.ts`, qui exécute le `wrCalc` de `legacy/combat.html`), puis `tools/legacy-sync` ;
   - retirer `legacy` de `pnpm-workspace.yaml`, puis `legacy/` passe dans `.gitignore` ;
   - retirer la section « Transition » d'`AGENTS.md` : ses règles (iso, `legacy/`, pages de l'auteur, copie des migrations) n'ont plus d'objet. Les décisions qui restent sont dans `docs/adr/`.
5. **Edge function** : coller le fichier généré dans le dashboard Supabase, comme avant. Sans installation, il est sur le site publié, à `<site>/edge/swift-responder.ts`, construit et testé par le workflow « Site » ; avec, c'est `apps/edge/dist/swift-responder.ts` (voir `apps/edge/README.md`).
