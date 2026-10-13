-- 14-contenu-boosters.sql — Forest Card
-- Contenu des boosters pour la boutique : quelles collections sont dedans, et combien de cartes par rareté.
-- Ne donne AUCUN taux de drop ni modificateur (la table boosters_modifs reste réservée à l'admin),
-- et aucun nom ni image de carte (seuls les comptes par rareté).
-- Les cartes sans collection (« cartes communes ») sont incluses dans tous les boosters.
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

create or replace function public.contenu_boosters()
returns table (type_id bigint, collection_id bigint, collection_nom text, rarete_nom text, rarete_couleur text, rarete_poids numeric, nb bigint)
language sql stable security definer set search_path = public as $$
  with sources as (
    -- les collections choisies pour chaque booster
    select bc.type_id::bigint as type_id, bc.collection_id::bigint as collection_id from public.boosters_collections bc
    union
    -- + les cartes sans collection, dans tous les boosters actifs
    select tb.id::bigint, null::bigint from public.types_boosters tb where tb.actif
  )
  select s.type_id, s.collection_id, coalesce(co.nom, 'Cartes communes'), r.nom, r.couleur, r.poids::numeric, count(c.id)
  from sources s
  join public.cartes c on c.actif and c.collection_id is not distinct from s.collection_id
  join public.raretes r on r.id = c.rarete_id
  left join public.collections co on co.id = s.collection_id
  group by s.type_id, s.collection_id, co.nom, r.nom, r.couleur, r.poids
$$;

grant execute on function public.contenu_boosters() to anon, authenticated;
