-- 73-evenement-chances-cachees.sql (a executer une fois dans Supabase, apres 72 ; peut etre relance)
-- Un evenement peut cacher ses chances aux joueurs (montrer_chances = false) : evenements_liste ne
-- renvoie la chance de l'evenement et celles des options qu'a l'admin, ou une fois l'evenement resolu.

alter table public.evenements add column if not exists montrer_chances boolean not null default true;

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
      'chance', case when e.montrer_chances or e.statut = 'resolu' or public.is_admin() then public.evenement_chance(e.id) end,
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
          'chance', case when e.montrer_chances or e.statut = 'resolu' or public.is_admin() then o.chance end,
          'vitesse', o.vitesse,
          'trajet_heures', public.evenement_trajet_heures(o.id),
          'voix', (select count(*) from public.evenements_participations p where p.option_id = o.id)) order by o.ordre, o.id)
        from public.evenements_options o where o.evenement_id = e.id), '[]')
    ) as item
    from public.evenements e
    left join public.evenements_participations mp on mp.evenement_id = e.id and mp.joueur_id = auth.uid()
  ) x;
$function$;
