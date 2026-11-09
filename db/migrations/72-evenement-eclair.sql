-- 72-evenement-eclair.sql (a executer une fois dans Supabase, apres 71 ; peut etre relance)
-- Un evenement de vote peut avoir un eclair : un point de la carte du lore (eclair_x, eclair_y, en %
-- de la carte, souvent dans le brouillard) ou l'eclair est tombe. Les joueurs votent pour la faction
-- (une option, en general une collection) a envoyer voir ce qui s'y passe. A la fin du vote, la
-- faction la plus votee part de son lieu (le lieu de sa collection sur la carte, le centre sinon) et
-- met trajet = distance / vitesse heures pour arriver (distance en % de la carte : a vitesse 10, une
-- traversee de la moitie de la carte prend 5 h). Le jet de reussite (la chance de la faction) se fait
-- a son arrivee.

alter table public.evenements
  add column if not exists eclair_x numeric check (eclair_x between 0 and 100),
  add column if not exists eclair_y numeric check (eclair_y between 0 and 100);
alter table public.evenements_options
  add column if not exists vitesse integer not null default 10 check (vitesse between 1 and 100);

-- Le trajet d'une option jusqu'a l'eclair, en heures (null sans eclair).
create or replace function public.evenement_trajet_heures(p_option bigint)
returns numeric language sql stable security definer set search_path = public as $$
  select round((sqrt(power(e.eclair_x - coalesce(l.x, 50), 2) + power(e.eclair_y - coalesce(l.y, 50), 2))
    / greatest(1, o.vitesse))::numeric, 2)
  from public.evenements_options o
  join public.evenements e on e.id = o.evenement_id
  left join lateral (select l.x, l.y from public.lore_lieux l
                     where o.collection_id is not null and l.collection_id = o.collection_id
                     order by l.id limit 1) l on true
  where o.id = p_option and e.eclair_x is not null and e.eclair_y is not null;
$$;

-- L'arrivee de la faction envoyee : la fin du vote plus son trajet (la fin du vote sans eclair).
create or replace function public.evenement_arrivee(p_id bigint)
returns timestamptz language sql stable security definer set search_path = public as $$
  select e.fin + coalesce(public.evenement_trajet_heures(public.evenement_option_gagnante(e.id)), 0) * interval '1 hour'
  from public.evenements e where e.id = p_id;
$$;

-- Resout les evenements dont le temps est fini (pour un eclair : la faction est arrivee).
create or replace function public.evenements_resoudre()
returns integer language plpgsql security definer set search_path = public as $$
declare e record; ch int; jet int; nb int; ok boolean; n int := 0;
begin
  for e in select * from public.evenements where statut = 'ouvert' and fin <= now()
             and public.evenement_arrivee(id) <= now() order by id for update skip locked loop
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

-- Admin : termine un evenement tout de suite (pour un eclair : la faction arrive tout de suite ; sa fin
-- est avancee de la duree du trajet).
create or replace function public.evenement_terminer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'INTERDIT'; end if;
  update public.evenements
  set fin = now() - coalesce(public.evenement_trajet_heures(public.evenement_option_gagnante(p_id)), 0) * interval '1 hour'
  where id = p_id and statut = 'ouvert';
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
      'base_pct', e.base_pct, 'cle_pct', e.cle_pct, 'autre_pct', e.autre_pct, 'nuisible_pct', e.nuisible_pct,
      'montrer_cles', e.montrer_cles,
      'chance', public.evenement_chance(e.id),
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
          'image_path', o.image_path, 'chance', o.chance, 'vitesse', o.vitesse,
          'trajet_heures', public.evenement_trajet_heures(o.id),
          'voix', (select count(*) from public.evenements_participations p where p.option_id = o.id)) order by o.ordre, o.id)
        from public.evenements_options o where o.evenement_id = e.id), '[]')
    ) as item
    from public.evenements e
    left join public.evenements_participations mp on mp.evenement_id = e.id and mp.joueur_id = auth.uid()
  ) x;
$function$;

revoke all on function public.evenement_trajet_heures(bigint), public.evenement_arrivee(bigint) from public;
grant execute on function public.evenement_trajet_heures(bigint), public.evenement_arrivee(bigint) to anon, authenticated;
