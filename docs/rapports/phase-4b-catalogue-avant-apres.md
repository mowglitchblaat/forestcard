# Phase 4b : texte du catalogue, avant → après

Rapport généré par `apps/catalogue/report.ts` à partir du code réel : « avant » est l'ancien catalogue exécuté tel quel, « après » est la page générée. Snapshot des cartes du 2026-10-17 : 87 cartes, 74 dont le texte change.

Décision (docs/decisions.md) : une seule formulation partout, celle du site ; le catalogue, en retard, n'est pas repris. Le site lui-même ne change que sur un point : décrire une exécution ne fait plus planter la page (aucune carte réelle n'en a aujourd'hui).

## Précisions de règle présentes seulement dans l'ancien catalogue

Elles disparaissent avec le texte commun. Toutes sont exactes d'après le moteur ; à l'auteur de dire lesquelles ajouter au texte commun (elles apparaîtraient alors aussi sur le site).

| Effet | Précision de l'ancien catalogue | D'après le moteur |
|---|---|---|
| Esquive (passif) | « (plafond 75 %) » | exact : l'esquive cumulée est plafonnée à 75 % (`plafondEsquive`) |
| Purification | « rend l'ATQ perdu par malédiction » | exact, et rend aussi l'ATQ perdue par fatigue |
| Réanimation | « meurt puis revient » | exact : la carte se brise, puis se reforme |
| Enchaînement | « jusqu'à 10 frappes en plus » quand aucun maximum n'est saisi | exact : 10 par défaut ; le site n'affiche le maximum que s'il est saisi |
| Effet aléatoire | « tiré au hasard parmi tous les effets du jeu » | exact : 45 effets possibles |
| Condition « l'adversaire a attaqué N fois » | « (puis toutes les N attaques) » | exact : le piège se déclenche aux attaques N, 2N, 3N… |
| Ultime | « utilisations illimitées » quand aucune limite n'est saisie | exact |

## Cartes

### Dieu Cerf (Combattant)

Avant (catalogue actuel) :

