-- 99-eclair-absorbe.sql — Forest Card
-- L'éclair absorbé (24 novembre 2026) : la Forêt Enchantée a bu tout l'éclair de Drag'Orage, qui a donné
-- naissance à l'Arbre-mère foudroyé. Sur la carte du monde (Lore > Carte), plus aucun lieu ne crépite :
--   - lore_carte.eclair_absorbe : vrai, l'électricité autour du lieu qui détenait l'éclair disparaît (le
--     lieu, son nom et la lueur violette restent où ils sont). Réglé dans Admin > Lore (Carte du monde).
-- L'historique des événements de l'éclair (vote, contestation, défense) ne change pas.
-- À lancer une fois dans Supabase (SQL Editor), après 98-coffres-perce-abime.sql ; peut être relancé.

alter table public.lore_carte add column if not exists eclair_absorbe boolean not null default false;
