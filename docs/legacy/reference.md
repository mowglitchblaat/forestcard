# Legacy : référence et carte des consommateurs

Repo `mowglitchblaat/forestcard`, branche `main`, au commit noté dans `legacy/SOURCE`. Les notes de `docs/legacy/` ont été écrites sur `22226f4` (2026-10-17) ; les synchros suivantes n'ont pas touché `moteur-combat.js`.

## Flux d'un combat

```
!combat dans le chat
  → Streamer.bot : POST HTTP vers swift-responder (header x-secret)
      1. quota du jour, anti-farm, validité des decks (RPC SQL)
      2. Moteur.simuler(...)   seul calcul qui compte
      3. gold, stats, historique (seed + déroulé) en base
      4. renvoie {journal, annonce}
  → Streamer.bot relaie le journal par WebSocket (ws://127.0.0.1:8080)
  → combat.html le rejoue en animation, sans recalculer
  → à la fin, combat.html envoie l'annonce au chat (DoAction) et appelle rpc combat_affiche(seed)
```

## Fichiers et rôle

| Fichier | Rôle | Lien au moteur |
|---|---|---|
| `moteur-combat.js` | moteur de référence des tests | copie 1 |
| `swift-responder.ts` | Supabase Edge Function (Deno). Combats, booster quotidien, gains, bounty, historique | copie 2. `.ts` de nom seulement : `// @ts-nocheck`, aucune annotation de type |
| `combat.html` | overlay OBS du combat, plus les modes test, démo et simulateur de winrate | copie 3. `jouer(res)` rejoue le journal |
| `index.html` | site joueur + admin (Supabase JS) | `canonFx` recopie `canon`/`canonP`. `fxEffet`/`fxPassif` décrivent les effets |
| `catalogue.html` | catalogue imprimable | normalisation perso en ligne (l. 155). `core`/`ultTxt` décrivent les effets |
| `overlay.html` | overlay OBS des boosters | aucun. Partage un verrou avec `combat.html` (un seul overlay à l'écran) |
| `tests/moteur.test.js` | 45 tests `node:test` | le dernier test vérifie que les 3 copies sont identiques |
| `docs/workflow-combat.md` | schémas mermaid du déroulé | doc des règles |
| `*.sql` (10 à 26) | migrations Supabase, copiées chez nous dans `db/migrations/` | tables `cartes`, `historique_combats`, `reglages_jeu`, `effets_perso`… |
| `outils/copier-images.mjs` + workflow | copie nocturne des images Supabase vers `img/` | aucun |
| `cadres/*.png` | cadres des cartes (fond selon type et rareté), utilisés par `index.html` | aucun |
| `.github/workflows/` | `tests.yml` (tests du moteur à chaque push), `images.yml` (copie nocturne des images, puis rebuild de Pages) | aucun |
| `img/` | images des cartes recopiées par le bot, servies en `/img/`. **Pas dans `legacy/`** : ce sont des données, pas du code | aucun |

Les trois copies du moteur sont identiques au caractère près au commit de référence (vérifié par diff).

## Données des cartes

Une carte est une ligne de la table `cartes` : `type` (`combattant` | `magie` | `piege`), `nom`, `atq`, `pv`, `passif`, `ultime`, `effet`, plus `raretes`, `collections`, `variantes_carte`. Un passif ou un effet est soit une brique `{type, …}`, soit `{briques: [...]}`. Un piège a la forme `{condition, effet, declenchements}`.

## Ce qui manque au repo, et les réponses de l'auteur (2026-10-17)

- **Scripts SQL 01 à 09** : l'auteur ne les a plus. Il propose de les remplacer par des exports du schéma, sans données : code des fonctions SQL (`pg_get_functiondef`, filtre `prokind = 'f'`), tables et colonnes, règles RLS, triggers. `24-champignons.sql` a été renommé `24-jeux-du-jour.sql`.
- **RPC** `preparer_combat`, `enregistrer_combat`, `rendre_combat_quotidien`, `combat_affiche` : leur définition sera dans l'export des fonctions. `preparer_combat` construit les decks passés au moteur (contenu, champs et ordre des cartes). `tire()` choisit par index dans le deck filtré, donc l'ordre fait partie de l'entrée ; le run d'iso mélange cet ordre (suite `decks`), donc l'ordre exact de la prod n'est pas nécessaire à la preuve. Il ne servirait qu'à rejouer un combat précis de la prod.
- **Déploiement de swift-responder** : le code est collé à la main dans le dashboard Supabase (Edge Functions → swift-responder → coller → Deploy). Pas de CLI, pas de dossier `supabase/`. **La référence est GitHub** (tranché) : si le code collé en prod diffère de `swift-responder.ts`, c'est à l'auteur de les réaligner ; on ne compare pas avec la prod.
- **Streamer.bot** : il propose un export des actions de combat et de booster, avec les secrets remplacés par `XXX` (x-secret, clés `sb_secret…`, clés `eyJ…`). La clé publishable est laissée, elle est publique.
- **OBS** : URL des sources navigateur combat et booster.

⚠ Aucun de ces fichiers n'a été reçu (au 2026-10-17, seul le lien du repo). Aucun n'est nécessaire à la réécriture (référence = GitHub, ordre des decks couvert par l'iso). S'ils arrivent, ils vont dans `docs/legacy/auteur/`, et l'export Streamer.bot est relu pour les secrets avant tout commit.

## À vérifier avec l'auteur à la reprise : ce que le site React a déduit

Le site (`apps/web`) appelle des fonctions SQL dont le code manque au repo (scripts 01 à 09). La forme de leur réponse et leurs codes d'erreur y sont déduits de la façon dont l'ancienne page les lit ; zod vérifie chaque réponse et nomme le champ qui diffère. L'export des fonctions proposé par l'auteur tranche chaque point.

- **Decks** (`mes_decks`, `sauver_deck`, `supprimer_deck`, script 09) :
  - le site suppose qu'un deck est identifié par son nom côté serveur : l'ancienne page enregistre un deck existant en rappelant `sauver_deck` avec le même nom, et le renomme en enregistrant sous le nouveau nom puis en supprimant l'ancien. Le site refuse donc deux decks du même nom. À confirmer : sinon, enregistrer créerait des doublons au lieu de mettre à jour ;
  - constaté sur un compte joueur (2026-10-18) : aucun deck enregistré, seulement un deck de combat. L'ancienne page n'affiche pas clairement s'il existe des decks enregistrés, donc impossible de dire si le compte n'en a vraiment aucun ou si `mes_decks` répond autrement que prévu. À vérifier avec un compte qui en a.
- **Profils** (`profil_public`, `liste_profils`, scripts 05 et 06) : champs de `stats`, des cartes `plus_jouee` / `plus_gagnante`, et des lignes du classement global.
- **Dos de cartes** (`mes_dos`, `choisir_dos`, script 07) : `id`, `nom`, `image`, `actif`, `par_defaut`.
- **Boutique** (`vedettes_boosters`, `acheter_booster`) : champs des cartes à l'affiche ; l'erreur « pas assez de gold » reconnue à la présence de `MONNAIE` dans le message.
- **Recyclage** (`recycler_doublons`, avec ou sans `p_variante`) : le résultat (`cartes`, `gold`, `fragments`) et l'erreur `RIEN_A_RECYCLER`.
- **Propositions** (`proposer_carte`, script 12, et le stockage des images) : l'envoi réel n'a jamais tourné. Il crée une proposition visible par l'auteur, donc il n'a été essayé que dans le build de démo, où un magasin en mémoire applique les règles de `proposer_carte`. À essayer une fois avec l'auteur : envoi des deux images, appel de `proposer_carte`, images supprimées si elle refuse, retrait.

## Contraintes posées par l'auteur

- La page de test `combat.html?test` ne change pas de présentation. On peut seulement y ajouter des choses.
- Les règles de jeu décidées sont celles de `tests/moteur.test.js` : un test qui casse est une régression.

L'edge function exige un deck de 10 cartes (au moins 3 de chaque type). Le moteur tire 1 combattant, 1 magie et 1 piège dans le deck.
