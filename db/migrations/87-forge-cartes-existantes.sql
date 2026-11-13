-- 87-forge-cartes-existantes.sql — Forest Card
-- Forge de creation : elle forge une magie ou un piege qui existe dans le jeu (avec son image), au lieu d'une carte
-- sans image a l'effet tire au hasard. L'edge function passe ces cartes au moteur (regles.forgeCartes) : les magies
-- et les pieges actifs qui ont un effet et une image (la version la plus courante).
-- A lancer une fois dans Supabase (SQL Editor), apres 86-terrains.sql ; peut etre relance.

create or replace function public.forge_cartes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'type', c.type, 'nom', c.nom, 'effet', c.effet, 'collection_id', c.collection_id,
      'image', v.image_path,
      'rar', (select jsonb_build_object('nom', r.nom, 'couleur', r.couleur, 'poids', r.poids) from public.raretes r where r.id = c.rarete_id))
    order by c.id), '[]'::jsonb)
  from public.cartes c
  cross join lateral (
    select vc.image_path from public.variantes_carte vc
    where vc.carte_id = c.id and vc.image_path is not null
    order by coalesce(vc.poids, 100) desc, vc.id limit 1) v
  where c.type in ('magie', 'piege') and c.actif and c.effet is not null;
$$;
revoke all on function public.forge_cartes() from public, anon, authenticated;
grant execute on function public.forge_cartes() to service_role;
