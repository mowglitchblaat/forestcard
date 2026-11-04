# Bascule du site : de la page de l'auteur au site React

Le site React (`apps/web`) tourne en test à `/nouveau.html`, à côté de la page actuelle (`apps/site`, servie à `/index.html`). Ce guide dit ce qui a été rattrapé, ce qui reste à vérifier, puis les gestes de la bascule et du retour en arrière.

Point de départ (4 novembre 2026) : le site React avait été synchronisé avec la page de l'auteur le 19 octobre (`5fabe1b`). Depuis, la page avait reçu 66 modifications et les migrations 33 à 56. Tout est rattrapé le 4 novembre ; ce qui suit est l'état ligne par ligne.

## Ce qui a été rattrapé

### Vues joueurs ajoutées

| Vue de l'ancienne page | Dans le site React | État |
| --- | --- | --- |
| 🎮 Jouer (`vJouer`) | page « Jouer » (`/jouer`), dans la barre latérale seulement quand le jeu est en pause (toujours pour l'admin) : boosters à ouvrir, booster du jour, combat du jour, duel payé en gold, avec les animations du live en plein écran | fait |
| 🔄 Échanges (`vEchanges`) | page « Échanges » : offres, pot de fragments, accepter avec sa part, compléter, contre-proposer, refuser ou annuler, nouvelle offre (joueur, cartes données et reçues, part du pot), alerte quand une carte quitte le deck | fait |
| 🥇 Ceintures (`vCeintures`) | page « Ceintures » : champions, primes et verrou, défis en attente (refuser), Panthéon (défenses, durée, doubles et triples), histoire de chaque ceinture | fait |
| 🎖️ Tournois (`vTournois`) | page « Tournois » : inscription, retrait, abandon définitif, récompenses, inscrits et aperçu du format suisse, tableau (élimination directe, rondes suisses puis winner et loser brackets), palmarès | fait |

### Bandeaux et messages

| Fonction | État |
| --- | --- |
| Jeu fermé : bandeau au-dessus des pages, « Jouer » masqué, la boutique le dit | fait |
| Compte suspendu : message à la connexion | fait |
| Petit mot des cadeaux de l'admin, montré une fois à la connexion | fait |

### Nouveautés des vues déjà portées

| Vue | Nouveauté | État |
| --- | --- | --- |
| collection | une carte s'ouvre en grand dans une fenêtre, détail à côté, la carte s'incline sous le pointeur et se retourne | fait |
| collection | chaque version compte comme une carte ; les versions manquantes en grisé, avec leur détail | fait |
| collection | recyclage en gold ou en fragments ; recyclage des doublons par raretés cochées | fait |
| decks | decks de championnat (Rare, Épique, Libre : 15 cartes, 5 / 5 / 5, raretés limitées) | fait |
| votes | propositions publiées (nerf, up, rework), votées oui / non par tous | fait |
| propositions | le joueur crée sa carte entièrement : effets, déclencheurs d'ultime, composeur de l'admin | fait |
| historique | combats pour le titre et de tournoi nommés comme tels | fait |
| profil | armoire à trophées, avec le détail de chaque trophée | fait |
| règles | échanges, jeu en pause, championnat, tournois, recyclage en fragments | fait |
| patch notes | l'admin peut retirer une ligne d'équilibrage | fait |

### Admin (toutes les sous-vues)

| Sous-vue | Contenu | État |
| --- | --- | --- |
| Cartes | liste par rareté et par collection, publier, modifier, supprimer ; éditeur (effets, passifs, ultime et déclencheurs, programmation, magie et son tempo, piège) ; composeur (le même code que l'ancienne page, `composeur.js`) ; images déjà prêtes ; versions alternatives ; refaire toutes les images composées, style de toutes les cartes ; notes d'équilibrage | fait |
| Collections, Raretés | ajouter, renommer, supprimer ; poids, couleurs, ordre | fait |
| Boosters | prix, nombre de cartes, en vente, booster du jour, image, collections, modificateurs de drop, cartes vedettes | fait |
| Effets | effets perso (texte seulement) | fait |
| Cadeaux | boosters ou carte à un joueur ou à tous, avec un petit mot | fait |
| Dos de cartes | ajouter, offrir, dos de base, retirer à un joueur, supprimer | fait |
| Réglages | live / pause / fermé, prix du duel, verrou des primes, vitesse, combats gratuits et anti-farm, niveaux des statuts, gains et soirées ×2, Bounty, recyclage, échanges, images inutilisées, remise à zéro des combats du jour | fait |
| Joueurs | cartes d'un joueur, remises à zéro (un joueur ou tous, avec mot de confirmation), stats seulement | fait |
| Tournois, Récompenses | créer, régler, tirer et lancer, annuler, images des coupes et de l'écharpe ; récompenses des 4 places | fait |
| Votes, Propositions | les 10 propositions les plus soutenues ; propositions des joueurs, « Créer la carte » | fait |

### Laissé sur l'ancienne page

- « Optimiser les images existantes » (Réglages) : la conversion en WebP des images déjà en ligne, faite une fois en octobre, avec son retour en arrière gardé dans le navigateur qui l'a lancée. Toutes les images sont converties à l'envoi depuis. L'outil reste sur l'ancienne page (`ancien.html` après la bascule).

## À vérifier avant la bascule

Rien de ce qui précède n'a tourné contre la vraie base avec le compte admin : la réécriture a été faite sans accès à la base. Avant de basculer, ouvrir `/nouveau.html` connecté en admin, puis :

1. Admin · Réglages : lire les valeurs (elles doivent être celles de l'ancienne page), enregistrer une section sans rien changer.
2. Admin · Cartes : ouvrir une carte composée (le dessin doit revenir dans l'aperçu), enregistrer sans rien changer, vérifier que l'image est la même.
3. Admin · Boosters, Cadeaux, Tournois : ouvrir chaque page (lecture seulement suffit).
4. Côté joueur : Ma collection (cartes grisées, recyclage), Mes decks (decks de championnat), Ceintures, Tournois, Échanges, Votes, Propositions.
5. Mettre le jeu en pause depuis l'admin : « Jouer » doit apparaître ; le remettre en live.

Une erreur affichée en rouge dans une page donne le message de la base : c'est le point de départ pour corriger.

## Bascule

1. Dans `tools/pages/assemble.ts`, passer `REACT_SITE` à `true`.
2. Pousser sur `main`, attendre le workflow « Site ».
3. Ouvrir `/` connecté (joueur et admin).

`/index.html` sert alors le site React ; `/nouveau.html` aussi (les liens déjà partagés marchent) ; la page de l'auteur reste à `/ancien.html`. Les adresses des sources OBS (`combat.html`, `overlay.html`) et des images ne changent pas.

## Retour en arrière

Remettre `REACT_SITE` à `false` et pousser : la page de l'auteur revient à `/index.html` au déploiement suivant. La base n'est pas touchée par la bascule : les deux sites lisent et écrivent les mêmes tables et les mêmes fonctions.

## Après la bascule

Une nouveauté se fait dans `apps/web` (plus dans `apps/site/src/index.html`). L'ancienne page peut être retirée quand plus personne ne s'en sert.
