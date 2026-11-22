-- 96-lueur-ciel.sql — Forest Card
-- Une lueur violette dans le ciel de la carte du monde (Lore > Carte), pour annoncer un événement à venir.
--   - lore_carte.lueur : 0 = éteinte, 1 (à peine visible) à 10 (ciel embrasé). Réglée dans Admin > Lore
--     (Carte du monde), lue par tous avec la carte. Montée petit à petit au fil des jours.
-- La lueur tombe du ciel, depuis le haut de la carte, au-dessus du lieu qui détient l'éclair (sinon au
-- centre), avec des rayons doux à partir du niveau 2.
-- À lancer une fois dans Supabase (SQL Editor), après 95-live-auto.sql ; peut être relancé.

alter table public.lore_carte add column if not exists lueur smallint not null default 0
  check (lueur between 0 and 10);
