# Bascule du site : de la page de l'auteur au site React

Le site React (`apps/web`) tourne en test à `/nouveau.html`, à côté de la page actuelle (`apps/site`, servie à `/index.html`). Ce guide liste ce qui lui manque pour la remplacer, puis les gestes de la bascule et du retour en arrière. L'état de chaque ligne est tenu à jour à chaque portage.

Point de départ de l'inventaire (4 novembre 2026) : le site React a été synchronisé avec la page de l'auteur le 19 octobre (`5fabe1b`). Depuis, la page a reçu 66 modifications et les migrations 33 à 56.

## Ce qui manque

### Vues joueurs absentes

| Vue de l'ancienne page | Contenu | État |
| --- | --- | --- |
| 🎮 Jouer (`vJouer`) | jeu en pause : ouvrir ses boosters, booster du jour, combat du jour, duel payé en gold, avec les animations du live (`overlay.html?site`, `combat.html?site`) | à faire |
| 🔄 Échanges (`vEchanges`) | proposer un échange, pot commun de fragments, contribuer, annuler, historique | à faire |
| 🥇 Ceintures (`vCeintures`) | les 3 ceintures et leurs champions, decks de championnat, histoire de chaque ceinture, Panthéon (défenses, durée, doubles et triples) | à faire |
| 🎖️ Tournois (`vTournois`) | inscription, format (suisse, double élimination), tableau, abandon, armoire à trophées, palmarès | à faire |

### Bandeaux et messages du site

| Fonction | État |
| --- | --- |
| Jeu fermé : bandeau au-dessus des vues, onglet Jouer masqué (`40-jeu-ferme.sql`) | à faire |
| Compte suspendu : message à la place du site | à faire |
| Petit mot des cadeaux de l'admin, vu à la connexion (`55-cadeaux-messages.sql`) | à faire |

### Nouveautés des vues déjà portées

| Vue | Nouveauté de l'ancienne page | État |
| --- | --- | --- |
| collection | chaque version alternative compte comme une carte ; cartes manquantes en grisé pour tous ; textes longs repliés dans la fenêtre d'une carte | à vérifier |
| collection | recyclage par rareté (cases à cocher) ; recyclage en gold ou en fragments | à faire |
| deck | decks de championnat (Rare, Épique, Libre ; 15 cartes : 5 / 5 / 5) | à faire |
| votes | propositions publiées (buff, nerf, rework), votées oui / non par tous (`39-votes-propositions.sql`) | à faire |
| propositions | le joueur crée sa carte entièrement (effets, déclencheurs d'ultime, composeur) | à faire |
| historique | combats de championnat (magie et piège de chaque combattant qui entre) ; ceinture rendue | à faire |
| profil | palmarès tournois, armoire à trophées | à faire |
| règles | championnat, jeu en pause, déclencheurs d'ultime, collection en grisé, bounty, nouveaux effets et commandes, tournois | à faire |
| boutique | jeu fermé : les boosters s'ouvriront à la réouverture | à faire |

### Admin (aucune sous-vue portée)

| Sous-vue | Contenu | État |
| --- | --- | --- |
| Cartes | liste, éditeur (effets, passifs, ultime et déclencheurs, programmation, forge), composeur (dessin seul → image normale et de combat), versions alternatives, refaire toutes les images, style de toutes les cartes, images inutilisées | à faire |
| Collections | créer, renommer, supprimer | à faire |
| Boosters | créer, collections, nombre de cartes, modificateurs de drop, cartes vedettes, image, prix, booster du jour | à faire |
| Effets | catalogue des effets perso, tableau des niveaux des statuts (`43-niveaux-statuts.sql`) | à faire |
| Raretés | poids, couleurs, ordre | à faire |
| Cadeaux | offrir gold, boosters, dos ou carte à un joueur ou à tous, avec un petit mot | à faire |
| Dos de cartes | ajouter, offrir, retirer | à faire |
| Réglages | interrupteur live / pause / fermé, récompenses, combats gratuits, vitesse, échanges, championnat, verrou des primes | à faire |
| Joueurs | inventaires, remise à zéro, bannissement temporaire | à faire |
| 🎖️ Tournois | créer, lancer, suivre, clore | à faire |
| 🎁 Récompenses | gold, booster, dos, carte par place | à faire |
| 🗳️ Votes | récap des votes, suppression d'une ligne d'équilibrage | à faire |
| 🎨 Propositions | voir, accepter, refuser, « ➕ Créer la carte » | à faire |

## Bascule

Quand tout ce qui précède est « fait » et vérifié à `/nouveau.html` avec le compte admin :

1. Dans `tools/pages/assemble.ts`, servir `apps/web/dist/index.html` à `index.html`, et `apps/site/dist/index.html` à `ancien.html` (la page de l'auteur reste joignable un temps).
2. Garder `nouveau.html` (même fichier que `index.html`) pour que les liens déjà partagés marchent.
3. Pousser sur `main`, attendre le workflow « Site », puis ouvrir `/` connecté (joueur et admin).

Les adresses des sources OBS (`combat.html`, `overlay.html`) et des images ne changent pas.

## Retour en arrière

Remettre les deux lignes de `assemble.ts` comme avant (ou annuler le commit de bascule) et pousser : la page de l'auteur revient à `/index.html` au prochain déploiement. La base n'est pas touchée par la bascule : les deux sites lisent et écrivent les mêmes tables et les mêmes fonctions.
