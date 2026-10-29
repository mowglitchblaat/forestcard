# Site joueur et admin (index.html)

Le site : collection, decks, boutique, admin… Deux parties passent par le build : la **description des effets** (l'ancien bloc `/* FX-BEGIN */ … /* FX-END */`) et les **listes de l'éditeur admin** (`P`, `PAS`, `ULT`, `MAG`, `CON`). Les deux viennent de `packages/describe`. Le reste de la page est inchangé.

## Générer la page

```bash
vp run build        # depuis apps/site
```

Le build produit `dist/index.html`. C'est le gabarit `src/index.html` dans lequel, à l'emplacement du bloc FX, le build insère :

- le code de description (`vp pack`, global `SiteDescribe`) ;
- la ligne `const { nz, fxPassif, fxEffet, fxCond, fxTrigUlt, lignesCarte } = SiteDescribe;`.

Et, à l'emplacement des listes de l'éditeur (marqueur `/*@@EDITOR@@*/`), la ligne `const { P, PAS, ULT, MAG, CON } = SiteDescribe;`.

Le reste de la page utilise ces noms comme avant. On ne modifie jamais `dist/index.html`.

## Composeur de carte (admin)

Dans Admin → Cartes, l'admin envoie le **dessin seul** : la page pose le cadre (`cadres/<type>-<rareté>.png`), l'écriteau ajusté au texte (`cadres/ecriteau-<rareté>.png`, bande sombre pour une commune), l'ultime à sa DA (italique rouge sombre) et les passifs au code couleur des effets, chacun avec son explication en petit (texte du site, modifiable), puis l'ATQ et les PV. Une magie ou un piège n'a pas d'écriteau (charte) : ses effets (et la condition du piège) sont écrits dans la zone libre du cadre, sous la fenêtre du dessin. À l'enregistrement, elle crée l'image normale et l'image de combat (sans chiffres), et garde le dessin et ses réglages sur la version Standard (`dessin_path`, `compo` : `db/migrations/29-composition-cartes.sql`). Quand la carte est modifiée sans nouvelle image, ses images sont refaites avec la carte telle qu'elle est. Les noms courts de l'écriteau viennent de `packages/describe/src/plaque.ts` (le build les livre sous `lignesEcriteau`, avec les couleurs `COULEURS_CAT`) ; l'admin peut remplacer chaque ligne. L'ancien envoi d'images déjà prêtes reste possible. Le bouton « Refaire toutes les images composées » régénère d'un coup les images de toutes les cartes qui ont un dessin, avec le rendu actuel du composeur. « Style de toutes les cartes composées » change un réglage partout (police, pastilles ou texte coloré, explications, ultime à la DA), l'enregistre dans le `compo` de chaque carte, puis refait leurs images.

## Propositions des joueurs

Dans l'onglet Propositions, le joueur crée sa carte entièrement avec le même panneau que l'admin (`htmlCompo`, `brancherCompo` dans `index.html`) : nom, type, rareté, stats, ultime (avec son déclenchement), passifs, effet de magie, condition et effet de piège, choisis dans les listes de l'éditeur (sans la programmation), et le dessin composé en direct. La proposition garde le dessin, la carte composée, les effets et les réglages (`db/migrations/30-propositions-completes.sql`). Dans Admin → Propositions, l'admin voit les effets décrits, et « ➕ Créer la carte » en fait une vraie carte non publiée, avec ses images composées et son dessin gardé, puis accepte la proposition.

## Jeu en pause : l'onglet « 🎮 Jouer »

Quand l'admin met le jeu en pause (Admin > Réglages > « Jeu en live », `db/migrations/32-mode-site.sql`), l'onglet « 🎮 Jouer » apparaît pour tous (toujours visible pour l'admin, pour tester). On y ouvre ses boosters (`ouvrir_booster_site`, la même ouverture que `!booster`), on récupère son booster du jour et on fait ses combats (combat du jour, duel payé en gold), calculés par `swift-responder` avec le jeton de connexion du joueur. Les animations sont celles du live : `overlay.html?site` et `combat.html?site`, affichées en plein écran dans le site et nourries par `postMessage`.

## Jeu fermé

Troisième position de l'interrupteur (Admin > Réglages, `db/migrations/40-jeu-ferme.sql`) : « 🔒 Fermé partout ». Le réglage `jeu_ferme` passe à `1` (et `jeu_live` à `0`, pour arrêter les compteurs du championnat comme en pause). L'onglet « 🎮 Jouer » est masqué pour les joueurs (toujours visible pour l'admin, pour tester), un bandeau « jeu fermé » s'affiche au-dessus des onglets, et la boutique dit que les boosters s'ouvriront à la réouverture. `etat_jeu` renvoie `ferme`. Collection, deck, boutique et jeux du jour restent ouverts.

## Atelier des cartes (atelier.html)

Le même composeur que l'admin (`src/composeur.js`, inséré par le build dans `index.html` et dans `atelier.html` au marqueur `/*@@COMPOSEUR@@*/`), sur une page à part, pour que d'autres personnes testent une carte sans accès admin : dessin seul, cadre, écriteau, explications, chiffres, et téléchargement des deux images. On peut partir d'une carte publiée du jeu (lue avec la clé publique) ou écrire ses lignes à la main (titre, catégorie de couleur, explication). Rien n'est enregistré dans le jeu. Le build écrit `dist/atelier.html`, servi à `atelier.html`.

## Ce qui est où

- `src/describe.ts` : les icônes du site autour du texte commun (`packages/describe`, qui garde la formulation du site). Le texte est indexé sur les listes de types du moteur : un type ajouté au moteur sans texte **ne compile pas**.
- `src/index.html` : la page legacy, avec le bloc FX remplacé par le marqueur `/*@@DESCRIBE@@*/` et les listes de l'éditeur par `/*@@EDITOR@@*/`.
- `packages/describe/src/editor.ts` : les listes de l'éditeur admin (champs, passifs, ultimes, magies, conditions), indexées sur les listes de types du moteur. Un passif ou une condition ajouté au moteur sans entrée **ne compile pas** ; un effet ajouté au moteur sans entrée en magie ni en ultime fait échouer `test/editor.test.ts`, sauf s'il est listé dans `NOT_EDITABLE` (aujourd'hui `echange_pv` et `echange_tout`, obtenus seulement par l'effet aléatoire).

## Vérifier

`vp run test` (depuis `apps/site`) vérifie trois choses :

- hors du bloc FX et des listes de l'éditeur, `dist/index.html` est identique octet pour octet à la page legacy ;
- les listes de l'éditeur livrées dans la page sont celles du legacy, ordre des clés compris (c'est l'ordre des options) ;
- le code livré dans la page et le bloc FX legacy (qui lit les listes de l'éditeur de la page), exécutés dans des contextes isolés, donnent le même texte, ou la même erreur, sur environ 4 200 entrées : cartes réelles, synthétiques et `dirty`, effets inconnus, effets perso, clés d'un autre genre (un passif en effet, un effet en passif).

Aucune différence voulue avec le legacy. Celle de la phase 4b (décrire un passif ou un effet `execution` faisait planter la page, `X is not defined`) a disparu : l'amont a fait la même correction, au caractère près (`078e524`).

## Tournois, armoire à trophées et Panthéon

Onglet « 🎖️ Tournois » (`vTournois`, `db/migrations/46-tournois.sql`) : le tournoi ouvert (inscription et retrait par bouton, avec le deck de championnat de la ceinture du thème), sinon le dernier terminé, son tableau sans spoil (`tournoi_etat`) et le palmarès. Admin > Tournois (`aTournois`) : créer un tournoi (nom, thème, maximum de joueurs, image du trophée), retirer un inscrit, tirer le tableau, régler l'enchaînement automatique, changer le trophée, annuler. Admin > Récompenses (`aRecompenses`) : gold, boosters, dos de carte et carte des 4 premières places du tournoi ouvert. Le profil affiche l'armoire à trophées du joueur (`trophees_joueur`). L'onglet Ceintures ajoute au Panthéon les doubles et triples champions (`db/migrations/45-pantheon-doubles.sql`).
