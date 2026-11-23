# Ajouts à overlay-3d (Claude, 23 novembre 2026)

Tout ce qui manquait au dossier, écrit sur le modèle du code existant : mêmes registres (une entrée
manquante ne compile pas), mêmes contrats (`defineStatusFx`, `defineMarkFx`, `defineMoveFx`), mêmes
unités (la carte en W × H, la face dans `card.box`).

## Statuts (status/shaders-more.ts)

Les trois statuts que le moteur a et que le dossier n'avait pas : **contamination**, **weakness**
(faiblesse), **gag**. Sans eux, `status/registry.ts` ne compilait plus avec le moteur actuel.

Six états de mécaniques montrés comme un statut (`LastingKind`) : **mist** (brume, niveaux 1-2),
**roots** (enracinement), **mutation** (niveaux 1-3), **molt** (mue), **volt** (charges électriques,
courant, surcharge, marque de foudre), **puppet** (carte sous contrôle).

Tous compilés et vus sur un banc WebGL (Chrome, vraie carte), coût mesuré : entre la Fracture et la
Brûlure, en dessous du Gel et de la Transcendance.

## Marques (marks/)

`threads` (fils, barre de contrôle dès 5), `links` (liens parasitaires), `shield` (bouclier, une coque
par couche), `target` (ciblage / visée, encoches = utilisations), `guard` (garde), `forge` (runes
chauffées, jusqu'à 6), `blades` (lames en orbite), `charges` (charges en orbite).

## Coups (moves/)

- defense.ts : `block`, `thorns` (épines, riposte, réplique), `mirror` (renvoi, magie miroir)
- life.ts : `heal`, `drain` (vol de vie), `buff`, `debuff`, `swap` (échange ATQ/PV), `purify`
- strikes.ts : `critical`, `headshot`, `laser`, `reap` (fauche), `detonate`, `lightning`, `missile`,
  `breath` (souffle), `cut` (tranchant), `execute` (coupe finale de l'exécution)
- fate.ts : `ultimate` (flammes rouges et noires, shader vu sur le banc), `shatter` (carte brisée en
  éclats), `reform` (réanimation + auréole), `deathAvoid` (crâne barré), `wardBreak`, `victory`
- mechanics.ts : `seize` / `release` (prise de contrôle, fils rompus), `gulp` / `spit` (avalage),
  `forgeStrike`, `forgeCreate`, `iceBurst`, `steam`, `steal`, `cancelled` (magie annulée)

## Effets d'origine (legacy/)

Repris de l'ancien overlay (apps/overlay-combat/src/combat.html) presque ligne à ligne, dans une couche
Canvas 2D au-dessus de la scène (legacy/fx.ts, active seulement pendant un effet) : la fracture (l'os
qui se brise), l'exécution (lames d'obsidienne, épée, entaille rouge, carte coupée en deux et
reconstruite à la réanimation, piège tranché), l'avalage (langue, GLOUPS, ventre, dents, CRUNCH,
PTOUH, transfert des statuts), la brume (brouillard qui tourne, Dissipé, renvoi en tir) et le lien
parasitaire (vrille de chair entre les deux cartes, soin qui remonte en lueurs vertes). Ils remplacent,
dans le branchement du combat, la marque d'exécution du dossier et mes versions de la brume et des liens
(les fichiers restent, inutilisés par le combat).

## Terrains (scenes/terrain.ts)

Les 8 terrains (orage, essaim, forêt, cathédrale, lune de sang, sakura, grimoire, théâtre) en ambiance
derrière les cartes, et leur effet quand ils agissent sur une carte.

## Branchement (scenes/combat-fx.ts + scenes/combat.ts)

`combat-fx.ts` lit chaque ligne du journal (champs de packages/journal/src/project.ts) et joue le bon
statut, la bonne marque, le bon coup, sur la bonne carte (combattant, magie ou piège).
Changements dans `combat.ts`, limités :
- contamination, faiblesse, gag ajoutés aux tables de statuts ;
- un calque de terrain sous la scène ;
- `controle` / `controle_fin` : les fils jouent, puis les côtés montrent qui combat pour qui (relais) ;
- `reanim_mort` / `reanim` : éclats puis reconstitution (au lieu d'un fondu) ;
- `fin` : le vainqueur scintille, le perdant se brise (au lieu de pâlir).

## Consommation graphique (config/quality.ts)

- `?qualite=eco` (ou `setQuality('eco')` avant de construire quoi que ce soit) : bruit à 3 octaves au
  lieu de 5 dans tous les shaders (25 à 45 % de travail en moins par pixel, mesuré), moitié de
  particules par gerbe, terrain animé à 30 images/s.
- `engine/particles.ts` : la boucle ne tourne plus quand il n'y a plus de particule (avant, chaque
  conteneur de particules empêchait l'overlay de ralentir au repos).
- Icônes SVG lues une seule fois et partagées, textures dessinées une seule fois : chaque effet ne
  fait que poser des sprites.
- Terrains : sprites uniquement, pas de shader ni de filtre, 36 particules au plus.

## Ce qui reste à faire pour que ça tourne

Le dossier n'est qu'un paquet. Il lui faut, dans le dépôt :
1. `pixi.js` (v8) et `pixi-filters` dans les dépendances ;
2. le paquet `@forestcard/layout` (dimensions W/H, styles, cadres), absent du dossier et du dépôt ;
3. la page qui l'utilise (`apps/overlay-3d`), qui lit `?qualite=eco` avec `qualityFromUrl`.

Tout a été vérifié avec le vrai Pixi (8.13.2) dans Chrome : les 21 statuts, les 12 marques, les 36
coups et les 8 terrains tournent sans erreur, captures à l'appui (banc des effets en ligne). Le voile de
couleur des terrains est volontairement léger (WASH dans scenes/terrain.ts) : le combat passe par-dessus
le stream.
