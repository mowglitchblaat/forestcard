# Run d'iso complet du 2026-10-19 : déclencheurs, programmation sans liste, magie détruite

Preuve du report de la synchro amont jusqu'à `5fabe1b` dans le moteur TS : les déclencheurs d'ultime et les conditions de piège sur événement (`05c9e53`), la programmation sans liste (`228d890`), la magie du début qui ne compte plus comme « une carte s'active » (`05c9e53`) et la magie détruite qui ne se joue plus (`fe7206c`).

Référence : `legacy/moteur-combat.js` au commit amont `5fabe1b`. Candidat : le moteur TS et la projection du journal (`packages/journal`) de la branche `cutover`. Le dernier commit qui touche le code prouvé (moteur, journal, harnais) est `ec500ec`. Cartes : `docs/legacy/cartes-2026-10-19.json` (93 cartes). Empreinte du code et des cartes : `66403b910f38`. 24 workers, 1 seed par rencontre réelle.

| Suite | Rencontres | Résultat | Durée cumulée |
|---|---|---|---|
| synthetic | 5 000 000 | 0 divergence | 0.04 h |
| dirty | 5 000 000 | 0 divergence | 0.04 h |
| decks | 2 000 000 | 0 divergence | 0.03 h |
| real | 506 250 000 | 0 divergence | 3.53 h |

**Iso prouvée : aucune divergence sur les quatre suites.**

**Le harnais lui-même** (`vp run iso:mutants`) : les 6 changements volontaires du legacy sont attrapés (`rng-short-circuit`, `over-without-flush`, `text`, `overtime-count`, `trap-chain-depth`, `text-coercion`), et le contrôle `control-key-order` (même journal, clés dans un autre ordre) passe sans divergence, comme attendu. Le mutant `text-coercion` cherchait un motif présent deux fois depuis la synchro du 2026-10-18 (la fonction `esquiver()` fait la même somme que l'attaque) : son motif vise maintenant la ligne de l'attaque seule.

Le run a été mis en pause une fois, dans la suite real à 233 268 000 rencontres, puis repris à ce point depuis son checkpoint, avec la même empreinte.

Aucune carte réelle n'utilise de déclencheur d'ultime (`udecl`) ni de condition de piège nouvelle : ces règles sont exercées par les cartes synthétiques (`tools/iso/src/synthetic.ts`). Sur 20 000 rencontres synthétiques, chaque déclencheur et chaque condition se produit au moins une fois. Le classement des événements en faits déclencheurs (`TRIGGER_FACT`) est vérifié à part, événement par événement, contre le `trig` du legacy (`tools/iso/src/triggers.test.ts`).

Ajouter des entrées aux déclencheurs et aux conditions synthétiques a changé la répartition du pool synthétique : ses chiffres ne se comparent pas à ceux des rapports précédents.

Le run précédent (`iso-complet-2026-10-18-une-mecanique-un-module.md`) prouvait le moteur avant cette synchro, contre l'amont `4e77fd8` et 90 cartes.
