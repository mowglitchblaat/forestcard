-- 76-evenement-contestation.sql (a executer une fois dans Supabase, apres 75 ; peut etre relance)
-- Un evenement de contestation : les joueurs votent pour contester ou non la collection qui detient un
-- eclair (eclair_evenement_id, l'evenement eclair ; defenseur_collection, sa collection). Les options :
--   - role 'non' : on ne conteste pas ;
--   - une collection (collection_id ; sans collection = Basique) : on conteste avec elle ;
--   - role 'toutes' : toutes les collections sorties (au moins une carte active) contestent, Basique comprise.
-- A la fin du vote (fin), sans plus de oui que de non : la collection garde l'eclair (statut resolu,
-- reussi = false). Sinon, la collection (ou « toutes ») la plus votee parmi les oui est engagee avec la
-- collection qui defend, et le decompte commence (statut 'decompte', decompte_debut = fin) : chaque
-- victoire en combat normal (modes quotidien et payant : pas les ceintures ni les tournois) dont le
-- combattant gagnant est d'une collection engagee lui rapporte 1 point (evenements_points). La fin du
-- decompte (decompte_fin) est reglee par l'admin ; a cette date, la collection qui a le plus de points
-- s'empare de l'eclair (gagnant_collection ; egalite : la collection qui defend la garde si elle est
-- en tete, sinon la plus petite cle). Cle d'une collection : son id, 0 pour Basique.
-- Le decompte se fait par un declencheur sur historique_combats (l'historique est elague a 10 combats
-- par joueur : on ne peut pas recompter apres coup).

alter table public.evenements drop constraint if exists evenements_type_check;
alter table public.evenements add constraint evenements_type_check check (type in ('defense', 'vote', 'contestation'));
alter table public.evenements drop constraint if exists evenements_statut_check;
alter table public.evenements add constraint evenements_statut_check check (statut in ('ouvert', 'decompte', 'resolu'));
alter table public.evenements
  add column if not exists eclair_evenement_id bigint references public.evenements(id) on delete set null,
  add column if not exists defenseur_collection integer,
  add column if not exists collections_engagees integer[],
  add column if not exists decompte_debut timestamptz,
  add column if not exists decompte_fin timestamptz,
  add column if not exists gagnant_collection integer;
alter table public.evenements_options add column if not exists role text check (role in ('non', 'toutes'));
grant select (role) on public.evenements_options to anon, authenticated;

create table if not exists public.evenements_points (
  evenement_id bigint not null references public.evenements(id) on delete cascade,
  collection integer not null,
  points integer not null default 0,
  primary key (evenement_id, collection)
);
alter table public.evenements_points enable row level security;
revoke all on public.evenements_points from public, anon, authenticated;

-- Le nom d'une cle de collection (0 = Basique).
create or replace function public.contestation_nom(p_collection integer)
returns text language sql stable security definer set search_path = public as $$
  select case when p_collection is null then null when p_collection = 0 then 'Basique'
    else (select c.nom from public.collections c where c.id = p_collection) end;
$$;

-- Fin des votes de contestation (debut du decompte, ou l'eclair reste) et fin des decomptes.
create or replace function public.contestations_resoudre()
returns integer language plpgsql security definer set search_path = public as $$
declare e record; nb_non int; nb_oui int; ch record; engagees int[]; gagnant int; n int := 0;
begin
  for e in select * from public.evenements where type = 'contestation' and statut = 'ouvert' and fin <= now()
           order by id for update skip locked loop
    select count(*) filter (where o.role = 'non'), count(*) filter (where o.role is distinct from 'non')
    into nb_non, nb_oui
    from public.evenements_participations p join public.evenements_options o on o.id = p.option_id
    where p.evenement_id = e.id;
    if nb_oui > nb_non then
      select o.id, o.role, o.collection_id into ch
      from public.evenements_options o
      left join public.evenements_participations p on p.option_id = o.id
      where o.evenement_id = e.id and o.role is distinct from 'non'
      group by o.id, o.role, o.collection_id, o.ordre
      order by count(p.joueur_id) desc, o.ordre, o.id
      limit 1;
      if ch.role = 'toutes' then
        -- les collections sorties seulement (au moins une carte active) : pas de nom secret au tableau
        select array_agg(c.id order by c.id) || 0 into engagees from public.collections c
        where exists (select 1 from public.cartes ca where ca.collection_id = c.id and ca.actif);
      else
        engagees := array[coalesce(ch.collection_id, 0)];
      end if;
      if e.defenseur_collection is not null and not (e.defenseur_collection = any(engagees)) then
        engagees := e.defenseur_collection || engagees;
      end if;
      update public.evenements set statut = 'decompte', option_gagnante = ch.id, collections_engagees = engagees,
        decompte_debut = e.fin where id = e.id;
      insert into public.evenements_points (evenement_id, collection, points)
      select e.id, k, 0 from unnest(engagees) k on conflict do nothing;
    else
      update public.evenements set statut = 'resolu', reussi = false, resolu_le = now(),
        option_gagnante = (select o.id from public.evenements_options o where o.evenement_id = e.id and o.role = 'non' order by o.id limit 1),
        gagnant_collection = e.defenseur_collection
      where id = e.id;
    end if;
    n := n + 1;
  end loop;
  for e in select * from public.evenements where type = 'contestation' and statut = 'decompte'
             and decompte_fin is not null and decompte_fin <= now()
           order by id for update skip locked loop
    select pt.collection into gagnant from public.evenements_points pt
    where pt.evenement_id = e.id
    order by pt.points desc, (pt.collection = e.defenseur_collection) desc, pt.collection
    limit 1;
    gagnant := coalesce(gagnant, e.defenseur_collection);
    update public.evenements set statut = 'resolu', reussi = gagnant is distinct from e.defenseur_collection,
      gagnant_collection = gagnant, resolu_le = now() where id = e.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.contestations_resoudre() from public, anon;
grant execute on function public.contestations_resoudre() to authenticated;

-- La resolution des evenements : les contestations d'abord (elles quittent le statut ouvert avant que
-- la resolution des autres evenements, renommee evenements_resoudre_base, ne les voie).
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'evenements_resoudre_base' and pronamespace = 'public'::regnamespace) then
    alter function public.evenements_resoudre() rename to evenements_resoudre_base;
  end if;
