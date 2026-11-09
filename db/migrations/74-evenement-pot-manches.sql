-- 74-evenement-pot-manches.sql (a executer une fois dans Supabase, apres 73 ; peut etre relance)
-- Un evenement de vote peut partir a un nombre de votes (seuil_votes), sans date de fin (fin lointaine) :
-- des que la manche en cours atteint seuil_votes votes, la faction la plus votee de la manche part
-- (depart, option_envoyee). A son arrivee (depart + trajet), le jet se fait avec sa chance :
--   - reussite : l'evenement est resolu, le pot est partage a parts egales entre tous les joueurs qui
--     ont vote (au moins une fois), en gold (joueurs.monnaie) ;
--   - echec : le pot perd perte_echec, une nouvelle manche de vote commence (les votes repartent de 0) ;
--     un pot vide termine l'evenement (echoue).
-- Chaque envoi coute cout_envoi au pot. Le pot et ses couts (evenements_pots) et les chances des options
-- (evenements_options.chance) ne sont lisibles que par l'admin : les joueurs n'en voient rien, meme en
-- interrogeant la base. Les chances cachees le sont aussi pour l'admin sur le site (il voit la page des
-- joueurs). Chaque tentative est gardee (evenements_tentatives).

alter table public.evenements
  add column if not exists seuil_votes integer check (seuil_votes > 0),
  add column if not exists manche integer not null default 1,
  add column if not exists depart timestamptz,
  add column if not exists option_envoyee bigint references public.evenements_options(id) on delete set null;
alter table public.evenements_participations
  add column if not exists manche integer not null default 1,
  add column if not exists gain integer;

create table if not exists public.evenements_pots (
  evenement_id bigint primary key references public.evenements(id) on delete cascade,
  pot integer not null default 0 check (pot >= 0),
  cout_envoi integer not null default 0 check (cout_envoi >= 0),
  perte_echec integer not null default 0 check (perte_echec >= 0)
);
alter table public.evenements_pots enable row level security;
revoke all on public.evenements_pots from public, anon, authenticated;
grant select, insert, update, delete on public.evenements_pots to authenticated;
drop policy if exists evenements_pots_admin on public.evenements_pots;
create policy evenements_pots_admin on public.evenements_pots for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table if not exists public.evenements_tentatives (
  id bigserial primary key,
  evenement_id bigint not null references public.evenements(id) on delete cascade,
  manche integer not null,
  option_id bigint references public.evenements_options(id) on delete set null,
  reussi boolean not null,
  tirage integer not null,
  cree_le timestamptz not null default now()
);
alter table public.evenements_tentatives enable row level security;
revoke all on public.evenements_tentatives from public, anon, authenticated;

