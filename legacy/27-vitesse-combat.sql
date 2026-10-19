-- 27-vitesse-combat.sql — Forest Card
-- Vitesse des combats sur l'overlay OBS, réglable dans Admin > Réglages.
-- Valeur = durée des animations : 1 = normal, 0.5 = deux fois plus vite, 1.6 = plus lent.
-- L'overlay la lit au début de chaque combat (lecture seule, sans connexion) ; seul l'admin peut la changer (comme les autres réglages).
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

insert into public.reglages_jeu (cle, valeur) values ('vitesse_combat', '1')
on conflict (cle) do nothing;

create or replace function public.vitesse_combat()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select case when valeur ~ '^[0-9]+([.][0-9]+)?$' then least(3, greatest(0.25, valeur::numeric)) end
                   from public.reglages_jeu where cle = 'vitesse_combat'), 1);
$$;
revoke all on function public.vitesse_combat() from public;
grant execute on function public.vitesse_combat() to anon, authenticated;

select public.vitesse_combat() as vitesse_actuelle;