end $$;
revoke all on function public.evenements_resoudre_base() from public, anon, authenticated;

create or replace function public.evenements_resoudre()
returns integer language plpgsql security definer set search_path = public as $$
begin
  return public.contestations_resoudre() + public.evenements_resoudre_base();
end $$;
revoke all on function public.evenements_resoudre() from public, anon;
grant execute on function public.evenements_resoudre() to authenticated;

-- Admin : termine un evenement tout de suite ; une contestation en decompte finit son decompte.
create or replace function public.evenement_terminer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'INTERDIT'; end if;
  update public.evenements set decompte_fin = now() where id = p_id and statut = 'decompte';
  update public.evenements set fin = now() where id = p_id and statut = 'ouvert' and type = 'contestation';
  update public.evenements
  set depart = now() - coalesce(public.evenement_trajet_heures(option_envoyee), 0) * interval '1 hour'
  where id = p_id and statut = 'ouvert' and seuil_votes is not null and depart is not null;
  update public.evenements
  set fin = now() - coalesce(public.evenement_trajet_heures(public.evenement_option_gagnante(p_id)), 0) * interval '1 hour'
  where id = p_id and statut = 'ouvert' and seuil_votes is null and type <> 'contestation';
  perform public.evenements_resoudre();
end $$;

-- Apres chaque combat : 1 point a la collection du combattant gagnant, si elle est engagee dans une
-- contestation en cours (combats normaux seulement ; gagnant 0 = carte_a, 1 = carte_b). Jamais bloquant.
create or replace function public.contestation_apres_combat()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nom text; k int; quand timestamptz := coalesce(new.cree_le, now());
begin
  begin
    perform public.contestations_resoudre();
    if new.mode not in ('quotidien', 'payant') or new.gagnant is null or new.gagnant::text not in ('0', '1') then
      return null;
    end if;
    v_nom := case when new.gagnant::text = '0' then new.carte_a else new.carte_b end;
    select coalesce(c.collection_id, 0) into k from public.cartes c where c.nom = v_nom order by c.id limit 1;
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
drop trigger if exists contestation_points on public.historique_combats;
create trigger contestation_points after insert on public.historique_combats
  for each row execute function public.contestation_apres_combat();

