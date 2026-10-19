-- 20-images-inutilisees.sql — Forest Card
-- Liste les images du stockage « cartes » qui ne sont plus utilisées par aucune carte (active OU désactivée),
-- aucun booster, aucun dos de carte et aucune proposition : anciens originaux, images remplacées, cartes supprimées.
-- Sert au bouton Admin > Réglages > « Supprimer les images inutilisées ». Réservé à l'admin.
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

create or replace function public.admin_images_inutilisees()
returns table (chemin text, octets bigint)
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  return query
  with utilisees as (
    select v.image_path as p from public.variantes_carte v
    union select v.image_combat from public.variantes_carte v
    union select tb.image_path from public.types_boosters tb
    union select d.image from public.dos_cartes d
    union select pr.image_path from public.propositions pr
    union select pr.image_carte from public.propositions pr
  )
  select o.name::text, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.bucket_id = 'cartes'
    and o.created_at < now() - interval '1 hour'   -- sécurité : ne touche pas une image envoyée à l'instant (carte en cours de création)
    and not exists (select 1 from utilisees u where u.p = o.name)
  order by 2 desc;
end $$;

revoke execute on function public.admin_images_inutilisees() from public, anon;
grant execute on function public.admin_images_inutilisees() to authenticated;

-- Aperçu : nombre et taille des images inutilisées (lecture seule)
select count(*) as images_inutilisees, pg_size_pretty(sum(coalesce((o.metadata->>'size')::bigint,0))) as taille
from storage.objects o
where o.bucket_id = 'cartes' and o.created_at < now() - interval '1 hour'
  and o.name not in (select p from (
    select image_path p from public.variantes_carte union select image_combat from public.variantes_carte
    union select image_path from public.types_boosters union select image from public.dos_cartes
    union select image_path from public.propositions union select image_carte from public.propositions) u where p is not null);
