-- 53-mode-visiteur.sql : les données du mode visiteur (tools/visiteur), lisibles avec la clé publique
--
--   La page visiteur (<site>/visiteur/) est écrite chaque nuit par le workflow « Copie des images ». Elle lit tout par
--   cette fonction, avec la clé publique : aucun secret à mettre dans GitHub.
--   Elle renvoie les cartes actives (stats, effets), leurs versions, les collections et les raretés, et pour les
--   joueurs de la liste ci-dessous seulement : collection, deck actif, decks enregistrés, decks de championnat et stats.
--   Pour montrer un autre joueur, ajouter son pseudo à la liste et relancer ce script.
--
-- À coller une fois dans l'éditeur SQL de Supabase, après 52-tournoi-tout-le-monde.sql ; peut être relancé sans risque.

create or replace function public.visiteur_donnees()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with montres as (
    select j.id, j.pseudo from joueurs j
    where lower(j.pseudo) = any (array['mowglitchblaat'])   -- les joueurs montrés en mode visiteur
  )
  select jsonb_build_object(
    'cartes', coalesce((select jsonb_agg(to_jsonb(c) - 'actif' order by c.id) from cartes c where c.actif), '[]'),
    'variantes', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'carte_id', v.carte_id, 'nom', v.nom) order by v.id)
                           from variantes_carte v join cartes c on c.id = v.carte_id and c.actif), '[]'),
    'collections', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', nom)) from collections), '[]'),
    'raretes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'ordre', ordre)) from raretes), '[]'),
    'joueurs', coalesce((select jsonb_agg(jsonb_build_object(
        'pseudo', m.pseudo,
        'collection', coalesce((select jsonb_agg(jsonb_build_object('variante_id', cj.variante_id, 'quantite', cj.quantite))
                                from collection_joueur cj where cj.joueur_id = m.id and cj.quantite > 0), '[]'),
        'deck', coalesce((select jsonb_agg(d.carte_id) from deck d where d.joueur_id = m.id), '[]'),
        'decks_enregistres', coalesce((select jsonb_agg(jsonb_build_object('nom', e.nom, 'cartes', e.cartes) order by e.id)
                                       from decks_enregistres e where e.joueur_id = m.id), '[]'),
        'decks_championnat', coalesce((select jsonb_agg(jsonb_build_object('division', dc.division, 'cartes', dc.cartes))
                                       from decks_championnat dc where dc.joueur_id = m.id), '[]'),
        'stats', (select jsonb_build_object('victoires', s.victoires, 'defaites', s.defaites, 'nuls', s.nuls,
                                            'meilleure_serie', s.meilleure_serie, 'plus_gros_coup', s.plus_gros_coup,
                                            'boosters_ouverts', s.boosters_ouverts)
                  from stats_joueurs s where s.joueur_id = m.id)
      )) from montres m), '[]')
  );
$$;

revoke all on function public.visiteur_donnees() from public;
grant execute on function public.visiteur_donnees() to anon, authenticated;
