# Déroulé d'un combat — Forest Card

Schéma tiré directement du moteur (`moteur-combat.js`, identique dans `combat.html` et `swift-responder.ts`).
**À mettre à jour à chaque changement de règle** — les tests (`npm test`) vérifient que le moteur respecte ces règles.

## 0. Avant le combat (lancement depuis le chat)

```mermaid
flowchart TD
  C0(["!combat (gratuit, adversaire au hasard)<br/>ou duel payant (@adversaire)"]) --> C1{"!combat : combats gratuits<br/>du jour épuisés ?"}
  C1 -- oui --> CX(["Refusé : reviens demain"])
  C1 -- non --> C2["Decks préparés, adversaire choisi"]
  C2 --> C3{"Anti-farm : ces 2 joueurs se sont déjà<br/>affrontés N fois aujourd'hui ?<br/>(dans les 2 sens, réglage admin, 0 = sans limite)"}
  C3 -- non --> C5([Le combat se joue : schéma 1])
  C3 -- "oui, adversaire au hasard" --> C4{"Encore des essais ?<br/>(4 nouveaux tirages max)"}
  C4 -- oui --> C2
  C4 -- non --> CY(["Refusé, le combat gratuit n'est pas décompté"])
  C3 -- "oui, duel visé" --> CZ(["Refusé : défie quelqu'un d'autre ou reviens demain"])
```

## 1. Vue d'ensemble

```mermaid
flowchart TD
  A([Début du combat]) --> B["Chaque joueur tire au hasard dans son deck :<br/>1 combattant · 1 magie · 1 piège"]
  B --> C[Le premier joueur est tiré au hasard]
  C --> D["Dos des cartes visibles,<br/>puis les combattants se retournent"]
  D --> E{"Une magie annule<br/>la magie adverse ?"}
  E -- oui --> E1["La magie visée est révélée puis barrée :<br/>aucun de ses effets ne passe<br/>(0 tour = tout le combat, X tours = elle revient ensuite)"]
  E -- non --> F
  E1 --> F["Les magies restantes se révèlent<br/>et s'appliquent (ordre du premier joueur)"]
  F --> G[["Tours de jeu : chaque carte joue à son tour<br/>Tour 1 = 1er joueur, Tour 2 = 2e joueur…<br/>(détail : schéma 2)"]]
  G --> H{"Une carte est à 0 PV ?"}
  H -- oui --> FIN
  H -- "non, tour 10 atteint" --> P{"Moins de 3<br/>prolongations ?"}
  P -- oui --> P1["PROLONGATION<br/>anciennes cartes défaussées,<br/>chacun tire 3 nouvelles cartes<br/>(jamais jouées en priorité)"]
  P1 --> D
  P -- non --> PV{"Qui a le plus de PV ?"}
  PV --> FIN
  FIN([Fin du combat]) --> R["Victoire 50 gold · Défaite 10 · Nul 20<br/>Double KO : les 2 cartes se brisent, match nul<br/>Le perdant se brise, le gagnant brille en or"]
```

## 2. Le tour d'une carte (ordre fixe, qu'elle joue en premier ou en deuxième)

