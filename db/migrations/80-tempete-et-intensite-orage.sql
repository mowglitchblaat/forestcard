-- 80-tempete-et-intensite-orage.sql — Forest Card
-- Deux reglages d'ambiance pour la suite de l'evenement de l'eclair :
--   - lore_carte.tempete : la tempete sur la carte du monde (Lore > Carte), 0 = eteinte, 1 a 5 = intensite.
--     Reglee dans Admin > Lore (Carte du monde), lue par tous avec la carte.
--   - reglage orage_intensite (1 a 5, defaut 1) : l'intensite des eclairs en fond pendant les combats quand
--     l'evenement Orage est actif (Admin > Reglages). Lue par l'overlay OBS avec orage_intensite().
-- A lancer une fois dans Supabase (SQL Editor), apres 79-titre-defense-tardive.sql ; peut etre relance.

alter table public.lore_carte add column if not exists tempete smallint not null default 0
  check (tempete between 0 and 5);

insert into public.reglages_jeu (cle, valeur) values ('orage_intensite', '1') on conflict (cle) do nothing;

create or replace function public.orage_intensite()
returns integer language sql stable security definer set search_path = public as $$
  select greatest(1, least(5, coalesce((select round(valeur::numeric)::int from public.reglages_jeu
    where cle = 'orage_intensite' and valeur ~ '^[0-9]+(\.[0-9]+)?$'), 1)));
$$;
revoke all on function public.orage_intensite() from public;
grant execute on function public.orage_intensite() to anon, authenticated;
