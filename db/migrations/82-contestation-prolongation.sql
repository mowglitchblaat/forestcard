-- 82-contestation-prolongation.sql — Forest Card
-- Contestation de l'eclair : le point va a la collection du combattant qui a REELLEMENT gagne. Apres une
-- prolongation (egalite au tour 10 : chacun tire 3 nouvelles cartes), ce n'est plus le combattant du debut
-- (carte_a / carte_b de historique_combats) : c'est le dernier combattant du camp gagnant qui a attaque apres
-- la derniere prolongation (ligne « X attaque » du deroule). Sans prolongation : carte_a / carte_b, comme avant.
-- A lancer une fois dans Supabase (SQL Editor), apres 80-tempete-et-intensite-orage.sql ; peut etre relance.
-- (Les points des combats deja comptes ne sont pas recalcules ici.)

-- Le nom du combattant gagnant d'un combat (gagnant 0 = camp a, 1 = camp b), null sans gagnant.
create or replace function public.combattant_gagnant(h public.historique_combats)
returns text language sql stable set search_path = public as $$
  select case
    when h.gagnant is null or h.gagnant::text not in ('0', '1') then null
    when not exists (select 1 from jsonb_array_elements(coalesce(h.deroule, '[]')) y where y->>'t' = 'prolongation')
      then case when h.gagnant::text = '0' then h.carte_a else h.carte_b end
    else coalesce((
      select regexp_replace(x.e->>'txt', ' attaque$', '')
      from jsonb_array_elements(h.deroule) with ordinality x(e, ord)
      where x.e->>'t' = 'attaque' and x.e->>'c' = h.gagnant::text
        and x.ord > (select max(y.ord) from jsonb_array_elements(h.deroule) with ordinality y(e, ord) where y.e->>'t' = 'prolongation')
      order by x.ord desc limit 1),
      case when h.gagnant::text = '0' then h.carte_a else h.carte_b end)
  end;
$$;

create or replace function public.contestation_apres_combat()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nom text; k int; quand timestamptz := coalesce(new.cree_le, now());
begin
  begin
    perform public.contestations_resoudre();
    if new.mode not in ('quotidien', 'payant') then return null; end if;
    v_nom := public.combattant_gagnant(new);
    if v_nom is null then return null; end if;
    select coalesce(c.collection_id, 0) into k from public.cartes c
    where c.nom = v_nom or btrim(c.nom) = btrim(v_nom) order by (c.nom = v_nom) desc, c.id limit 1;
    if k is null then return null; end if;
    insert into public.evenements_points (evenement_id, collection, points)
    select e.id, k, 1 from public.evenements e
    where e.type = 'contestation' and e.statut = 'decompte' and k = any(e.collections_engagees)
      and quand >= e.decompte_debut and (e.decompte_fin is null or quand < e.decompte_fin)
    on conflict (evenement_id, collection) do update set points = public.evenements_points.points + 1;
  exception when others then
    raise warning 'contestation_apres_combat : %', sqlerrm;
  end;
  return null;
end $$;