-- Les chances des options : plus lisibles directement par les joueurs (seulement par evenements_liste,
-- qui les montre si l'evenement le permet).
revoke select on public.evenements_options from anon, authenticated;
grant select (id, evenement_id, libelle, collection_id, image_path, ordre, vitesse) on public.evenements_options to anon, authenticated;

-- L'option envoyee : la plus votee de la manche en cours, a egalite la plus forte chance, puis la premiere.
create or replace function public.evenement_option_gagnante(p_id bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select o.id from public.evenements_options o
  join public.evenements e on e.id = o.evenement_id
  left join public.evenements_participations p on p.option_id = o.id and p.manche = e.manche
  where o.evenement_id = p_id
  group by o.id, o.chance, o.ordre
  order by count(p.joueur_id) desc, o.chance desc, o.ordre, o.id
  limit 1;
$$;

-- L'arrivee de la faction : au seuil de votes, son depart plus son trajet (null tant qu'elle n'est pas
-- partie) ; sinon la fin du vote plus son trajet.
create or replace function public.evenement_arrivee(p_id bigint)
returns timestamptz language sql stable security definer set search_path = public as $$
  select case when e.seuil_votes is not null then
      e.depart + coalesce(public.evenement_trajet_heures(e.option_envoyee), 0) * interval '1 hour'
    else
      e.fin + coalesce(public.evenement_trajet_heures(public.evenement_option_gagnante(e.id)), 0) * interval '1 hour'
    end
  from public.evenements e where e.id = p_id;
$$;

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
    insert into public.evenements_participations (evenement_id, joueur_id, carte_id) values (p_id, auth.uid(), p_carte)
    on conflict (evenement_id, joueur_id) do update set carte_id = excluded.carte_id, cree_le = now();
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

create or replace function public.evenements_resoudre()
returns integer language plpgsql security definer set search_path = public as $$
declare e record; ch int; jet int; nb int; ok boolean; n int := 0; reste int; part int;
begin
  for e in select * from public.evenements where statut = 'ouvert' and (
             (seuil_votes is null and fin <= now() and public.evenement_arrivee(id) <= now())
             or (seuil_votes is not null and depart is not null and public.evenement_arrivee(id) <= now()))
           order by id for update skip locked loop
    if e.seuil_votes is not null then
      -- une faction est arrivee : un jet ; reussite, le pot est partage ; echec, le pot perd, nouvelle manche
      select coalesce(o.chance, 0) into ch from public.evenements_options o where o.id = e.option_envoyee;
      ch := coalesce(ch, 0);
      jet := 1 + floor(random() * 100)::int;
      ok := jet <= ch;
      insert into public.evenements_tentatives (evenement_id, manche, option_id, reussi, tirage)
      values (e.id, e.manche, e.option_envoyee, ok, jet);
      if ok then
        select count(*) into nb from public.evenements_participations where evenement_id = e.id;
        select coalesce(pot, 0) into reste from public.evenements_pots where evenement_id = e.id;
        part := case when nb > 0 then floor(coalesce(reste, 0) / nb)::int else 0 end;
        update public.evenements set statut = 'resolu', reussi = true, chance_finale = ch, tirage = jet,
          option_gagnante = e.option_envoyee, resolu_le = now() where id = e.id;
        update public.evenements_participations set gain = part,
          recompense = case when e.recompense_variante_id is not null then (random() * 100 < e.recompense_pct) else false end
        where evenement_id = e.id;
        update public.joueurs j set monnaie = coalesce(j.monnaie, 0) + part
        from public.evenements_participations p where p.evenement_id = e.id and p.joueur_id = j.id and part > 0;
        if e.recompense_variante_id is not null then
          insert into public.collection_joueur (joueur_id, variante_id, quantite)
          select joueur_id, e.recompense_variante_id, 1 from public.evenements_participations where evenement_id = e.id and recompense
          on conflict (joueur_id, variante_id) do update set quantite = public.collection_joueur.quantite + 1;
        end if;
        n := n + 1;
      else
        update public.evenements_pots set pot = greatest(0, pot - perte_echec) where evenement_id = e.id returning pot into reste;
        if coalesce(reste, 0) <= 0 then
          update public.evenements set statut = 'resolu', reussi = false, chance_finale = ch, tirage = jet,
            option_gagnante = e.option_envoyee, resolu_le = now() where id = e.id;
          update public.evenements_participations set recompense = false, gain = 0 where evenement_id = e.id;
          n := n + 1;
        else
          update public.evenements set manche = manche + 1, depart = null, option_envoyee = null where id = e.id;
        end if;
      end if;
      continue;
    end if;
    ch := coalesce(public.evenement_chance(e.id), 0);
    select count(*) into nb from public.evenements_participations where evenement_id = e.id;
    jet := 1 + floor(random() * 100)::int; -- 1..100 : reussite si jet <= chance
    ok := nb > 0 and jet <= ch;
    update public.evenements set statut = 'resolu', reussi = ok, chance_finale = ch, tirage = jet,
      option_gagnante = case when e.type = 'vote' then public.evenement_option_gagnante(e.id) end, resolu_le = now()
    where id = e.id;
    if ok and e.recompense_variante_id is not null then
      update public.evenements_participations set recompense = (random() * 100 < e.recompense_pct) where evenement_id = e.id;
      insert into public.collection_joueur (joueur_id, variante_id, quantite)
      select joueur_id, e.recompense_variante_id, 1 from public.evenements_participations where evenement_id = e.id and recompense
      on conflict (joueur_id, variante_id) do update set quantite = public.collection_joueur.quantite + 1;
    else
      update public.evenements_participations set recompense = false where evenement_id = e.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Admin : termine un evenement tout de suite. Au seuil de votes : la faction en route arrive tout de
-- suite (sans faction en route, rien ne se passe).
create or replace function public.evenement_terminer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'INTERDIT'; end if;
  update public.evenements
  set depart = now() - coalesce(public.evenement_trajet_heures(option_envoyee), 0) * interval '1 hour'
  where id = p_id and statut = 'ouvert' and seuil_votes is not null and depart is not null;
  update public.evenements
  set fin = now() - coalesce(public.evenement_trajet_heures(public.evenement_option_gagnante(p_id)), 0) * interval '1 hour'
  where id = p_id and statut = 'ouvert' and seuil_votes is null;
  perform public.evenements_resoudre();
end $$;

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
      'arrivee', case when e.eclair_x is not null then public.evenement_arrivee(e.id) end,
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
          'vitesse', o.vitesse,
          'trajet_heures', public.evenement_trajet_heures(o.id),
          'voix', (select count(*) from public.evenements_participations p where p.option_id = o.id and p.manche = e.manche)) order by o.ordre, o.id)
        from public.evenements_options o where o.evenement_id = e.id), '[]')
    ) as item
    from public.evenements e
    left join public.evenements_participations mp on mp.evenement_id = e.id and mp.joueur_id = auth.uid()
  ) x;
$function$;
