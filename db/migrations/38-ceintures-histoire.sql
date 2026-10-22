-- 38-ceintures-histoire.sql — Forest Card
-- Onglet Ceintures : l'histoire de chaque ceinture racontée (qui a battu qui, défenses, ceintures retirées).
-- ceintures_etat renvoie en plus les combats pour le titre joués ('combats') ; les combats déjà joués
-- apparaissent aussi. Toujours sans spoil : un combat encore à l'écran reste caché (37-ceintures-sans-spoil.sql).
-- À lancer une fois dans Supabase (SQL Editor), après 37-ceintures-sans-spoil.sql ; peut être relancé sans risque.

create or replace function public.ceintures_etat()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.titre_maj();
  return jsonb_build_object(
    'ceintures', (select coalesce(jsonb_agg(case when p.division is null then jsonb_build_object(
        'division', c.division, 'nom', public.titre_nom(c.division), 'champion', c.champion, 'pseudo', j.pseudo,
        'depuis', c.depuis, 'dernier_titre', c.dernier_titre, 'refus', c.refus, 'defenses', c.defenses,
        'refus_max', public.reglage_num('titre_refus_max', 3),
        'defendu', exists (select 1 from public.defis_titre d where d.statut = 'joue' and c.champion in (d.challenger, d.adversaire)
           and d.fini_le >= public.titre_minuit(public.titre_jour())),
        'jours', c.jours, 'prime', case when c.champion is not null then public.titre_prime(c.jours + 1,
           (select count(*)::int from public.ceintures k where k.champion = c.champion)) end,
        'vacante_le', case when c.champion is not null then coalesce(c.dernier_titre, c.depuis)
                        + make_interval(days => public.reglage_num('titre_inactivite_jours', 7)::int) end)
      else jsonb_build_object(
        -- combat pour le titre encore à l'écran : la ceinture telle qu'avant le combat
        'division', c.division, 'nom', public.titre_nom(c.division), 'en_cours', true,
        'champion', p.joueur_id, 'pseudo', (select pseudo from public.joueurs where id = p.joueur_id), 'depuis', p.debut,
        'defenses', case when p.joueur_id is null then 0 when p.joueur_id = c.champion and p.regne_id is not null
                          and not exists (select 1 from public.regnes r where r.id = p.regne_id and r.fin is not null)
                         then greatest(0, c.defenses - 1) else p.defenses end,
        'refus', c.refus, 'refus_max', public.reglage_num('titre_refus_max', 3), 'jours', 0)
      end order by array_position(array['rare', 'epique', 'libre'], c.division)), '[]')
      from public.ceintures c left join public.joueurs j on j.id = c.champion
      left join lateral (select * from public.titre_en_cours() t where t.division = c.division order by t.fini_le limit 1) p on true),
    'defis', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'division', d.division, 'challenger', d.challenger, 'pseudo_challenger', a.pseudo,
        'adversaire', d.adversaire, 'pseudo_adversaire', b.pseudo, 'expire_le', d.expire_le) order by d.cree_le), '[]')
      from public.defis_titre d join public.joueurs a on a.id = d.challenger join public.joueurs b on b.id = d.adversaire
      where d.statut = 'attente'),
    -- règnes : ceux nés d'un combat encore à l'écran sont cachés, ceux qu'il a terminés restent « en cours »
    'regnes', (select coalesce(jsonb_agg(x order by x->>'debut' desc), '[]') from (
        select jsonb_build_object('division', r.division, 'joueur', r.joueur_id, 'pseudo', j.pseudo, 'debut', r.debut,
               'fin', case when t.division is null then r.fin end,
               'defenses', case when t.division is not null and r.fin is null then greatest(0, r.defenses - 1) else r.defenses end,
               'raison', case when t.division is null then r.raison end, 'primes', r.primes) x
        from public.regnes r left join public.joueurs j on j.id = r.joueur_id
        left join lateral (select * from public.titre_en_cours() t where t.regne_id = r.id limit 1) t on true
        where not exists (select 1 from public.titre_en_cours() n where n.division = r.division and r.debut >= n.fini_le)
        order by r.debut desc limit 60) y),
    -- combats pour le titre joués (sauf ceux encore à l'écran), pour raconter les passations et les défenses
    'combats', (select coalesce(jsonb_agg(x order by x->>'fini_le' desc), '[]') from (
        select jsonb_build_object('division', d.division, 'fini_le', d.fini_le, 'pour_champion', d.pour_champion,
               'challenger', d.challenger, 'pseudo_challenger', a.pseudo, 'adversaire', d.adversaire, 'pseudo_adversaire', b.pseudo,
               'gagnant', d.gagnant) x
        from public.defis_titre d join public.joueurs a on a.id = d.challenger join public.joueurs b on b.id = d.adversaire
        where d.statut = 'joue'
          and not exists (select 1 from public.titre_en_cours() n where n.division = d.division and d.fini_le >= n.fini_le)
        order by d.fini_le desc limit 150) y));
end $$;
revoke all on function public.ceintures_etat() from public;
grant execute on function public.ceintures_etat() to anon, authenticated, service_role;