**Passifs**
- Purification : retire les statuts négatifs chaque tour, 5 fois au maximum (rend l'ATQ perdu par malédiction)
- Se soigne de 16 chaque tour
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- Purification : retire les statuts négatifs à chaque tour (5 fois max)
- Se soigne de 16 PV à chaque tour
**Ultime**
- (aucun)

### Dieu Cerf ( Combat)  (Combattant)

Avant (catalogue actuel) :

**Passifs**
- Se soigne de 15 chaque tour
**Ultime**
_Se déclenche à partir du tour 3 · 1 utilisation_
- Double ses dégâts pendant 1 tour

Après (texte commun, celui du site) :

**Passif**
- Se soigne de 15 PV à chaque tour
**Ultime**
_Se déclenche dès son tour 3, 1 utilisation maximum_
- Double ses dégâts pendant 1 tour

### Dragon noir maudit (Combattant)

Avant (catalogue actuel) :

**Passifs**
- (aucun)
**Ultime**
_Se déclenche à partir du tour 1 · utilisations illimitées · délai minimum 3 tours_
- Souffle élémentaire : 21 dégâts, puis 50 % de chances de malédiction ATQ −6 par tour pendant 2 tours

Après (texte commun, celui du site) :

**Passifs**
- (aucun)
**Ultime**
_Se déclenche dès son tour 1, au plus une fois tous les 3 tours_
- Souffle maudit (malédiction) : 21 dégâts, puis 50 % de chances de malédiction ATQ −6 par tour pendant 2 tours

### L'Arkat Zombie (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 33 % de réduire les dégâts reçus de 50 %
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passif**
- 33 % de chances de réduire les dégâts reçus de 50 %
**Ultime**
- (aucun)

### Moine divin (Combattant)

Avant (catalogue actuel) :

**Passifs**
- Au début de ses tours 1, 2 et 3, avant d'attaquer, monte d'un niveau (I, II, III) jusqu'à la fin du combat : à chaque niveau purifiée (étourdissement compris), ATQ +15 %, PV max +15 % ; ses attaques purifient l'adversaire et volent 10 / 20 / 30 % des dégâts selon le niveau
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passif**
- Au début de ses tours 1, 2 et 3, avant d'attaquer, monte d'un niveau (I, II, III) jusqu'à la fin du combat : à chaque niveau purifiée (étourdissement compris), ATQ +15 %, PV max +15 % ; ses attaques purifient l'adversaire et volent 10 / 20 / 30 % des dégâts selon le niveau
**Ultime**
- (aucun)

### PLG (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 75 % de chances de frapper une fois de plus, puis retente (jusqu'à 10 frappes en plus)
- 80 % de chances de faire saigner : 3 % des PV max par tour, soins −20 %, 2 tours
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- 75 % de chances de frapper une fois de plus, puis retente (10 frappes en plus au maximum)
- 80 % de chances de faire saigner la cible (3 % des PV max par tour, soins −20 %, 2 tours)
**Ultime**
- (aucun)

### Raidraw Le Bonk (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 35 % de chances de étourdir l'adversaire à chaque coup
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passif**
- 35 % de chances d'étourdir la cible (elle saute sa prochaine attaque)
**Ultime**
- (aucun)

### Sweety (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 50 % de chances de faire saigner : 25 % des PV max par tour, soins −100 %, 2 tours
**Ultime**
_Se déclenche à partir du tour 2 · 1 utilisation_
- Inflige 20 dégâts et se soigne d'autant

Après (texte commun, celui du site) :

**Passif**
- 50 % de chances de faire saigner la cible (25 % des PV max par tour, soins −100 %, 2 tours)
**Ultime**
_Se déclenche dès son tour 2, 1 utilisation maximum_
- Vole 20 PV à l'adversaire

### Marteau du BONK (Magie)

Avant (catalogue actuel) :

**Effet**
- Attaque de base : 20 % de chances de étourdir l'adversaire à chaque coup

Après (texte commun, celui du site) :

**Effet de la magie**
- Attaque de base : 20 % de chances d'étourdir la cible (elle saute sa prochaine attaque)

### La sauce de Mowgli (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand le propriétaire meurt · 1 seul déclenchement_
- Rage : +8 dégâts par coup pendant 2 tours, puis Fatigue : −7 dégâts par coup pendant 2 tours
- Réanimation : meurt puis revient avec 45 % de ses PV max (une fois)

Après (texte commun, celui du site) :

**Piège**
_Quand le propriétaire est sur le point de mourir · 1 seul déclenchement_
- Rage : +8 de dégâts par coup pendant 2 tours, puis fatigue (ATQ −7 pendant 2 tours)
- Réanimation : revient avec 45 % de ses PV max (une fois)

### Yeux de Sweety (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand le propriétaire passe sous 10 % de PV · 1 seul déclenchement_
- Inflige 18 dégâts et se soigne d'autant
- Saignement sur l'adversaire : 9 % des PV max par tour, soins −80 %, 2 tours

Après (texte commun, celui du site) :

**Piège**
_Quand le propriétaire passe sous 10 % de PV · 1 seul déclenchement_
- Vole 18 PV à l'adversaire
- Fait saigner l'adversaire : 9 % des PV max par tour, soins −80 %, 2 tours

### Archange (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 50 % de frapper 2 fois
- Au début de ses tours 3, 6 et 9, avant d'attaquer, monte d'un niveau (I, II, III) jusqu'à la fin du combat : à chaque niveau purifiée (étourdissement compris), ATQ +15 %, PV max +15 % ; ses attaques purifient l'adversaire et volent 10 / 20 / 30 % des dégâts selon le niveau
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- 50 % de chances de frapper 2 fois par tour
- Au début de ses tours 3, 6 et 9, avant d'attaquer, monte d'un niveau (I, II, III) jusqu'à la fin du combat : à chaque niveau purifiée (étourdissement compris), ATQ +15 %, PV max +15 % ; ses attaques purifient l'adversaire et volent 10 / 20 / 30 % des dégâts selon le niveau
**Ultime**
- (aucun)

### Bakunawa (Combattant)

Avant (catalogue actuel) :

**Passifs**
- chaque attaque réussie pose 🍴 puis 🔪 ; la 3e (sans dégâts) avale la cible si ses PV actuels valent au moins 3 × l'ATQ de la cible. Mâchée 3 fois (25 % de ses PV max) puis recrachée, puis 1 tour de digestion. Statuts négatifs de la cible : transmis ×1,5, une seule mâche
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passif**
- Chaque attaque réussie pose 🍴 puis 🔪 ; la 3e attaque réussie ne fait pas de dégâts : elle avale la cible si ses PV actuels valent au moins 3 × l'ATQ de la cible (sinon les marques tombent et le coup porte normalement). La carte avalée est mâchée 3 fois (25 % de ses PV max à chaque tour) puis recrachée, et la carte digère 1 tour sans attaquer. Pendant l'avalage, personne n'attaque et tout ce qui visait la carte avalée la touche. Si la cible a des statuts négatifs, ils lui passent ×1,5 : une seule mâche, puis recrachée
**Ultime**
- (aucun)

### Cergo des enfers (Combattant)

Avant (catalogue actuel) :

**Passifs**
- (aucun)
**Ultime**
_Se déclenche à partir du tour 2 · utilisations illimitées · délai minimum 4 tours_
- Rage : +18 dégâts par coup pendant 1 tour, puis Fatigue : −8 dégâts par coup pendant 3 tours

Après (texte commun, celui du site) :

**Passifs**
- (aucun)
**Ultime**
_Se déclenche dès son tour 2, au plus une fois tous les 4 tours_
- Rage : +18 de dégâts par coup pendant 1 tour, puis fatigue (ATQ −8 pendant 3 tours)

### Colosse de chair (Combattant)

Avant (catalogue actuel) :

**Passifs**
- PV max +33 tous les 1 tours
**Ultime**
_Se déclenche à partir du tour 3 · 1 utilisation_
- Échange l'ATQ et la défense (PV) de soi-même

Après (texte commun, celui du site) :

**Passif**
- PV max +33 à chaque tour
**Ultime**
_Se déclenche dès son tour 3, 1 utilisation maximum_
- Échange l'ATQ et les PV de sa carte

### Esprit de l'ours (Combattant)

Avant (catalogue actuel) :

**Passifs**
- Évite la mort une fois (reste à 1 PV, retire les statuts négatifs)
**Ultime**
_Se déclenche à partir du tour 3 · 4 utilisations · délai minimum 4 tours_
- Rage : +12 dégâts par coup pendant 1 tour, puis Fatigue : −30 dégâts par coup pendant 2 tours

Après (texte commun, celui du site) :

**Passif**
- Évite la mort une fois (reste à 1 PV, statuts négatifs retirés)
**Ultime**
_Se déclenche dès son tour 3, au plus une fois tous les 4 tours, 4 utilisations maximum_
- Rage : +12 de dégâts par coup pendant 1 tour, puis fatigue (ATQ −30 pendant 2 tours)

### Esprit du loup (Combattant)

Avant (catalogue actuel) :

**Passifs**
- Évite la mort une fois (reste à 1 PV, retire les statuts négatifs)
- Se soigne de 10 chaque tour
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- Évite la mort une fois (reste à 1 PV, statuts négatifs retirés)
- Se soigne de 10 PV à chaque tour
**Ultime**
- (aucun)

### Lame crepusculaire ecarlate Nezuzu (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 40 % d'esquiver chaque attaque (plafond 75 %)
- Renvoie 40 % des dégâts reçus
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- 40 % de chances d'esquiver chaque attaque
- Renvoie 40 % des dégâts reçus
**Ultime**
- (aucun)

### Mowgli la sauce (Combattant)

Avant (catalogue actuel) :

**Passifs**
- Réanimation : meurt puis revient avec 100 % de ses PV max (une fois)
**Ultime**
_Se déclenche dès qu'une magie ou un piège est joué · utilisations illimitées · délai minimum 4 tours_
- Rage : +13 dégâts par coup pendant 2 tours, puis Fatigue : −7 dégâts par coup pendant 2 tours

Après (texte commun, celui du site) :

**Passif**
- Réanimation : revient avec 100 % de ses PV max (une fois)
**Ultime**
_Se déclenche quand une carte s'active, au plus une fois tous les 4 tours_
- Rage : +13 de dégâts par coup pendant 2 tours, puis fatigue (ATQ −7 pendant 2 tours)

### Ryuukin (Combattant)

Avant (catalogue actuel) :

**Passifs**
- ATQ +13 tous les 1 tours
**Ultime**
_Se déclenche à partir du tour 2 · 1 utilisation_
- Détruit la piege de l'adversaire

Après (texte commun, celui du site) :

**Passif**
- ATQ +13 à chaque tour
**Ultime**
_Se déclenche dès son tour 2, 1 utilisation maximum_
- Détruit le piège de l'adversaire

### Trio chasseurs (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 55 % de chances de faire saigner : 7 % des PV max par tour, soins −40 %, 1 tour
- 50 % de frapper 3 fois
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- 55 % de chances de faire saigner la cible (7 % des PV max par tour, soins −40 %, 1 tour)
- 50 % de chances de frapper 3 fois par tour
**Ultime**
- (aucun)

### Wouedman (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 45 % de chances de frapper une fois de plus, puis retente (jusqu'à 3 frappes en plus)
- 40 % de chances de fatiguer : dégâts −20 % par coup pendant 2 tours
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- 45 % de chances de frapper une fois de plus, puis retente (3 frappes en plus au maximum)
- 40 % de chances de fatiguer la cible à chaque coup (ATQ −20 % pendant 2 tours)
**Ultime**
- (aucun)

### Arbre-mere  (Magie)

Avant (catalogue actuel) :

**Effet**
- PV max de soi-même +50 %
- Évite la mort une fois (reste à 1 PV, retire les statuts négatifs) — condition : aucune

Après (texte commun, celui du site) :

**Effet de la magie**
- Ses PV max +50 %
- Évite la mort une fois (reste à 1 PV, statuts négatifs retirés)

### Bois de Dieu Cerf (Magie)

Avant (catalogue actuel) :

**Effet**
- Purification de soi-même : tout de suite, puis tous les 2 tour(s), 5 fois au total (retire les statuts négatifs, rend l'ATQ perdu)
- Évite la mort une fois (reste à 1 PV, retire les statuts négatifs) — condition : aucune

Après (texte commun, celui du site) :

**Effet de la magie**
- Purification de sa carte : retire les statuts négatifs (5 fois, tous les 2 tours)
- Évite la mort une fois (reste à 1 PV, statuts négatifs retirés)

### Colere de l'ours (Magie)

Avant (catalogue actuel) :

**Effet**
- Rage : +15 dégâts par coup pendant 5 tours, puis Fatigue : −7 dégâts par coup pendant 2 tours

Après (texte commun, celui du site) :

**Effet de la magie**
- Rage : +15 de dégâts par coup pendant 5 tours, puis fatigue (ATQ −7 pendant 2 tours)

### Faux de la Mort (Magie)

Avant (catalogue actuel) :

**Effet**
- Malédiction sur l'adversaire : ATQ −6 par tour pendant 3 tours, puis l'ATQ revient petit à petit
- Saignement sur l'adversaire : 9 % des PV max par tour, soins −50 %, 3 tours

Après (texte commun, celui du site) :

**Effet de la magie**
- Maudit l'adversaire : ATQ −6 par tour pendant 3 tours, puis l'ATQ revient petit à petit
- Fait saigner l'adversaire : 9 % des PV max par tour, soins −50 %, 3 tours

### La Mort dechainée (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand le propriétaire passe sous 15 % de PV · 1 seul déclenchement_
- Inflige 35 dégâts et se soigne d'autant
- Malédiction sur l'adversaire : ATQ −10 par tour pendant 3 tours, puis l'ATQ revient petit à petit

Après (texte commun, celui du site) :

**Piège**
_Quand le propriétaire passe sous 15 % de PV · 1 seul déclenchement_
- Vole 35 PV à l'adversaire
- Maudit l'adversaire : ATQ −10 par tour pendant 3 tours, puis l'ATQ revient petit à petit

### Araignée Humanoide (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 45 % de chances de frapper une fois de plus, puis retente (jusqu'à 3 frappes en plus)
- 40 % de chances de maudire : ATQ −3 par tour pendant 2 tours, puis l'ATQ revient petit à petit
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- 45 % de chances de frapper une fois de plus, puis retente (3 frappes en plus au maximum)
- 40 % de chances de maudire la cible (ATQ −3 par tour, 2 tours, puis l'ATQ revient petit à petit)
**Ultime**
- (aucun)

### Bébé dragon noir maudit (Combattant)

Avant (catalogue actuel) :

**Passifs**
- (aucun)
**Ultime**
_Se déclenche à partir du tour 3 · 2 utilisations · délai minimum 2 tours_
- Souffle élémentaire : 14 dégâts, puis 45 % de chances de malédiction ATQ −4 par tour pendant 2 tours

Après (texte commun, celui du site) :

**Passifs**
- (aucun)
**Ultime**
_Se déclenche dès son tour 3, au plus une fois tous les 2 tours, 2 utilisations maximum_
- Souffle maudit (malédiction) : 14 dégâts, puis 45 % de chances de malédiction ATQ −4 par tour pendant 2 tours

### Chevalier ailé (Combattant)

Avant (catalogue actuel) :

**Passifs**
- Au début de ses tours 3, 6 et 9, avant d'attaquer, monte d'un niveau (I, II, III) jusqu'à la fin du combat : à chaque niveau purifiée (étourdissement compris), ATQ +15 %, PV max +15 % ; ses attaques purifient l'adversaire et volent 10 / 20 / 30 % des dégâts selon le niveau
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passif**
- Au début de ses tours 3, 6 et 9, avant d'attaquer, monte d'un niveau (I, II, III) jusqu'à la fin du combat : à chaque niveau purifiée (étourdissement compris), ATQ +15 %, PV max +15 % ; ses attaques purifient l'adversaire et volent 10 / 20 / 30 % des dégâts selon le niveau
**Ultime**
- (aucun)

### Col'Os (Combattant) : inchangé

**Passifs**
- (aucun)
**Ultime**
- (aucun)

### Duo chasseurs (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 75 % de frapper 2 fois
- 50 % de chances de faire saigner : 7 % des PV max par tour, soins −50 %, 2 tours
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- 75 % de chances de frapper 2 fois par tour
- 50 % de chances de faire saigner la cible (7 % des PV max par tour, soins −50 %, 2 tours)
**Ultime**
- (aucun)

### Esprit du serpent (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 75 % de chances de empoisonner : 12 dégâts par tour pendant 3 tours
- Évite la mort une fois (reste à 1 PV, retire les statuts négatifs)
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- 75 % de chances d'empoisonner la cible (12 dégâts par tour, 3 tours)
- Évite la mort une fois (reste à 1 PV, statuts négatifs retirés)
**Ultime**
- (aucun)

### Golem de glace (Combattant)

Avant (catalogue actuel) :

**Passifs**
- À chacun de ses tours, 50 % de chances de se solidifier pendant 2 tours de l'adversaire (insensible à l'étourdissement, ne se purge pas, brisée par une fracture)
- 50 % de réduire les dégâts reçus de 35 %
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- À chacun de ses tours, 50 % de chances de se solidifier pendant 2 tours de l'adversaire (insensible à l'étourdissement, ne se purge pas, brisée par une fracture)
- 50 % de chances de réduire les dégâts reçus de 35 %
**Ultime**
- (aucun)

### L'Horreur Mowgli (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 65 % de chances de fatiguer : dégâts −10 % par coup pendant 2 tours
- 65 % de chances de maudire : ATQ −5 par tour pendant 3 tours, puis l'ATQ revient petit à petit
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- 65 % de chances de fatiguer la cible à chaque coup (ATQ −10 % pendant 2 tours)
- 65 % de chances de maudire la cible (ATQ −5 par tour, 3 tours, puis l'ATQ revient petit à petit)
**Ultime**
- (aucun)

### La chauve souris (Combattant) : inchangé

**Passifs**
- (aucun)
**Ultime**
- (aucun)

### Le faux centaure  (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 35 % de chances de frapper une fois de plus, puis retente (jusqu'à 7 frappes en plus)
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passif**
- 35 % de chances de frapper une fois de plus, puis retente (7 frappes en plus au maximum)
**Ultime**
- (aucun)

### Loup cerf (Combattant)

Avant (catalogue actuel) :

**Passifs**
- Se soigne de 15 chaque tour
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passif**
- Se soigne de 15 PV à chaque tour
**Ultime**
- (aucun)

### Ours colere (Combattant) : inchangé

**Passifs**
- (aucun)
**Ultime**
- (aucun)

### Samourai Squelette (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 50 % de chances de faire saigner : 8 % des PV max par tour, soins −50 %, 2 tours
- 50 % de chances de maudire : ATQ −3 par tour pendant 2 tours, puis l'ATQ revient petit à petit
- 40 % d'esquiver chaque attaque (plafond 75 %)
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- 50 % de chances de faire saigner la cible (8 % des PV max par tour, soins −50 %, 2 tours)
- 50 % de chances de maudire la cible (ATQ −3 par tour, 2 tours, puis l'ATQ revient petit à petit)
- 40 % de chances d'esquiver chaque attaque
**Ultime**
- (aucun)

### Wyverne d'os  (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 40 % de chances de fracturer : 50 % de se blesser en attaquant (10 dégâts), 2 tours
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passif**
- 40 % de chances de fracturer la cible (50 % de se blesser de 10 PV en attaquant, 2 tours)
**Ultime**
- (aucun)

### Bois de loup cerf (Magie)

Avant (catalogue actuel) :

**Effet**
- Régénération : +10 PV par tour pendant 10 tours

Après (texte commun, celui du site) :

**Effet de la magie**
- Régénération : +10 PV par tour pendant 10 tours

### Corne du dragon noir (Magie)

Avant (catalogue actuel) :

**Effet**
- Vole la magie de l'adversaire au début de son 2e tour pendant 4 tours (puis la carte retourne à son propriétaire)

Après (texte commun, celui du site) :

**Effet de la magie**
- Vole la magie de l'adversaire au début de son 2e tour pendant 4 tours (puis la carte retourne à son propriétaire)

### Le Marteau Modo (Magie)

Avant (catalogue actuel) :

**Effet**
- ATQ de l'adversaire -20 %

Après (texte commun, celui du site) :

**Effet de la magie**
- ATQ de l'adversaire -20 %

### PatéPLG (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand l'adversaire passe sous 50 % de PV · 1 seul déclenchement_
- ATQ de soi-même +10 %

Après (texte commun, celui du site) :

**Piège**
_Quand l'adversaire passe sous 50 % de PV · 1 seul déclenchement_
- Son ATQ +10 %

### Piege a serpent (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand l'adversaire a attaqué 2 fois (puis toutes les 2 attaques) · jusqu'à 2 déclenchements_
- Poison sur l'adversaire : 10 dégâts par tour pendant 3 tours

Après (texte commun, celui du site) :

**Piège**
_Toutes les 2 attaques de l'adversaire · jusqu'à 2 déclenchements_
- Empoisonne l'adversaire : 10 dégâts par tour pendant 3 tours

### Rituel demoniaque (Piège) : inchangé

**Piège**
_Quand le propriétaire passe sous 20 % de PV · 1 seul déclenchement_
- Double ses dégâts pendant 1 tour

### Toile de l'Araignée Humanoide (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand l'adversaire a attaqué 2 fois (puis toutes les 2 attaques) · jusqu'à 4 déclenchements_
- 50 % de chances d'étourdir l'adversaire pendant 1 tour

Après (texte commun, celui du site) :

**Piège**
_Toutes les 2 attaques de l'adversaire · jusqu'à 4 déclenchements_
- 50 % de chances d'étourdir l'adversaire pendant 1 tour

### Araignée maudite (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 75 % de chances de maudire : ATQ −4 par tour pendant 3 tours, puis l'ATQ revient petit à petit
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passif**
- 75 % de chances de maudire la cible (ATQ −4 par tour, 3 tours, puis l'ATQ revient petit à petit)
**Ultime**
- (aucun)

### Bébé golem des glaces (Combattant) : inchangé

**Passifs**
- (aucun)
**Ultime**
- (aucun)

### Bébé wynerne d'os (Combattant) : inchangé

**Passifs**
- (aucun)
**Ultime**
- (aucun)

### Le chasseur  (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 60 % de chances de faire saigner : 12 % des PV max par tour, soins −80 %, 2 tours
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passif**
- 60 % de chances de faire saigner la cible (12 % des PV max par tour, soins −80 %, 2 tours)
**Ultime**
- (aucun)

### le devoreur (Combattant) : inchangé

**Passifs**
- (aucun)
**Ultime**
- (aucun)

### le domestique (Combattant) : inchangé

**Passifs**
- (aucun)
**Ultime**
- (aucun)

### Les corbeaux (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 65 % de chances de frapper une fois de plus, puis retente (jusqu'à 7 frappes en plus)
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passif**
- 65 % de chances de frapper une fois de plus, puis retente (7 frappes en plus au maximum)
**Ultime**
- (aucun)

### Meute de loup (Combattant) : inchangé

**Passifs**
- (aucun)
**Ultime**
- (aucun)

### Momie (Combattant) : inchangé

**Passifs**
- (aucun)
**Ultime**
- (aucun)

### Serpent (Combattant)

Avant (catalogue actuel) :

**Passifs**
- 100 % de chances de empoisonner : 6 dégâts par tour pendant 2 tours
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passif**
- 100 % de chances d'empoisonner la cible (6 dégâts par tour, 2 tours)
**Ultime**
- (aucun)

### Un ange (Combattant) : inchangé

**Passifs**
- (aucun)
**Ultime**
- (aucun)

### Ailes d'ange (Magie)

Avant (catalogue actuel) :

**Effet**
- Au début de ses tours 3, 6 et 9, avant d'attaquer, monte d'un niveau (I, II, III) jusqu'à la fin du combat : à chaque niveau purifiée (étourdissement compris), ATQ +15 %, PV max +15 % ; ses attaques purifient l'adversaire et volent 10 / 20 / 30 % des dégâts selon le niveau

Après (texte commun, celui du site) :

**Effet de la magie**
- Au début de ses tours 3, 6 et 9, avant d'attaquer, monte d'un niveau (I, II, III) jusqu'à la fin du combat : à chaque niveau purifiée (étourdissement compris), ATQ +15 %, PV max +15 % ; ses attaques purifient l'adversaire et volent 10 / 20 / 30 % des dégâts selon le niveau

### Baril de sang (Magie)

Avant (catalogue actuel) :

**Effet**
- ATQ de soi-même +8

Après (texte commun, celui du site) :

**Effet de la magie**
- Son ATQ +8

### Bouclier d'os (Magie)

Avant (catalogue actuel) :

**Effet**
- Annule la prochaine attaque de l'adversaire

Après (texte commun, celui du site) :

**Effet de la magie**
- Annule la prochaine attaque de l'adversaire

### Champignon vert (Magie)

Avant (catalogue actuel) :

**Effet**
- Régénération : +5 PV par tour pendant 10 tours

Après (texte commun, celui du site) :

**Effet de la magie**
- Régénération : +5 PV par tour pendant 10 tours

### Esprits de la forêt (Magie)

Avant (catalogue actuel) :

**Effet**
- Insensible aux pièges adverses pendant 2 tours

Après (texte commun, celui du site) :

**Effet de la magie**
- Insensible aux pièges pendant 2 tours

### Fleche enflammée (Magie)

Avant (catalogue actuel) :

**Effet**
- Attaque de base : 75 % de chances de brûler : 6 % des PV max par tour pendant 3 tours

Après (texte commun, celui du site) :

**Effet de la magie**
- Attaque de base : 75 % de chances de brûler la cible (6 % de ses PV max par tour, 3 tours)

### fleche poison (Magie)

Avant (catalogue actuel) :

**Effet**
- Attaque de base : 75 % de chances de empoisonner : 3 dégâts par tour pendant 2 tours

Après (texte commun, celui du site) :

**Effet de la magie**
- Attaque de base : 75 % de chances d'empoisonner la cible (3 dégâts par tour, 2 tours)

### Grimoire maudit (Magie)

Avant (catalogue actuel) :

**Effet**
- Malédiction sur l'adversaire : ATQ −5 par tour pendant 2 tours, puis l'ATQ revient petit à petit

Après (texte commun, celui du site) :

**Effet de la magie**
- Maudit l'adversaire : ATQ −5 par tour pendant 2 tours, puis l'ATQ revient petit à petit

### Katana maudit (Magie)

Avant (catalogue actuel) :

**Effet**
- Attaque de base : 50 % de chances de maudire : ATQ −4 par tour pendant 2 tours, puis l'ATQ revient petit à petit
- Attaque de base : 50 % de chances de faire saigner : 5 % des PV max par tour, soins −25 %, 2 tours

Après (texte commun, celui du site) :

**Effet de la magie**
- Attaque de base : 50 % de chances de maudire la cible (ATQ −4 par tour, 2 tours, puis l'ATQ revient petit à petit)
- Attaque de base : 50 % de chances de faire saigner la cible (5 % des PV max par tour, soins −25 %, 2 tours)

### L'Epee Modo (Magie)

Avant (catalogue actuel) :

**Effet**
- Annule la magie adverse pendant 2 tours

Après (texte commun, celui du site) :

**Effet de la magie**
- Annule la magie de l'adversaire pendant 2 tours

### Lance fantomatique (Magie)

Avant (catalogue actuel) :

**Effet**
- Attaque de base : 75 % de chances de maudire : ATQ −4 par tour pendant 2 tours, puis l'ATQ revient petit à petit

Après (texte commun, celui du site) :

**Effet de la magie**
- Attaque de base : 75 % de chances de maudire la cible (ATQ −4 par tour, 2 tours, puis l'ATQ revient petit à petit)

### MarsupiRAGE (Magie)

Avant (catalogue actuel) :

**Effet**
- Rage : +4 dégâts par coup pendant 6 tours, puis Fatigue : −2 dégâts par coup pendant 2 tours

Après (texte commun, celui du site) :

**Effet de la magie**
- Rage : +4 de dégâts par coup pendant 6 tours, puis fatigue (ATQ −2 pendant 2 tours)

### Pot de peinture du morph (Magie)

Avant (catalogue actuel) :

**Effet**
- Effet aléatoire ×2 : tiré au hasard parmi tous les effets du jeu

Après (texte commun, celui du site) :

**Effet de la magie**
- Effet aléatoire ×2

### Priere de l'ange (Magie)

Avant (catalogue actuel) :

**Effet**
- Purification de soi-même : tout de suite, puis tous les 3 tour(s), 4 fois au total (retire les statuts négatifs, rend l'ATQ perdu)

Après (texte commun, celui du site) :

**Effet de la magie**
- Purification de sa carte : retire les statuts négatifs (4 fois, tous les 3 tours)

### Ambuscade de loups (Piège) : inchangé

**Piège**
_Quand le propriétaire passe sous 10 % de PV · 1 seul déclenchement_
- Inflige 16 dégâts directs

### Arbre a liane (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand l'adversaire attaque (à chaque attaque) · 1 seul déclenchement_
- Étourdit l'adversaire pendant 1 tour

Après (texte commun, celui du site) :

**Piège**
_À chaque attaque de l'adversaire · 1 seul déclenchement_
- Étourdit l'adversaire pendant 1 tour

### Baril explosif (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand le propriétaire meurt · 1 seul déclenchement_
- Inflige 30 dégâts directs
- Brûlure sur l'adversaire : 20 % des PV max par tour pendant 3 tours

Après (texte commun, celui du site) :

**Piège**
_Quand le propriétaire est sur le point de mourir · 1 seul déclenchement_
- Inflige 30 dégâts directs
- Brûle l'adversaire : 20 % des PV max par tour pendant 3 tours

### Chaines maudites (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand l'adversaire a attaqué 2 fois (puis toutes les 2 attaques) · 1 seul déclenchement_
- Annule la prochaine attaque de l'adversaire
- Malédiction sur l'adversaire : ATQ −3 par tour pendant 4 tours, puis l'ATQ revient petit à petit

Après (texte commun, celui du site) :

**Piège**
_Toutes les 2 attaques de l'adversaire · 1 seul déclenchement_
- Annule la prochaine attaque de l'adversaire
- Maudit l'adversaire : ATQ −3 par tour pendant 4 tours, puis l'ATQ revient petit à petit

### Coup d'aile osseuse (Piège) : inchangé

**Piège**
_Quand l'adversaire passe sous 25 % de PV · 1 seul déclenchement_
- Étourdit l'adversaire pendant 1 tour

### Deuxieme chance (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand le propriétaire meurt · 1 seul déclenchement_
- Évite la mort une fois (reste à 1 PV, retire les statuts négatifs) — condition : aucune

Après (texte commun, celui du site) :

**Piège**
_Quand le propriétaire est sur le point de mourir · 1 seul déclenchement_
- Évite la mort une fois (reste à 1 PV, statuts négatifs retirés)

### Larve géante (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand le propriétaire passe sous 25 % de PV · 1 seul déclenchement_
- Inflige 15 dégâts et se soigne d'autant
- Régénération : +8 PV par tour pendant 5 tours

Après (texte commun, celui du site) :

**Piège**
_Quand le propriétaire passe sous 25 % de PV · 1 seul déclenchement_
- Vole 15 PV à l'adversaire
- Régénération : +8 PV par tour pendant 5 tours

### Piege a ours (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand l'adversaire a attaqué 2 fois (puis toutes les 2 attaques) · 1 seul déclenchement_
- Inflige 12 dégâts directs

Après (texte commun, celui du site) :

**Piège**
_Toutes les 2 attaques de l'adversaire · 1 seul déclenchement_
- Inflige 12 dégâts directs

### Piege arc (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand l'adversaire attaque (à chaque attaque) · 1 seul déclenchement_
- Inflige 12 dégâts directs
- Saignement sur l'adversaire : 3 % des PV max par tour, soins −50 %, 4 tours

Après (texte commun, celui du site) :

**Piège**
_À chaque attaque de l'adversaire · 1 seul déclenchement_
- Inflige 12 dégâts directs
- Fait saigner l'adversaire : 3 % des PV max par tour, soins −50 %, 4 tours

### Ruche (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand l'adversaire attaque (à chaque attaque) · 1 seul déclenchement_
- Poison sur l'adversaire : 3 dégâts par tour pendant 10 tours

Après (texte commun, celui du site) :

**Piège**
_À chaque attaque de l'adversaire · 1 seul déclenchement_
- Empoisonne l'adversaire : 3 dégâts par tour pendant 10 tours

### Sarcophage (Piège)

Avant (catalogue actuel) :

**Piège**
_Quand l'adversaire a attaqué 4 fois (puis toutes les 4 attaques) · 1 seul déclenchement_
- Annule la prochaine attaque de l'adversaire

Après (texte commun, celui du site) :

**Piège**
_Toutes les 4 attaques de l'adversaire · 1 seul déclenchement_
- Annule la prochaine attaque de l'adversaire

### Link Baby (Combattant)

Avant (catalogue actuel) :

**Passifs**
- Évite la mort une fois (reste à 1 PV, retire les statuts négatifs)
- Réanimation : meurt puis revient avec 40 % de ses PV max (une fois)
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- Évite la mort une fois (reste à 1 PV, statuts négatifs retirés)
- Réanimation : revient avec 40 % de ses PV max (une fois)
**Ultime**
- (aucun)

### Morph de peinture (Combattant)

Avant (catalogue actuel) :

**Passifs**
- Effet aléatoire parmi tous les effets du jeu : 100 % de chances chaque tour
**Ultime**
_Se déclenche à partir du tour 1 · 3 utilisations · délai minimum 2 tours_
- Vole l'ultime de l'adversaire

Après (texte commun, celui du site) :

**Passif**
- Effet aléatoire à chaque tour
**Ultime**
_Se déclenche dès son tour 1, au plus une fois tous les 2 tours, 3 utilisations maximum_
- Vole l'ultime de l'adversaire

### Rahu dévoreur de lune (Combattant)

Avant (catalogue actuel) :

**Passifs**
- chaque attaque réussie pose 🍴 puis 🔪 ; la 3e (sans dégâts) avale la cible si ses PV actuels valent au moins 3 × l'ATQ de la cible. Mâchée 3 fois (20 % de ses PV max) puis recrachée, puis 2 tours de digestion. Statuts négatifs de la cible : transmis ×1,5, une seule mâche
- Au début de ses tours 3, 6 et 9, avant d'attaquer, monte d'un niveau (I, II, III) jusqu'à la fin du combat : à chaque niveau purifiée (étourdissement compris), ATQ +10 %, PV max +15 % ; ses attaques purifient l'adversaire et volent 10 / 20 / 30 % des dégâts selon le niveau
**Ultime**
- (aucun)

Après (texte commun, celui du site) :

**Passifs**
- Chaque attaque réussie pose 🍴 puis 🔪 ; la 3e attaque réussie ne fait pas de dégâts : elle avale la cible si ses PV actuels valent au moins 3 × l'ATQ de la cible (sinon les marques tombent et le coup porte normalement). La carte avalée est mâchée 3 fois (20 % de ses PV max à chaque tour) puis recrachée, et la carte digère 2 tours sans attaquer. Pendant l'avalage, personne n'attaque et tout ce qui visait la carte avalée la touche. Si la cible a des statuts négatifs, ils lui passent ×1,5 : une seule mâche, puis recrachée
- Au début de ses tours 3, 6 et 9, avant d'attaquer, monte d'un niveau (I, II, III) jusqu'à la fin du combat : à chaque niveau purifiée (étourdissement compris), ATQ +10 %, PV max +15 % ; ses attaques purifient l'adversaire et volent 10 / 20 / 30 % des dégâts selon le niveau
**Ultime**
- (aucun)
