-- 88-defense-par-vagues.sql — Forest Card
-- Defense par vagues : un evenement de defense peut avoir une taille de vague (evenements.vague). Des que la vague en
-- cours compte `vague` combattants places, un jet est lance avec la chance de CETTE vague (ses combattants seulement) :
--   - reussi : l'attaque est repoussee, l'evenement est resolu (reussi) ;
--   - rate : les defenseurs de la vague tombent, une nouvelle vague commence (manche + 1, la chance repart de la base) ;
--     chaque joueur peut y placer de nouveau un combattant (un par vague).
-- A la fin de l'evenement, une vague incomplete tente sa chance une derniere fois ; sinon (ou si elle echoue),
-- l'attaquant l'emporte (resolu, rate). Chaque vague est gardee (evenements_tentatives : chance, jet, defenseurs).
-- Sans taille de vague : la defense classique (un seul jet a la fin, tous les combattants places).
-- A lancer une fois dans Supabase (SQL Editor), apres 87-forge-cartes-existantes.sql ; peut etre relance.

alter table public.evenements add column if not exists vague integer check (vague > 0);
alter table public.evenements_tentatives
  add column if not exists chance integer,
  add column if not exists defenseurs jsonb;

-- La chance d'une defense : ses combattants places (par vagues : ceux de la vague en cours seulement).
create or replace function public.evenement_chance(p_id bigint)
returns integer language sql stable security definer set search_path = public as $$
  select case e.type
    when 'defense' then greatest(0, least(100,
      e.base_pct
      + e.cle_pct * (select count(distinct p.carte_id) from public.evenements_participations p
          join public.evenements_combattants k on k.evenement_id = e.id and k.carte_id = p.carte_id and k.role = 'cle'
          where p.evenement_id = e.id and (e.vague is null or p.manche = e.manche))
      + e.autre_pct * (select count(*) from public.evenements_participations p
          where p.evenement_id = e.id and p.carte_id is not null and (e.vague is null or p.manche = e.manche)
            and not exists (select 1 from public.evenements_combattants k where k.evenement_id = e.id and k.carte_id = p.carte_id))
      - e.nuisible_pct * (select count(*) from public.evenements_participations p
          join public.evenements_combattants k on k.evenement_id = e.id and k.carte_id = p.carte_id and k.role = 'nuisible'
          where p.evenement_id = e.id and (e.vague is null or p.manche = e.manche))))
    else coalesce((select o.chance from public.evenements_options o where o.id = public.evenement_option_gagnante(e.id)), 0)
  end
  from public.evenements e where e.id = p_id;
$$;

