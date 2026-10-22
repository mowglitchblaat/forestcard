-- 37-ceintures-sans-spoil.sql — Forest Card
-- Pas de spoil sur les ceintures : tant que l'animation d'un combat pour le titre n'est pas finie à l'écran,
-- l'onglet Ceintures du site et !ceintures montrent la ceinture comme AVANT le combat (même champion, mêmes
-- défenses, règnes inchangés), avec la mention « combat pour le titre en cours ».
-- Même signal que l'historique (21-historique-sans-spoil.sql) : l'overlay OBS prévient Supabase à la fin de
-- l'animation (combat_affiche) ; s'il n'est pas ouvert, le résultat apparaît quand même au bout de 15 minutes.
-- À lancer une fois dans Supabase (SQL Editor), après 36-ceintures-lecture-serveur.sql ; peut être relancé sans risque.

-- Combats pour le titre joués mais encore en cours d'animation, avec le règne en place juste avant chacun
create or replace function public.titre_en_cours()
returns table (division text, fini_le timestamptz, regne_id bigint, joueur_id uuid, debut timestamptz, defenses int)
language sql stable security definer set search_path = public as $$
  select d.division, d.fini_le, r.id, r.joueur_id, r.debut, r.defenses
  from public.defis_titre d
  left join lateral (select * from public.regnes r where r.division = d.division and r.debut < d.fini_le
      and (r.fin is null or r.fin >= d.fini_le) order by r.debut desc limit 1) r on true
  where d.statut = 'joue' and d.fini_le > now() - interval '15 minutes'
    and not exists (select 1 from public.historique_combats h where h.seed::text = d.seed and h.affiche);
$$;
revoke all on function public.titre_en_cours() from public, anon, authenticated;

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
        order by r.debut desc limit 60) y));
end $$;
revoke all on function public.ceintures_etat() from public;
grant execute on function public.ceintures_etat() to anon, authenticated, service_role;
