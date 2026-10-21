-- 31-zones-combat.sql — Forest Card
-- Effets qui s'allument sur la carte en combat : la page de combat (OBS, sans connexion) lit, pour les
-- cartes du combat, la place des lignes de l'écriteau de leur version Standard (variantes_carte.compo.zones).
-- La table n'est pas lisible sans connexion : cette fonction ne donne que ces zones et les chemins des
-- images (pour vérifier que la carte affichée est bien la version Standard), et seulement pour les cartes
-- publiées (toutes pour l'admin).
--
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

create or replace function public.zones_cartes(p_ids bigint[])
returns table (carte_id bigint, image_path text, image_combat text, zones jsonb)
language sql stable security definer set search_path = public as $$
  select v.carte_id::bigint, v.image_path, v.image_combat, v.compo->'zones'
  from public.variantes_carte v
  join public.cartes c on c.id = v.carte_id
  where v.nom = 'Standard' and v.carte_id = any(p_ids) and (c.actif or public.is_admin())
$$;
revoke all on function public.zones_cartes(bigint[]) from public;
grant execute on function public.zones_cartes(bigint[]) to anon, authenticated;
