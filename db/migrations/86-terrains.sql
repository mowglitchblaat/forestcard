-- 86-terrains.sql — Forest Card
-- Terrains (moteur : packages/engine/src/mechanics/terrain.ts) : au debut de chaque combat, un terrain tire au sort
-- (Orage, Essaim, ou aucun, selon des poids), et des cartes qui en invoquent un (effet ou passif `terrain`).
--   - Reglages (Admin > Reglages, lus par l'edge function) : terrain_actif (0 : pas de tirage ; les cartes invoquent
--     quand meme), poids du tirage, et les valeurs de chaque terrain. Eteint a l'installation.
--   - Le deck d'un combat porte la collection de chaque carte (collection_id) : l'Essaim favorise les Xenoptera.
-- A lancer une fois dans Supabase (SQL Editor), apres 85-boosters-de-bienvenue.sql ; peut etre relance.

insert into public.reglages_jeu (cle, valeur) values
  ('terrain_actif', '0'),
  ('terrain_poids_aucun', '2'), ('terrain_poids_orage', '1'), ('terrain_poids_essaim', '1'),
  ('terrain_orage_chance', '10'), ('terrain_orage_degats', '18'), ('terrain_orage_bonus', '10'),
  ('terrain_essaim_chance', '20'), ('terrain_essaim_niveau', '1'), ('terrain_essaim_tours', '2'),
  ('terrain_essaim_bonus', '10'), ('terrain_essaim_collection', '10')
on conflict (cle) do nothing;

create or replace function public._deck_combat(p_joueur uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'type', c.type, 'nom', c.nom, 'atq', c.atq, 'pv', c.pv,
      'passif', c.passif, 'ultime', c.ultime, 'effet', c.effet, 'collection_id', c.collection_id,
      'image', v.image_path, 'imageCombat', v.image_combat) order by c.id), '[]'::jsonb)
  from public.deck d
  join public.cartes c on c.id = d.carte_id and c.actif
  left join lateral (
    select vc.image_path, vc.image_combat
    from public.variantes_carte vc
    join public.collection_joueur cj on cj.variante_id = vc.id and cj.joueur_id = p_joueur and cj.quantite > 0
    where vc.carte_id = c.id
    order by vc.poids asc, vc.id
    limit 1) v on true
  where d.joueur_id = p_joueur;
$$;
