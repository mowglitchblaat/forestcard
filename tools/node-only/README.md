# Travailler sans installation : `node` seul

Pour un environnement sans registre npm (Claude en desktop ou dans le cloud) : ni `pnpm install`, ni `vp`, ni build. Il faut seulement Node 22.18 ou plus récent, qui exécute le TypeScript tel quel (`packages/engine` et `packages/journal` n'ont aucune dépendance externe et n'utilisent que de la syntaxe effaçable : voir `docs/adr/0006-deux-facons-d-executer-le-moteur.md`).

## Une fois

```bash
node tools/node-only/link.ts
```

Crée les liens `node_modules/@forestcard/{engine,journal,describe}` vers `packages/`, que pnpm ferait : le journal importe `@forestcard/engine`. Une jonction sous Windows (sans droits admin), un lien symbolique ailleurs. Une entrée existante n'est pas touchée.

## Vérifier un changement du moteur

```bash
# Les tests de règles de l'auteur, contre le moteur TS (55 tests ; « les 3 copies » est ignoré)
node --test tools/node-only/rules.test.ts

# Le run d'iso sur échantillon (voir tools/iso/README.md pour les suites et les options)
node tools/iso/src/cli.ts --suite synthetic --count 200000 --candidate packages/journal/src/index.ts
node tools/iso/src/cli.ts --suite decks --count 100000 --candidate packages/journal/src/index.ts
node tools/iso/src/cli.ts --suite dirty --count 200000 --candidate packages/journal/src/index.ts
node tools/iso/src/cli.ts --suite real --limit 1000000 --candidate packages/journal/src/index.ts
```

Le run d'iso ne sert qu'à la réécriture : il compare au moteur de l'auteur tant que `legacy/` existe, et il est retiré à la bascule (`docs/guides/basculement.md`). Après, seuls les tests restent.

## Ce que `node` seul ne fait pas

- **Les autres tests** (`vp run -r test` : moteur, journal, textes, pages) et **`vp check`** (format, lint, types).
- **Les builds** : `combat.html`, le site, le catalogue, et **le fichier de l'edge function**.

C'est la CI qui les fait : à chaque push sur `main`, `.github/workflows/pages.yml` installe tout, fait passer `pnpm run ready` (lint, types, tous les tests), construit, puis publie le site. Un build dont les vérifications échouent n'est jamais publié. Le fichier de l'edge, prêt à coller dans Supabase, est alors à l'adresse du site : `<site>/edge/swift-responder.ts`.

Le chemin d'une correction du moteur, sans rien installer : modifier `packages/engine` (et `packages/journal` si le texte du journal change), vérifier avec les commandes ci-dessus, pousser, attendre le workflow « Site », puis coller le fichier de l'edge publié.