create or replace function public.evenements_liste()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(x.item order by x.cree_le desc), '[]') from (
    select e.cree_le, jsonb_build_object(
      'id', e.id, 'type', e.type, 'titre', e.titre, 'texte', e.texte, 'image_path', e.image_path,
      'fin', e.fin, 'statut', e.statut, 'reussi', e.reussi, 'chance_finale', e.chance_finale,
      'tirage', e.tirage, 'option_gagnante', e.option_gagnante,
      'recompense_pct', e.recompense_pct, 'recompense_variante_id', e.recompense_variante_id,
      'recompense_nom', (select c.nom from public.variantes_carte v join public.cartes c on c.id = v.carte_id where v.id = e.recompense_variante_id),
      'recompense_image', (select v.image_path from public.variantes_carte v where v.id = e.recompense_variante_id),
      'attaquant_nom', (select c.nom from public.variantes_carte v join public.cartes c on c.id = v.carte_id where v.id = e.attaquant_variante_id),
      'attaquant_image', (select v.image_path from public.variantes_carte v where v.id = e.attaquant_variante_id),
      'lieu_id', (select l.id from public.lore_lieux l where l.id = e.lieu_id and (l.revele or public.is_admin())),
      'lieu_nom', (select l.nom from public.lore_lieux l where l.id = e.lieu_id and (l.revele or public.is_admin())),
      'eclair_x', e.eclair_x, 'eclair_y', e.eclair_y,
      'arrivee', case when e.eclair_x is not null then public.evenement_arrivee(e.id) end
    ) || jsonb_build_object(
      -- (deux objets : jsonb_build_object prend au plus 100 arguments)
      'eclair_evenement_id', e.eclair_evenement_id, 'defenseur_collection', e.defenseur_collection,
      'defenseur_nom', public.contestation_nom(e.defenseur_collection),
      'collections_engagees', to_jsonb(e.collections_engagees),
      'decompte_debut', e.decompte_debut, 'decompte_fin', e.decompte_fin,
      'gagnant_collection', e.gagnant_collection, 'gagnant_nom', public.contestation_nom(e.gagnant_collection),
      'points', coalesce((
        select jsonb_agg(jsonb_build_object('collection', pt.collection, 'nom', public.contestation_nom(pt.collection),
          'points', pt.points) order by pt.points desc, pt.collection)
        from public.evenements_points pt where pt.evenement_id = e.id), '[]'),
      'seuil_votes', e.seuil_votes, 'manche', e.manche, 'depart', e.depart, 'option_envoyee', e.option_envoyee,
      'votes_manche', (select count(*) from public.evenements_participations p
                       where p.evenement_id = e.id and p.manche = e.manche and p.option_id is not null),
      'pot', case when public.is_admin() then (select t.pot from public.evenements_pots t where t.evenement_id = e.id) end,
      'mon_gain', mp.gain, 'ma_manche', mp.manche,
      'tentatives', coalesce((
        select jsonb_agg(jsonb_build_object('manche', t.manche, 'option_id', t.option_id, 'reussi', t.reussi,
          'tirage', t.tirage, 'le', t.cree_le) order by t.manche)
        from public.evenements_tentatives t where t.evenement_id = e.id), '[]'),
      'base_pct', e.base_pct, 'cle_pct', e.cle_pct, 'autre_pct', e.autre_pct, 'nuisible_pct', e.nuisible_pct,
      'montrer_cles', e.montrer_cles,
      'chance', case when e.montrer_chances or e.statut = 'resolu' then public.evenement_chance(e.id) end,
      'montrer_chances', e.montrer_chances,
      'participants', (select count(*) from public.evenements_participations p where p.evenement_id = e.id),
      'ma_carte', mp.carte_id, 'mon_option', mp.option_id, 'ma_recompense', mp.recompense, 'vu', coalesce(mp.vu, false),
      'combattants', case when e.montrer_cles or e.statut = 'resolu' or public.is_admin() then coalesce((
        select jsonb_agg(jsonb_build_object('carte_id', k.carte_id, 'role', k.role, 'nom', c.nom))
        from public.evenements_combattants k join public.cartes c on c.id = k.carte_id where k.evenement_id = e.id), '[]') else '[]' end,
      'defenseurs', case when e.type = 'defense' then coalesce((
        select jsonb_agg(d.item order by d.cree_le) from (
          select p.cree_le, jsonb_build_object(
            'pseudo', j.pseudo,
            'nom', c.nom,
            'image_path', (select v.image_path from public.variantes_carte v
                           where v.carte_id = p.carte_id and v.image_path is not null order by v.id limit 1),
            'role', case when e.montrer_cles or e.statut = 'resolu' or public.is_admin() then
              (select k.role from public.evenements_combattants k where k.evenement_id = e.id and k.carte_id = p.carte_id)
              else null end
          ) as item
          from public.evenements_participations p
          join public.joueurs j on j.id = p.joueur_id
          join public.cartes c on c.id = p.carte_id
          where p.evenement_id = e.id and p.carte_id is not null
          order by p.cree_le
          limit 40
        ) d), '[]') else '[]' end,
      'options', coalesce((
        select jsonb_agg(jsonb_build_object('id', o.id, 'libelle', o.libelle, 'collection_id', o.collection_id,
          'image_path', o.image_path,
          'chance', case when e.montrer_chances or e.statut = 'resolu' then o.chance end,
          'vitesse', o.vitesse, 'trajet_minutes', o.trajet_minutes, 'role', o.role,
          'trajet_heures', public.evenement_trajet_heures(o.id),
          'voix', (select count(*) from public.evenements_participations p where p.option_id = o.id and p.manche = e.manche)) order by o.ordre, o.id)
        from public.evenements_options o where o.evenement_id = e.id), '[]')
    ) as item
    from public.evenements e
    left join public.evenements_participations mp on mp.evenement_id = e.id and mp.joueur_id = auth.uid()
  ) x;
$function$;
