# ADR : les décisions du projet

Une ADR (Architecture Decision Record) note une décision et sa raison, pour qu'un lecteur futur ne « corrige » pas ce qui était voulu. Ce dossier ne contient que les décisions **du projet** : celles qui restent vraies quand ce repo est le seul. Les règles de transition (iso, `legacy/`, synchro avec l'amont, pages de l'auteur) vivent dans `AGENTS.md` à la racine, section « Transition », et tombent à la bascule.

## Quand écrire une ADR

Les trois conditions, toutes :

1. **Difficile à défaire** : changer d'avis plus tard coûte cher.
2. **Surprenante sans contexte** : un lecteur qui voit le code se demandera pourquoi.
3. **Issue d'un vrai arbitrage** : il y avait des alternatives, et on en a choisi une pour des raisons précises.

S'il en manque une, pas d'ADR. Une convention va dans `AGENTS.md`, un terme dans `docs/glossaire.md`, une idée dans les « Plus tard » du README concerné.

## Format

Un fichier par décision, `NNNN-titre-court.md`, numéroté à la suite du plus grand numéro existant. En français.

```md
# Titre court de la décision

Le contexte, ce qu'on a décidé, et pourquoi, en quelques phrases.
```

Sections facultatives, seulement si elles apportent quelque chose : **Options écartées** (quand le rejet n'est pas évident), **Conséquences** (quand un effet en aval ne se voit pas).

## Changer une décision

On ne réécrit pas une ADR acceptée : on en écrit une nouvelle, et l'ancienne prend en tête la ligne `Statut : remplacée par NNNN`. On ne supprime pas une ADR remplacée, elle explique pourquoi le code a eu sa forme précédente.

Une ADR se met à jour dans le même changement que le code qu'elle décrit.
