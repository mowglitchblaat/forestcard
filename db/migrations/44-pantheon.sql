-- 44-pantheon.sql — Forest Card
-- Onglet Ceintures : le Panthéon, les plus grands règnes de toutes les ceintures, gardés pour toujours
-- (ceintures_etat ne renvoie que les 60 derniers règnes). Deux classements : par nombre de défenses, et par durée
-- de règne (un règne en cours compte jusqu'à maintenant). Sans spoil, comme ceintures_etat
-- (38-ceintures-histoire.sql) : un règne né d'un combat encore à l'écran est caché, celui qu'il a terminé reste
-- « en cours », et une défense encore à l'écran n'est pas comptée.
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

create or replace function public.pantheon_ceintures(p_limite int default 5)
returns jsonb language sql stable security definer set search_path = public as $$
  with r as (
    select r.division, j.pseudo, r.debut,
           case when t.division is null then r.fin end as fin,
           case when t.division is not null and r.fin is null then greatest(0, r.defenses - 1) else r.defenses end as defenses,
           r.primes
    from public.regnes r left join public.joueurs j on j.id = r.joueur_id
    left join lateral (select * from public.titre_en_cours() t where t.regne_id = r.id limit 1) t on true
    where not exists (select 1 from public.titre_en_cours() n where n.division = r.division and r.debut >= n.fini_le)
  ), x as (
    select jsonb_build_object('division', division, 'nom', public.titre_nom(division), 'pseudo', pseudo, 'debut', debut,
             'fin', fin, 'defenses', defenses, 'primes', primes,
             'secondes', extract(epoch from coalesce(fin, now()) - debut)::bigint) as o,
           defenses, coalesce(fin, now()) - debut as duree, debut
    from r
  )
  select jsonb_build_object(
    'defenses', (select coalesce(jsonb_agg(o order by defenses desc, duree desc), '[]')
                 from (select * from x where defenses > 0 order by defenses desc, duree desc limit greatest(1, least(p_limite, 20))) a),
    'duree', (select coalesce(jsonb_agg(o order by duree desc, defenses desc), '[]')
              from (select * from x order by duree desc, defenses desc limit greatest(1, least(p_limite, 20))) b));
$$;
revoke all on function public.pantheon_ceintures(int) from public;
grant execute on function public.pantheon_ceintures(int) to anon, authenticated, service_role;