```mermaid
flowchart TD
  T0([Tour de la carte]) --> T1["1. Début de tour<br/>· malédiction qui s'estompe : l'ATQ perdue revient (morceau par morceau)<br/>· malédiction : l'ATQ baisse<br/>· contre-attaque renforcée préparée<br/>· régénération<br/>· passif Solidification : X % de chances de se solidifier"]
  T1 --> T2{"2. Ultime prêt ?<br/>(après X tours ou quand une carte s'active,<br/>utilisations max, délai)"}
  T2 -- oui --> T2a["Ultime (aura rouge) → effets<br/>→ pièges « l'adversaire utilise son ultime »"]
  T2 -- non --> T3
  T2a --> T3{"3. Peut-elle attaquer ?"}
  T3 -- "étourdie" --> T3x[Elle saute son attaque]
  T3 -- "attaque annulée" --> T3x
  T3 -- "gel : attaque annulée ou paralysée (chance)" --> T3x
  T3 -- oui --> AT["Attaque : nombre de frappes<br/>(frappe multiple, enchaînement qui retente)<br/>fracture : chance de se blesser"]
  AT --> FR["Pour chaque frappe :<br/>esquive ? → sinon dégâts = ATQ (×2 si doublés, + rage, + bonus)<br/>réduction de dégâts · coup mortel ? (schéma 3)<br/>renvoi de dégâts · vol de vie · statuts posés par l'attaque<br/>(cible solidifiée : l'étourdissement est sans effet ;<br/>une fracture brise la solidification)<br/>attaquant transcendé : chaque coup qui touche purifie l'adversaire<br/>Exécution : X % de poser une marque (3 max) ; cible à 3 marques<br/>laissée sous X % de PV (10 %) → exécutée, même si elle évite la mort"]
  FR --> PG["Pièges « l'adversaire a attaqué N fois »<br/>(toutes les N attaques, jusqu'au maximum)"]
  T3x --> T4
  PG --> T4["4. Effets « à chaque tour »<br/>effet aléatoire · soin · ATQ / PV qui augmentent tous les X tours"]
  T4 --> T5["5. Statuts de fin de tour<br/>brûlure / poison (mêmes dégâts à chaque tour,<br/>cumul seulement s'ils sont réappliqués)<br/>saignement · purifications · dégâts différés"]
  T5 --> T6["6. Fin des durées<br/>gel · fracture · fatigue (ATQ rendue) · rage → fatigue<br/>dégâts doublés · renvoi<br/>insensibilité terminée → piège adverse réactivé s'il lui reste des déclenchements<br/>annulation de magie terminée → la magie revient<br/>solidification de l'adversaire : −1 tour (elle protège pendant ses tours à lui)<br/>Transcendance : après X tours joués (4) → purifiée, étourdissement retiré,<br/>ATQ +X % et PV max +X % (15 %), jusqu'à la fin du combat"]
  T6 --> TF([Au tour de l'autre carte])
```

## 3. Coup mortel, protections et pièges

```mermaid
flowchart TD
  K0(["Dégâts ≥ PV restants<br/>(une exécution ignore les protections ci-dessous,<br/>mais pas la réanimation)"]) --> K1{"Magie « évite la mort »<br/>active, condition remplie,<br/>pas encore utilisée ?"}
  K1 -- oui --> KE["Les dégâts s'affichent, la carte reste à 1 PV,<br/>crâne barré, statuts négatifs retirés (pas l'étourdissement)<br/>Chaque protection sauve UNE fois, chacune de son côté :<br/>magie, passif, puis piège ou ultime"]
  K1 -- non --> K2{"Passif « évite la mort »<br/>(une fois) ?"}
  K2 -- oui --> KE
  K2 -- non --> K3{"Piège « évite la mort »<br/>(le propriétaire meurt) ?"}
  K3 -- oui --> KE
  K3 -- non --> K4{"Réanimation disponible ?<br/>(passif, magie, piège ou effet reçu)"}
  K4 -- oui --> KR["La carte se brise (avec son contour de rareté),<br/>puis se reforme avec X % de ses PV max<br/>Piège de réanimation : révélé seulement maintenant,<br/>puis ses autres effets"]
  K4 -- non --> KM(["La carte tombe à 0 PV"])
```

## 4. Déclenchement d'un piège

```mermaid
flowchart TD
  P0(["Événement du combat<br/>(attaque, ultime, soin, PV bas, mort…)"]) --> P1{"Condition du piège remplie<br/>et déclenchements restants ?"}
  P1 -- non --> PX([Rien])
  P1 -- oui --> P2{"L'adversaire est<br/>insensible aux pièges ?"}
  P2 -- oui --> P3["Le piège se déclenche SANS effet :<br/>le déclenchement est consommé<br/>(croix rouge ; « épuisé » s'il n'en reste plus)"]
  P2 -- non --> P4["Le piège se révèle et applique ses effets<br/>(dégâts, statuts, souffle élémentaire, marques d'exécution,<br/>vol, destruction…)"]
  P4 --> P5{"Vol d'une carte ?"}
  P5 -- oui --> P6["La carte volée s'envole jusqu'au camp du voleur<br/>et prend la place de la carte qui a volé"]
  P4 --> P7{"Destruction ?"}
  P7 -- oui --> P8[La carte détruite se brise]
```
