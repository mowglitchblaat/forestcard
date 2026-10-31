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

## Effets qui s'allument sur la carte

Quand une carte a été composée dans l'admin (version Standard), sa variante garde la place de chaque ligne de son écriteau (`variantes_carte.compo.zones` : types d'effets, couleur, position en fraction de l'image). Au début du combat (et de chaque prolongation), la page lit ces zones avec la clé publique, par la fonction `zones_cartes` (`db/migrations/31-zones-combat.sql` : la table n'est pas lisible sans connexion), pour les cartes dont l'image affichée est bien celle de la version Standard. Quand l'ultime se lance ou qu'un passif agit (statut posé par l'attaque, esquive, réduction, renvoi, régénération, évite la mort, réanimation, enchaînement, avalage, exécution, transcendance…), sa ligne s'allume sur la carte (`allumerEffets`). Les magies et les pièges allument leur texte quand ils s'activent. Les versions alternatives n'ont pas de zones : rien ne s'allume.

## Animations des mécaniques du rework (octobre 2026)

Chaque mécanique et compétence du rework a son animation, déclenchée par sa ligne du journal (table `NK`, clé `t:k`) : cisaillement (les lames d'air, jusqu'à 24, se plantent dans la carte, puis s'arrachent en la tranchant dans tous les sens), foudre (marque, coup amplifié, rebonds vers la magie et le piège), Terre (couches, bouclier de pierre, charges, réplique sismique), enracinement (les racines s'enroulent autour de la carte et la serrent), contamination, vaporisation, faiblesse, coup critique, courant ascendant, embrasement, fureur, sangsue, injection, surcharge, accumulateur, brisure de volonté, étreinte maudite, verrouillage total. Ce qui dure (lames plantées, bouclier de pierre, racines, crépitement de surcharge, braises de l'embrasement) est dessiné tant que la pastille de la carte l'indique (champ `etats` du journal). Chacune est dans la galerie de `combat.html?test` / `?demo`, par famille (Vent, Foudre, Terre, Enracinement, Eau, Feu, Poison, Malédiction, Ciblage). Une clé sans aura dessinée (`FXK`) ne pose plus d'aura sur la carte.

## Tournois

Un combat de tournoi (`tournoi` dans la réponse de swift-responder, `db/migrations/46-tournois.sql`) a son bandeau, sur le modèle de celui du titre, avec un liseré turquoise : le nom du tournoi, le tour (ou la petite finale), et pour un BO3 ou un BO5 le numéro du combat et le score. À la fin, il dit qui gagne le combat, qui se qualifie, qui prend la 3e place ou qui remporte le tournoi. Avant le 1er combat de chaque match, le tableau du tournoi s'affiche en plein écran (le match qui va se jouer brille), et après la finale le tableau final avec le champion (`tableauTournoi`). Ces affichages ne suivent pas le réglage de vitesse. En format suisse (`50-tournoi-suisse.sql`, `tableauSuisseHtml`), le tableau montre le classement et la ronde en cours, puis le winner et le loser bracket.

Si le tournoi continue (`tournoi.suite`), l'overlay lance lui-même le combat suivant après une pause (`tournoi.pause` secondes, réglage `tournoi_pause_secondes`) : il demande à Streamer.bot (DoAction) l'action « Tournoi - Suivant ». Le paramètre `?suite=` de l'adresse change le nom de l'action. Dans `combat.html?test`, le bouton « 🏆 Aperçu tournoi » montre un tableau d'exemple, puis le tableau final.

## Programmation

Chaque programmation passive pose une icône éteinte en bas de la carte (engrenage : passif, éclair : ultime ; `n` de la ligne `prog`). À l'activation (`prog_act`), les icônes s'allument et montent se ranger en haut de la carte : ce qui est installé y reste. Un ultime programmé installé (`prog_ult_pret`) affiche sur son icône ses utilisations restantes, qui baissent à chaque lancement (`t: 'ultime'`, `k: 'prog_ult'`) ; à zéro, l'icône s'éteint. Démo : « Activation : tout se range en haut, ultime utilisé » dans la galerie de `combat.html?test`.
