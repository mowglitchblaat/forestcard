-- 77-basique-foret-enchantee.sql (a executer une fois dans Supabase, apres 76 ; peut etre relance)
-- Basique (les cartes sans collection) a un lieu : le lieu sans collection de la carte du monde (la Foret
-- Enchantee). Une option d'evenement eclair sans collection part donc de ce lieu (avant : du centre).

create or replace function public.evenement_trajet_heures(p_option bigint)
returns numeric language sql stable security definer set search_path = public as $$
  select round(coalesce(o.trajet_minutes / 60.0,
    sqrt(power(e.eclair_x - coalesce(l.x, 50), 2) + power(e.eclair_y - coalesce(l.y, 50), 2)) / greatest(1, o.vitesse))::numeric, 2)
  from public.evenements_options o
  join public.evenements e on e.id = o.evenement_id
  left join lateral (select l.x, l.y from public.lore_lieux l
                     where l.collection_id is not distinct from o.collection_id
                     order by l.id limit 1) l on true
  where o.id = p_option and e.eclair_x is not null and e.eclair_y is not null;
$$;
