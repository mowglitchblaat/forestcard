-- 18-communes-partout.sql — Forest Card
-- Les cartes de rareté COMMUNE peuvent sortir dans TOUS les boosters, quelle que soit leur collection
-- (elles gardent leur collection pour le classement et le catalogue).
-- Les autres raretés ne changent pas : elles sortent seulement dans les boosters qui contiennent leur collection.
-- Les cartes sans collection sortent toujours dans tous les boosters.
-- Une rareté est « commune » si son nom commence par « commun » (Commun, Commune, Communes…).
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

-- 1) Une rareté est-elle la rareté commune ?
create or replace function public._rarete_commune(p_rarete bigint)
returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from public.raretes r where r.id = p_rarete and lower(trim(r.nom)) like 'commun%')
$$;

-- 2) Tirage d'une carte (même fonctionnement qu'avant, seule la règle des collections change)
--    rareté selon son poids (+ modificateur du booster), puis carte au hasard dans la rareté (vedettes avec leur poids), puis version
create or replace function public._tirer_variante(p_type_id integer)
returns integer language plpgsql set search_path = public as $function$
declare v_rarete int; v_carte int; v_variante int;
begin
  select r.id into v_rarete
  from public.raretes r
  left join public.boosters_modifs m on m.rarete_id = r.id and m.type_id = p_type_id
  where greatest(r.poids + coalesce(m.modif, 0), 0) > 0
    and exists (
      select 1 from public.cartes c
      where c.rarete_id = r.id and c.actif
        and (c.collection_id is null
             or public._rarete_commune(c.rarete_id)
             or c.collection_id in (select bc.collection_id from public.boosters_collections bc where bc.type_id = p_type_id))
        and exists (select 1 from public.variantes_carte v where v.carte_id = c.id and v.poids > 0))
  order by -ln(1 - random()) / greatest(r.poids + coalesce(m.modif, 0), 0)
  limit 1;

  if v_rarete is null then
    raise exception 'AUCUNE_CARTE_DISPONIBLE';
  end if;

  select c.id into v_carte
  from public.cartes c
  where c.rarete_id = v_rarete and c.actif
    and (c.collection_id is null
         or public._rarete_commune(c.rarete_id)
         or c.collection_id in (select bc.collection_id from public.boosters_collections bc where bc.type_id = p_type_id))
    and exists (select 1 from public.variantes_carte v where v.carte_id = c.id and v.poids > 0)
  order by -ln(1 - random()) / greatest(coalesce((select bv.poids from public.boosters_vedettes bv where bv.type_id = p_type_id and bv.carte_id = c.id), 1), 0.0001)
  limit 1;

  select v.id into v_variante
  from public.variantes_carte v
  where v.carte_id = v_carte and v.poids > 0
  order by -ln(1 - random()) / v.poids
  limit 1;

  return v_variante;
end $function$;

-- 3) Contenu des boosters dans la boutique : les communes de toutes les collections apparaissent dans chaque booster
create or replace function public.contenu_boosters()
returns table (type_id bigint, collection_id bigint, collection_nom text, rarete_nom text, rarete_couleur text, rarete_poids numeric, nb bigint)
language sql stable security definer set search_path = public as $$
  with sources as (
    -- les collections choisies pour chaque booster
    select bc.type_id::bigint as type_id, bc.collection_id::bigint as collection_id from public.boosters_collections bc
    union
    -- + les cartes sans collection, dans tous les boosters actifs
    select tb.id::bigint, null::bigint from public.types_boosters tb where tb.actif
  ),
  dispo as (
    select s.type_id, c.collection_id::bigint as collection_id, c.rarete_id, c.id
    from sources s join public.cartes c on c.actif and c.collection_id is not distinct from s.collection_id
    union
    -- + les cartes de rareté commune de toutes les collections, dans tous les boosters actifs
    select tb.id::bigint, c.collection_id::bigint, c.rarete_id, c.id
    from public.types_boosters tb join public.cartes c on c.actif and public._rarete_commune(c.rarete_id)
    where tb.actif
  )
  select d.type_id, d.collection_id, coalesce(co.nom, 'Cartes communes'), r.nom, r.couleur, r.poids::numeric, count(d.id)
  from dispo d
  join public.raretes r on r.id = d.rarete_id
  left join public.collections co on co.id = d.collection_id
  group by d.type_id, d.collection_id, co.nom, r.nom, r.couleur, r.poids
$$;

grant execute on function public.contenu_boosters() to anon, authenticated;

-- Vérification : nom de la rareté reconnue comme commune (doit afficher une ligne)
select id, nom from public.raretes where public._rarete_commune(id);
