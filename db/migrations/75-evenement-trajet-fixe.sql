-- 75-evenement-trajet-fixe.sql (a executer une fois dans Supabase, apres 74 ; peut etre relance)
-- Une option peut avoir un trajet fixe en minutes (trajet_minutes, ex. une faction qui se teleporte),
-- a la place de distance / vitesse.

alter table public.evenements_options add column if not exists trajet_minutes integer check (trajet_minutes >= 0);

create or replace function public.evenement_trajet_heures(p_option bigint)
returns numeric language sql stable security definer set search_path = public as $$
  select round(coalesce(o.trajet_minutes / 60.0,
    sqrt(power(e.eclair_x - coalesce(l.x, 50), 2) + power(e.eclair_y - coalesce(l.y, 50), 2)) / greatest(1, o.vitesse))::numeric, 2)
  from public.evenements_options o
  join public.evenements e on e.id = o.evenement_id
  left join lateral (select l.x, l.y from public.lore_lieux l
                     where o.collection_id is not null and l.collection_id = o.collection_id
                     order by l.id limit 1) l on true
  where o.id = p_option and e.eclair_x is not null and e.eclair_y is not null;
$$;

grant select (trajet_minutes) on public.evenements_options to anon, authenticated;

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
          'vitesse', o.vitesse, 'trajet_minutes', o.trajet_minutes,
          'trajet_heures', public.evenement_trajet_heures(o.id),
          'voix', (select count(*) from public.evenements_participations p where p.option_id = o.id and p.manche = e.manche)) order by o.ordre, o.id)
        from public.evenements_options o where o.evenement_id = e.id), '[]')
    ) as item
    from public.evenements e
    left join public.evenements_participations mp on mp.evenement_id = e.id and mp.joueur_id = auth.uid()
  ) x;
$function$;
