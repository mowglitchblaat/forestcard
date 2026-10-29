# Edge function swift-responder

La fonction Supabase qui calcule les combats (`!combat`, duels payants) et distribue le booster quotidien. Elle est déployée en collant **un seul fichier** dans le dashboard Supabase, sans CLI.

## Générer le fichier à coller

```bash
vp run build        # depuis apps/edge
```

Le build produit `apps/edge/dist/swift-responder.ts`. Ce fichier contient le serveur, le moteur et la projection du journal, sans aucun import. On le colle tel quel dans Supabase > Edge Functions > swift-responder, puis on clique sur Deploy.

Sans rien installer, le fichier se récupère sur le site publié : à chaque push sur `main`, le workflow « Site » (`.github/workflows/pages.yml`) le construit après avoir fait passer le lint et tous les tests, et le sert à `<site>/edge/swift-responder.ts` (`tools/pages/assemble.ts`). Il ne contient aucun secret : tout passe par `Deno.env`.

On ne modifie jamais ce fichier généré. On modifie `src/swift-responder.js` ou le moteur, puis on relance le build.

## Ce qui est où

- `src/swift-responder.js` : le code serveur legacy, copié tel quel, avec une seule différence : le moteur est importé (`simuler` de `@forestcard/journal`) au lieu d'être recopié dans le fichier. Les réglages (`NOM_MONNAIE`, `REGLES`, `PAYER_ADVERSAIRE`) sont en tête du fichier.
- `vite.config.ts` : la configuration du build (un seul fichier ESM, dépendances inlinées, extension `.ts`, en-tête `// @ts-nocheck`).
- `test/equivalence.test.ts` : la preuve que le fichier généré se comporte comme `legacy/swift-responder.ts`.

## Vérifier

```bash
vp run test         # depuis apps/edge : reconstruit, puis teste
```

Le test charge les deux fichiers sous Node, avec un faux `Deno.serve`, un faux Supabase (`fetch`) et un `Math.random` déterministe. Il leur envoie les mêmes requêtes : combats gratuits, duels, bounty, multiplicateur, booster quotidien, et les cas d'erreur (mauvais secret, deck de 9 cartes, quota épuisé, anti-farm). Il exige ensuite des réponses identiques **et** des appels à Supabase identiques. Ces appels portent tout ce que le serveur calcule autour du combat (tours, dégâts totaux, plus gros coup, historique, gains), donc ces calculs sont comparés eux aussi.

Un second test échoue si le code serveur legacy change lors d'une resynchronisation de `legacy/`. Il faut alors reporter le changement dans `src/swift-responder.js`.

## Jeu en pause (let's play) et site

Le réglage `jeu_live` (Admin > Réglages, `db/migrations/32-mode-site.sql`) coupe le jeu en live : un appel de Streamer.bot (secret `x-secret`) reçoit alors « jeu en pause » (409). La fonction accepte aussi les appels du site (onglet « 🎮 Jouer ») : sans secret, elle lit le jeton de connexion du joueur (champ `jeton` du corps, ou `Authorization` ; le site envoie une requête « simple », sans pré-vérification CORS), retrouve son compte et son identifiant Twitch, et joue le même combat ou le même booster quotidien que le live. Elle refuse ces appels quand le jeu est en live, sauf pour l'admin. Un duel lancé depuis le site coûte du gold (`duel_site_prix`), prélevé une fois le combat calculé. Les réponses portent les en-têtes CORS (le site appelle depuis le navigateur). Quand le jeu est fermé (`jeu_ferme`, `db/migrations/40-jeu-ferme.sql`), tous les appels reçoivent « jeu fermé » (409), en live comme depuis le site, sauf ceux de l'admin connecté au site. `!booster` ne passe pas par cette fonction : il est bloqué en base (déclencheur sur `stock_boosters`). La fonction doit garder « Verify JWT » désactivé (Streamer.bot n'envoie pas de jeton).

## Tournois

`db/migrations/46-tournois.sql`. Deux modes, envoyés par deux actions Streamer.bot (secret `x-secret`), jamais depuis le site :

- `tournoi` (commande `!tournoi`, tout le monde) : inscrit le joueur au tournoi ouvert (`tournoi_inscrire`) ; avec `quitter` (ou `retirer`) après la commande, le retire (`tournoi_quitter`) ; avec `info`, dit où en est le tournoi (`tournoi_etat`). Comme pour le championnat, le texte de la commande peut arriver dans le mode lui-même (« tournoi quitter »).
- `tournoi_suivant` (action « Tournoi - Suivant », réservée au streamer, et relancée par l'overlay à la fin de chaque combat) : n'a pas de joueur. `tournoi_preparer` tire le tableau si le tournoi est encore aux inscriptions, puis renvoie le prochain match et les deux decks figés ; le combat est calculé par `simulerRelais` (3 combattants, aucun gold), enregistré dans `historique_combats` (mode `tournoi`, qui porte aussi le signal de fin d'animation), puis `tournoi_conclure` compte le combat, fait passer le vainqueur du match et termine le tournoi après la finale (trophées, gold). La réponse porte `tournoi` (tour, format, scores avant et après dans l'ordre des côtés du combat, tableau avant le combat, tableau final, `suite`, `pause`) pour l'overlay, et `annonce` pour le chat.

Tant qu'un tournoi est en cours (`statut = 'en_cours'`), les autres combats attendent la finale : combat du jour, duel, `defi` et `accepter` reçoivent « tournoi en cours » (409). `refuser`, `ceintures`, le booster quotidien et les commandes du tournoi marchent toujours.
