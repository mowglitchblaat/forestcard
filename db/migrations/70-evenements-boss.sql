-- 70-evenements-boss.sql (a executer une fois dans Supabase, apres 69)
-- Un evenement peut avoir une carte qui attaque (le boss, une version precise) et un lieu attaque
-- (un lieu de la carte du monde). Le site affiche alors une scene : le boss en grand sur la carte du
-- lore zoomee sur le lieu, les combattants places par les joueurs en ligne de defense, et a la fin
-- l'affrontement (le boss se brise si la defense reussit, les defenseurs tombent sinon).
-- evenements_liste renvoie en plus le boss, le lieu (seulement s'il est revele, sauf pour l'admin)
-- et les defenseurs (pseudo, image de leur combattant ; le role cle / nuisible seulement quand les
-- cles sont visibles).

alter table public.evenements
  add column if not exists attaquant_variante_id integer references public.variantes_carte(id) on delete set null,
  add column if not exists lieu_id bigint references public.lore_lieux(id) on delete set null;

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
          'image_path', o.image_path, 'chance', o.chance,
          'voix', (select count(*) from public.evenements_participations p where p.option_id = o.id)) order by o.ordre, o.id)
        from public.evenements_options o where o.evenement_id = e.id), '[]')
    ) as item
    from public.evenements e
    left join public.evenements_participations mp on mp.evenement_id = e.id and mp.joueur_id = auth.uid()
  ) x;
$function$;
