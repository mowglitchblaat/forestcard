# Forest Card : réécriture du moteur de combat

Réécriture en TypeScript du moteur de combat de [`mowglitchblaat/forestcard`](https://github.com/mowglitchblaat/forestcard) (jeu de cartes Twitch), pour qu'un seul moteur serve l'edge function, l'overlay OBS, le simulateur, le site et le catalogue. Le moteur est le **domaine** : il calcule un combat et émet des événements typés, rien d'autre.

## Règles

Les décisions du projet, avec leur raison, sont dans `docs/adr/` : à lire avant de proposer un changement de structure ou de contrat.

- **Les tests de règles de l'auteur** (`packages/engine/test/moteur.test.js`) tournent contre le moteur TS (`packages/engine/test/legacy-rules.test.ts`). Une règle nouvelle ou corrigée y ajoute son test. Un test qui casse est une régression.
- **Le texte du journal est un contrat** (`docs/adr/0005-txt-est-un-contrat.md`). Une correction de comportement ou de texte est un changement séparé et explicite, jamais un effet de bord d'un refactor.
- **Le domaine reste pur.** `packages/engine` n'importe ni DOM, ni Node, ni Deno, et ne contient aucun texte. Le parallélisme, l'affichage et les entrées/sorties vivent dans les utilisations (`apps/`, `tools/`).
- **Événements de domaine** : des faits typés, pas de texte. Toute information qu'un texte du journal exprime est un champ nommé de l'événement (`source: 'trap'`, `stacked: true`). La **projection** (`packages/journal`) produit le journal legacy en lisant la vue (`CombatView`) pendant l'appel `onEvent`.
- **Ordre du RNG et `flush()`.** Dans le moteur, l'ordre des tirages aléatoires et des appels qui vident les effets en attente est du comportement. Avant de déplacer une expression, lis `docs/legacy/moteur.md`.
- **Langues.** Code et commentaires en anglais. Docs en français. Les clés des données restent en français (contrat avec la base).
- **Vocabulaire.** combat > manche > round > tour. Un tour est l'action d'une carte. Un round est un passage où chaque carte joue une fois. Tout terme du jeu passe par `docs/glossaire.md`, et un nouveau terme y entre dans le même changement que le code.
- **Doc dans le même changement.** Une modification de règle du jeu, de contrat (journal, types, données) ou de structure met à jour la doc concernée dans le même commit.
- **Plans d'exécution** dans `docs/plans/`, ignoré par git.
- **Sans dépendance externe, en syntaxe effaçable** : `packages/engine` et `packages/journal` doivent rester exécutables par `node` seul (`docs/adr/0006-deux-facons-d-executer-le-moteur.md`). Pas de paquet npm, pas d'`enum`, de `namespace` ni de propriétés de paramètres.
- **Le site React (`apps/web`)** : une icône par sens, prise dans `src/lib/icons.ts` (jamais un import direct de `lucide-react`) ; une couleur par sens, prise dans `src/lib/tones.ts` ou une variante de composant (jamais une couleur de la palette Tailwind, `bg-red-500`) ; et le lint shadcn complet : un `style` ne porte que des variables CSS, pas de valeur arbitraire (`p-[13px]`), et une vue ne change d'un composant que sa mise en page, sauf ce que son contrat ouvre (`vite.config.ts`). Le détail : `apps/web/README.md`, « Choix techniques ».

**Sans installation, ces règles ne sont vérifiées qu'en CI** (`vp check` à chaque push) : les appliquer en écrivant, plutôt que de découvrir l'échec après le push.

## Où chercher

- `docs/guides/ajouter-un-effet.md` : **à suivre pour tout nouvel effet, passif ou condition de piège** (les dix endroits à toucher, ce qui les vérifie, les pièges).
- `docs/adr/` : les décisions du projet et leur raison (une par fichier). `docs/adr/AGENTS.md` dit quand en écrire une, et comment.
- `docs/glossaire.md` : clé en base ↔ identifiant TS ↔ sens dans le jeu.
- `docs/legacy/reference.md` : le flux d'un combat en prod, le rôle de chaque fichier legacy, ce qui manque au repo.
- `docs/legacy/moteur.md` : interface du moteur legacy, journal, pièges pour l'iso, bizarreries à conserver.
- `packages/engine/src/simulate.ts` : le déroulé d'un combat. `mechanics/` : une mécanique par module (statuts, défenses, avalage, exécution, transcendance, détonation et missiles, souffle, programmation, ultimes…) avec son état, ses effets, son passif et ses étapes ; `combat/moments.ts` : le seul endroit où vit l'ordre des étapes d'un tour ; `combat/` : le cœur (contexte et RNG, dégât de base, registre des effets, pièges). `events.ts` : le catalogue des événements de domaine. `packages/journal/src/project.ts` : le seul endroit où vit le texte du journal.
- `docs/legacy/cartes-*.json` : snapshot des cartes réelles (simulateur, tests du site React).
- `apps/web/README.md` : la réécriture du site en React (TanStack Router, TanStack Query, zod, shadcn/ui), construite à côté de `apps/site` ; avancement par tranche.
- `db/` : les migrations SQL de la base (copie de celles de l'amont, rangée à part) et comment elles s'appliquent.
- `assets/` : fichiers statiques servis par le site (cadres, images des cartes). `apps/overlay-boosters` : l'overlay des boosters, servi tel quel.
- `docs/guides/basculement.md` : la bascule (faite le 19 octobre 2026) : adresses servies, workflows `.github/workflows/`, retour en arrière. `tools/pages/assemble.ts` assemble le site publié (`pnpm run pages`).
- `apps/edge/README.md` : générer le fichier unique à coller dans Supabase.
- `apps/overlay-combat/README.md` : générer `combat.html` (page autonome, moteur partagé inliné) et ses preuves (présentation identique, moteur identique).
- `apps/simulator/README.md` : winrates d'équilibrage en ligne de commande (mêmes chiffres que `combat.html`).
- `packages/describe` : le texte de chaque effet, passif, condition et ultime, une seule formulation pour toutes les pages. `apps/site/README.md`, `apps/catalogue/README.md` : comment chaque page l'affiche, et les preuves.
- `docs/rapports/` : rapports générés pour relecture par l'auteur (textes avant → après).
- `tools/node-only/README.md` : **travailler sans installation** (pas de registre npm) : ce que `node` seul vérifie, et ce que fait la CI.

## Vérifier

**Sans installation** (pas de registre npm, Claude en desktop ou dans le cloud) : `node tools/node-only/link.ts` une fois, puis `node --test tools/node-only/rules.test.ts` (les tests de règles de l'auteur, contre le moteur TS). Le lint, les autres tests et les builds sont faits par la CI à chaque push sur `main`, qui publie aussi le fichier de l'edge à coller (`<site>/edge/swift-responder.ts`). Un build dont les vérifications échouent n'est jamais publié.

**Avec l'installation** : `vp check` (format, lint, types) et `vp run -r test` (tests de tous les packages). `vp run ready` enchaîne les deux.