-- Le jet d'une vague (evenement verrouille par l'appelant). p_finale : la fin de l'evenement (un echec le termine).
-- Rend true si la vague repousse l'attaque.
create or replace function public.defense_vague(p_id bigint, p_finale boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare e public.evenements; ch int; jet int; ok boolean; defs jsonb;
begin
  select * into e from public.evenements where id = p_id;
  ch := coalesce(public.evenement_chance(p_id), 0);
  select coalesce(jsonb_agg(jsonb_build_object('pseudo', j.pseudo, 'nom', c.nom,
      'role', (select k.role from public.evenements_combattants k where k.evenement_id = p_id and k.carte_id = p.carte_id))
      order by p.cree_le), '[]')
  into defs
  from public.evenements_participations p join public.joueurs j on j.id = p.joueur_id join public.cartes c on c.id = p.carte_id
  where p.evenement_id = p_id and p.manche = e.manche and p.carte_id is not null;
  jet := 1 + floor(random() * 100)::int;
  ok := jsonb_array_length(defs) > 0 and jet <= ch;
  insert into public.evenements_tentatives (evenement_id, manche, reussi, tirage, chance, defenseurs)
  values (p_id, e.manche, ok, jet, ch, defs);
  if ok then
    update public.evenements set statut = 'resolu', reussi = true, chance_finale = ch, tirage = jet, resolu_le = now()
    where id = p_id;
  elsif p_finale then
    update public.evenements set statut = 'resolu', reussi = false, chance_finale = ch, tirage = jet, resolu_le = now()
    where id = p_id;
  else
    update public.evenements set manche = manche + 1 where id = p_id;
  end if;
  return ok;
end $$;
revoke all on function public.defense_vague(bigint, boolean) from public, anon, authenticated;

create or replace function public.participer_evenement(p_id bigint, p_carte integer, p_option bigint)
returns void language plpgsql security definer set search_path = public as $$
declare e public.evenements; nb int;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour participer.'; end if;
  select * into e from public.evenements where id = p_id for update;
  if e.id is null then raise exception 'Événement inconnu.'; end if;
  if e.statut <> 'ouvert' or e.fin <= now() then raise exception 'L''événement est terminé.'; end if;
  if e.type = 'defense' then
    if not exists (select 1 from public.collection_joueur cj join public.variantes_carte v on v.id = cj.variante_id
                   join public.cartes c on c.id = v.carte_id
                   where cj.joueur_id = auth.uid() and cj.quantite > 0 and c.id = p_carte and c.type = 'combattant') then
      raise exception 'Choisis un combattant de ta collection.';
    end if;
    insert into public.evenements_participations (evenement_id, joueur_id, carte_id, manche) values (p_id, auth.uid(), p_carte, e.manche)
    on conflict (evenement_id, joueur_id) do update set carte_id = excluded.carte_id, manche = excluded.manche, cree_le = now();
    if e.vague is not null then
      select count(*) into nb from public.evenements_participations
      where evenement_id = p_id and manche = e.manche and carte_id is not null;
      if nb >= e.vague then perform public.defense_vague(p_id, false); end if;
    end if;
  else
    if e.depart is not null then raise exception 'Une faction est déjà en route : attends son retour.'; end if;
    if not exists (select 1 from public.evenements_options o where o.id = p_option and o.evenement_id = p_id) then
      raise exception 'Option inconnue.';
    end if;
    insert into public.evenements_participations (evenement_id, joueur_id, option_id, manche)
    values (p_id, auth.uid(), p_option, e.manche)
    on conflict (evenement_id, joueur_id) do update set option_id = excluded.option_id, manche = excluded.manche, cree_le = now();
    if e.seuil_votes is not null then
      select count(*) into nb from public.evenements_participations
      where evenement_id = p_id and manche = e.manche and option_id is not null;
      if nb >= e.seuil_votes then
        update public.evenements set depart = now(), option_envoyee = public.evenement_option_gagnante(p_id) where id = p_id;
        update public.evenements_pots set pot = greatest(0, pot - cout_envoi) where evenement_id = p_id;
      end if;
    end if;
  end if;
end $$;

-- A la fin d'une defense par vagues : la vague en cours tente sa chance une derniere fois (sans defenseur : l'attaquant
-- l'emporte), avant la resolution des autres evenements.
create or replace function public.defenses_vagues_resoudre()
returns integer language plpgsql security definer set search_path = public as $$
declare e record; n int := 0;
begin
  for e in select id from public.evenements where type = 'defense' and vague is not null and statut = 'ouvert' and fin <= now()
           order by id for update skip locked loop
    perform public.defense_vague(e.id, true);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.defenses_vagues_resoudre() from public, anon, authenticated;

create or replace function public.evenements_resoudre()
returns integer language plpgsql security definer set search_path = public as $$
begin
  return public.contestations_resoudre() + public.boss_resoudre() + public.defenses_vagues_resoudre()
    + public.evenements_resoudre_base();
end $$;

-- La liste des evenements : la taille de vague, la chance et les defenseurs de chaque vague jouee (tentatives), et,
-- par vagues, les defenseurs et ma carte de la vague en cours seulement (un role reste cache jusqu'a la fin).
create or replace function public.evenements_liste()
returns jsonb language sql stable security definer set search_path = public as $function$
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
      'eclair_evenement_id', e.eclair_evenement_id, 'defenseur_collection', e.defenseur_collection,
      'defenseur_nom', public.contestation_nom(e.defenseur_collection),
      'collections_engagees', to_jsonb(e.collections_engagees),
      'decompte_debut', e.decompte_debut, 'decompte_fin', e.decompte_fin,
      'gagnant_collection', e.gagnant_collection, 'gagnant_nom', public.contestation_nom(e.gagnant_collection),
      'points', coalesce((
        select jsonb_agg(jsonb_build_object('collection', pt.collection, 'nom', public.contestation_nom(pt.collection),
          'points', pt.points) order by pt.points desc, pt.collection)
        from public.evenements_points pt where pt.evenement_id = e.id), '[]'),
      'seuil_votes', e.seuil_votes, 'vague', e.vague,
      'boss_bonus_pct', e.boss_bonus_pct, 'boss_essais_jour', e.boss_essais_jour,
      'boss_atq', case when e.type = 'boss' then public.boss_stat(e.id, 'atq') end,
      'boss_pv', case when e.type = 'boss' then public.boss_stat(e.id, 'pv') end,
      'boss_essais', (select count(*) from public.evenements_boss_essais b where b.evenement_id = e.id),
      'boss_victoires', (select count(*) from public.evenements_boss_essais b where b.evenement_id = e.id and b.gagne),
      'mes_essais_jour', (select count(*) from public.evenements_boss_essais b
                          where b.evenement_id = e.id and b.joueur_id = auth.uid() and b.cree_le >= public.boss_debut_jour()),
      'manche', e.manche, 'depart', e.depart, 'option_envoyee', e.option_envoyee,
      'votes_manche', (select count(*) from public.evenements_participations p
                       where p.evenement_id = e.id and p.manche = e.manche and p.option_id is not null),
      'pot', case when public.is_admin() then (select t.pot from public.evenements_pots t where t.evenement_id = e.id) end,
      'mon_gain', mp.gain, 'ma_manche', mp.manche,
      'tentatives', coalesce((
        select jsonb_agg(jsonb_build_object('manche', t.manche, 'option_id', t.option_id, 'reussi', t.reussi,
          'tirage', t.tirage, 'le', t.cree_le, 'chance', t.chance,
          'defenseurs', case when t.defenseurs is null then null
            when e.montrer_cles or e.statut = 'resolu' or public.is_admin() then t.defenseurs
            else (select jsonb_agg(d - 'role') from jsonb_array_elements(t.defenseurs) d) end) order by t.manche)
        from public.evenements_tentatives t where t.evenement_id = e.id), '[]'),
      'base_pct', e.base_pct, 'cle_pct', e.cle_pct, 'autre_pct', e.autre_pct, 'nuisible_pct', e.nuisible_pct,
      'montrer_cles', e.montrer_cles,
      'chance', case when e.montrer_chances or e.statut = 'resolu' then public.evenement_chance(e.id) end,
      'montrer_chances', e.montrer_chances,
      'participants', (select count(*) from public.evenements_participations p where p.evenement_id = e.id),
      'ma_carte', case when e.vague is null or mp.manche = e.manche then mp.carte_id end,
      'mon_option', mp.option_id, 'ma_recompense', mp.recompense, 'vu', coalesce(mp.vu, false),
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
          where p.evenement_id = e.id and p.carte_id is not null and (e.vague is null or p.manche = e.manche)
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

-- L'attaque de Drag'Orage sur la Foret Enchantee (evenement 12) se joue par vagues de 5.
update public.evenements set vague = 5 where id = 12 and type = 'defense';
