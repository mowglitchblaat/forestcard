-- 61-visiteur.sql (a executer une fois dans Supabase, apres 60)
-- Le mode visiteur (visiteur.html, tools/pages/visitor.ts) : les cartes publiees, avec leur collection,
-- leur rarete et leurs versions (carte finie et dessin seul), lisibles sans connexion. Seulement ce que le jeu montre deja a tout
-- joueur connecte ; rien sur les joueurs.
create or replace function public.cartes_publiques()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'nom', c.nom, 'type', c.type, 'atq', c.atq, 'pv', c.pv, 'description', c.description,
    'passif', c.passif, 'ultime', c.ultime, 'effet', c.effet,
    'collections', case when co.id is null then null else jsonb_build_object('nom', co.nom) end,
    'raretes', case when r.id is null then null else jsonb_build_object('nom', r.nom, 'poids', r.poids) end,
    'variantes_carte', coalesce((select jsonb_agg(jsonb_build_object('nom', v.nom, 'image_path', v.image_path, 'dessin_path', v.dessin_path) order by v.id)
                                 from public.variantes_carte v where v.carte_id = c.id), '[]')
  ) order by c.id), '[]')
  from public.cartes c
  left join public.collections co on co.id = c.collection_id
  left join public.raretes r on r.id = c.rarete_id
  where c.actif;
$$;
revoke all on function public.cartes_publiques() from public;
grant execute on function public.cartes_publiques() to anon, authenticated;
