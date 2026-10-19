-- 13-reset-stats.sql — Forest Card
-- Remise à zéro des statistiques (bouton dans Admin > Joueurs > Remise à zéro).
--   stats_joueurs      : victoires, défaites, nuls, séries, records, dégâts, boosters ouverts → remis à 0 (les lignes sont gardées)
--   stats_cartes       : carte la plus jouée / la plus victorieuse → effacées
--   historique_combats : historique des parties → effacé (facultatif)
-- p_joueur = null : TOUS les joueurs ; sinon seulement ce joueur.
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

create or replace function public.admin_reset_stats(p_joueur uuid default null, p_historique boolean default true)
returns text language plpgsql security definer set search_path = public as $$
declare n_j int; n_c int; n_h int := 0;
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;

  update public.stats_joueurs set
    victoires = 0, defaites = 0, nuls = 0, serie_actuelle = 0, meilleure_serie = 0,
    plus_gros_coup = 0, degats_totaux = 0, victoire_rapide_tours = null, combat_long_tours = null,
    boosters_ouverts = 0, maj = now()
  where p_joueur is null or joueur_id = p_joueur;
  get diagnostics n_j = row_count;

  delete from public.stats_cartes where p_joueur is null or joueur_id = p_joueur;
  get diagnostics n_c = row_count;

  if p_historique then
    delete from public.historique_combats where p_joueur is null or joueur_a = p_joueur or joueur_b = p_joueur;
    get diagnostics n_h = row_count;
  end if;

  return format('%s profil(s) remis à zéro, %s ligne(s) de stats de cartes et %s combat(s) d''historique effacés', n_j, n_c, n_h);
end $$;

grant execute on function public.admin_reset_stats(uuid, boolean) to authenticated;
