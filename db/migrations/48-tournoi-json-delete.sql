-- 48-tournoi-json-delete.sql : les onglets Tournois et Récompenses ne s'ouvraient pas
--
-- Supabase refuse un « delete » sans « where » (extension pg_safeupdate : « DELETE requires a WHERE clause »).
-- tournoi_json (46-tournois.sql) vidait sa copie de travail du tableau avec « delete from _tm; » : tournoi_etat
-- échouait donc dès qu'un tournoi existait (site, admin, !tournoi info, overlay). Même fonction, avec « where true ».
-- À coller une fois dans l'éditeur SQL de Supabase, après 47-trophees-par-place.sql.

create or replace function public.tournoi_json(p_id bigint, p_masquer boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tournois; m public.tournoi_matchs; k record; nt int; caches bigint[] := '{}';
begin
  select * into t from public.tournois where id = p_id;
  if t.id is null then return null; end if;
  -- copie de travail du tableau (table temporaire, effacée à la fin de la transaction)
  create temp table if not exists _tm (like public.tournoi_matchs) on commit drop;
  delete from _tm where true;   -- « where true » : Supabase refuse un delete sans where (pg_safeupdate)
  insert into _tm select * from public.tournoi_matchs where tournoi_id = p_id;
  if p_masquer then
    -- du plus récent au plus ancien : chaque combat caché est retiré du tableau
    for k in select mn.* from public.tournoi_combats mn join _tm x on x.id = mn.match_id
              where mn.fini_le > now() - interval '15 minutes'
                and not exists (select 1 from public.historique_combats h where h.seed::text = mn.seed and h.affiche)
              order by mn.fini_le desc, mn.id desc loop
      select * into m from _tm where id = k.match_id;
      caches := caches || m.id;
      if m.gagnant is not null and m.fini_le >= k.fini_le then   -- ce combat a conclu le match
        update _tm set gagnant = null, fini_le = null where id = m.id;
        if m.suivant_id is not null then
          update _tm set a = case when m.suivant_cote = 0 then null else a end,
                         b = case when m.suivant_cote = 1 then null else b end where id = m.suivant_id;
        end if;
        if m.perdant_id is not null then   -- le perdant de la demi-finale n'est pas encore en petite finale
          update _tm set a = case when m.perdant_cote = 0 or exempt then null else a end,
                         b = case when m.perdant_cote = 1 then null else b end,
                         gagnant = case when exempt then null else gagnant end,
                         fini_le = case when exempt then null else fini_le end, exempt = false where id = m.perdant_id;
        end if;
        if t.statut = 'termine' then t.statut := 'en_cours'; t.gagnant := null; t.fini_le := null; end if;
      end if;
      update _tm set score_a = score_a - coalesce((k.gagnant = m.a)::int, 0),
                     score_b = score_b - coalesce((k.gagnant = m.b)::int, 0),
                     nuls = nuls - (k.gagnant is null)::int where id = m.id;
    end loop;
  end if;
  select coalesce(max(tour), 0) into nt from _tm;
  return jsonb_build_object(
    'id', t.id, 'nom', t.nom, 'division', t.division, 'ceinture', public.titre_nom(t.division), 'statut', t.statut,
    'max_joueurs', coalesce(t.max_joueurs, public.reglage_num('tournoi_max_joueurs', 32)::int),
    'recompenses', public.tournoi_recompenses_json(t.id), 'trophee', t.trophee, 'auto', t.auto,
    'cree_le', t.cree_le, 'lance_le', t.lance_le, 'fini_le', t.fini_le,
    'gagnant', t.gagnant, 'pseudo_gagnant', (select pseudo from public.joueurs where id = t.gagnant),
    'tours', nt,
    'inscrits', (select coalesce(jsonb_agg(jsonb_build_object('id', i.joueur_id, 'pseudo', j.pseudo) order by i.inscrit_le), '[]')
                 from public.tournoi_inscrits i left join public.joueurs j on j.id = i.joueur_id where i.tournoi_id = t.id),
    'matchs', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'tour', x.tour, 'position', x.position, 'nom_tour', public.tournoi_match_nom(x.tour, nt, x.petite),
        'petite', x.petite, 'format', x.format,
        'a', x.a, 'b', x.b, 'pseudo_a', ja.pseudo, 'pseudo_b', jb.pseudo, 'score_a', x.score_a, 'score_b', x.score_b,
        'nuls', x.nuls, 'exempt', x.exempt, 'gagnant', x.gagnant, 'a_l_ecran', x.id = any(caches)) order by x.tour, x.position), '[]')
      from _tm x left join public.joueurs ja on ja.id = x.a left join public.joueurs jb on jb.id = x.b));
end $$;

revoke all on function public.tournoi_json(bigint, boolean) from public, anon, authenticated;
