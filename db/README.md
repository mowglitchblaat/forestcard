# Base de données (Supabase)

## `migrations/`

Les scripts SQL de la base, numérotés dans l'ordre où ils ont été appliqués (`10-equilibrage.sql` … `48-tournoi-json-delete.sql`). Ils ne sont pas exécutés par un outil : l'auteur les colle à la main dans l'éditeur SQL du dashboard Supabase, une fois, dans l'ordre.

- **Jamais de `delete` ni d'`update` sans `where`** : Supabase les refuse (extension pg_safeupdate, « DELETE requires a WHERE clause »). Pour tout vider, `where true`.
- **Pas de 01 à 09** : l'auteur ne les a plus. Le schéma complet viendra de ses exports (fonctions, tables, RLS, triggers), voir `docs/legacy/reference.md`.
- **Le nom du dossier n'est pas `supabase/migrations/`** : le CLI Supabase y attend des noms horodatés (`20261017120000_nom.sql`). Un `supabase db push` lancé par erreur ne comprendrait pas ces fichiers.

## Tant que l'amont est la référence

L'amont garde ses migrations à sa racine ; `legacy/` les recopie telles quelles. Ce dossier en est une copie au même octet près, rangée à part. Quand l'amont ajoute ou modifie une migration :

1. `node tools/legacy-sync/sync.ts --apply` la met dans `legacy/` ;
2. on la copie dans `db/migrations/` ;
3. `tools/legacy-sync/test/copies.test.ts` vérifie que les deux dossiers ont les mêmes fichiers, au même octet près. Il échoue tant que l'étape 2 n'est pas faite.

Au basculement, `legacy/` quitte le repo : ce dossier devient la seule copie et le test de dérive est retiré.
