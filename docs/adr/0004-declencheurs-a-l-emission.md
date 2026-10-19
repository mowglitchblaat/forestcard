# Les déclencheurs réagissent aux événements, au moment où ils sont émis

Des ultimes (`udecl` : un statut reçu, une esquive, un gros coup…) et des conditions de piège (`proprio_statut`, `tour_n`…) réagissent à ce qui arrive pendant le combat. Le moteur ne lit pas de journal. Il classe chaque événement de domaine **au moment où il l'émet** (`emit`, `combat/combat.ts`), y compris pendant une capture (`hold`), et jamais quand un événement capturé est libéré. Le classement est une table qui couvre tous les types d'événement (`TRIGGER_FACT`, `mechanics/triggers.ts`) : un nouveau type d'événement ne compile pas tant qu'on n'a pas dit s'il déclenche quelque chose. Ensuite, dans cet ordre : les ultimes concernés sont marqués tout de suite, et le scan des pièges attend le prochain `flush()`. Le crochet ne tourne que si un deck s'en sert.

L'ancien moteur faisait la même chose en lisant son journal ligne par ligne, au moment de l'écriture (`trig` dans `L()`). La correspondance entre les deux classements est vérifiée événement par événement (`tools/iso/src/triggers.test.ts`).

## Options écartées

- **Lire le journal projeté** : le moteur dépendrait de sa propre projection et de ses phrases, à l'inverse de l'ADR 0001.
- **Classer à la libération plutôt qu'à l'émission** : un événement capturé puis libéré (« évite la mort ») déclencherait deux fois, ou au mauvais moment.
