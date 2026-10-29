-- 45-pantheon-doubles.sql — Forest Card
-- Panthéon (onglet Ceintures) : les doubles et triples champions, gardés pour toujours.
--   * Double champion : détenir au moins deux ceintures en même temps (une période en triple compte aussi en double).
--   * Triple champion : détenir les trois ceintures en même temps.
-- Pour chaque joueur qui l'a été : le nombre de fois (chaque période sans interruption compte pour une fois), le temps
-- total passé double (ou triple), sa plus longue période, et s'il l'est encore. Une période en cours compte jusqu'à maintenant.
-- Sans spoil, comme le reste du Panthéon (44-pantheon.sql) : un règne né d'un combat encore à l'écran est caché, et celui
-- que ce combat a terminé reste « en cours ».
-- pantheon_ceintures garde ses deux classements ('defenses', 'duree') et en ajoute deux : 'doubles' et 'triples'.
-- À lancer une fois dans Supabase (SQL Editor), après 44-pantheon.sql ; peut être relancé sans risque.

create or replace function public.pantheon_ceintures(p_limite int default 5)
returns jsonb language sql stable security definer set search_path = public as $$
  with r as (
    select r.division, r.joueur_id, j.pseudo, r.debut,
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
  ),
  -- Ceintures détenues par chaque joueur au fil du temps : +1 au début d'un règne, -1 à sa fin (maintenant s'il est en cours).
  -- À instant égal, la fin passe avant le début.
  ev as (
    select joueur_id, debut as t, 1 as d from r
    union all
    select joueur_id, coalesce(fin, now()), -1 from r
  ), c as (
    select joueur_id, t, d,
           sum(d) over (partition by joueur_id order by t, d rows between unbounded preceding and current row) as n,
           lead(t) over (partition by joueur_id order by t, d) as t2
    from ev
  ), s as (
    select c.*, lag(n, 1, 0::bigint) over (partition by joueur_id order by t, d) as n0 from c
  ),
  -- niveau 2 (double) et 3 (triple) : chaque passage sous le niveau termine une période, chaque passage au-dessus en commence une
  g as (
    select s.*, v.l,
           sum(case when s.n >= v.l and s.n0 < v.l then 1 else 0 end)
             over (partition by s.joueur_id, v.l order by s.t, s.d rows between unbounded preceding and current row) as ile
    from s cross join (values (2), (3)) v(l)
  ), iles as (
    select joueur_id, l, ile, sum(extract(epoch from t2 - t)) filter (where n >= l) as sec
    from g where ile > 0 and n >= l
    group by joueur_id, l, ile
  ), p as (
    select i.joueur_id, i.l, count(*) as fois, coalesce(sum(i.sec), 0)::bigint as secondes, coalesce(max(i.sec), 0)::bigint as record,
           (select count(*) from r k where k.joueur_id = i.joueur_id and k.fin is null) >= i.l as en_cours
    from iles i group by i.joueur_id, i.l
  ), pj as (
    select p.*, jsonb_build_object('pseudo', j.pseudo, 'fois', p.fois, 'secondes', p.secondes, 'record', p.record, 'en_cours', p.en_cours) as o
    from p left join public.joueurs j on j.id = p.joueur_id
  )
  select jsonb_build_object(
    'defenses', (select coalesce(jsonb_agg(o order by defenses desc, duree desc), '[]')
                 from (select * from x where defenses > 0 order by defenses desc, duree desc limit greatest(1, least(p_limite, 20))) a),
    'duree', (select coalesce(jsonb_agg(o order by duree desc, defenses desc), '[]')
              from (select * from x order by duree desc, defenses desc limit greatest(1, least(p_limite, 20))) b),
    'doubles', (select coalesce(jsonb_agg(o order by secondes desc, fois desc), '[]')
                from (select * from pj where l = 2 order by secondes desc, fois desc limit greatest(1, least(p_limite, 20))) d2),
    'triples', (select coalesce(jsonb_agg(o order by secondes desc, fois desc), '[]')
                from (select * from pj where l = 3 order by secondes desc, fois desc limit greatest(1, least(p_limite, 20))) d3));
$$;
revoke all on function public.pantheon_ceintures(int) from public;
grant execute on function public.pantheon_ceintures(int) to anon, authenticated, service_role;
