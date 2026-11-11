-- 79-titre-defense-tardive.sql — Forest Card
-- Combat pour le titre du jour, cote champion : une defense acceptee un AUTRE jour que celui ou le defi a
-- ete lance consomme le combat du jour (de la ceinture) du champion, le jour ou il accepte. S'il perd ce
-- combat, il ne peut donc pas redefier pour la recuperer ce jour-la. Une defense acceptee le jour meme ne
-- compte toujours pas (35-champion-sans-limite.sql, 41-titre-nul-et-defense.sql).
-- Le challenger, lui, consomme le combat du jour ou il a lance le defi (78-titre-jour-du-defi.sql).
-- Match nul, ceinture vacante et combats rendus par l'admin ne comptent toujours pas.
-- A lancer une fois dans Supabase (SQL Editor), apres 78-titre-jour-du-defi.sql ; peut etre relance.

create or replace function public.titre_deja_joue(p_joueur uuid, p_division text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.defis_titre d
    where d.statut = 'joue' and d.division = p_division and p_joueur in (d.challenger, d.adversaire)
      and d.pour_champion                                      -- ceinture vacante : ne compte pas
      and d.gagnant is not null                                -- match nul : le combat est rendu
      and (
        -- le challenger : le jour ou il a lance le defi
        (d.challenger = p_joueur
          and d.cree_le >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')
        -- le champion : seulement une defense acceptee un autre jour que le defi, le jour ou il l'accepte
        or (d.adversaire = p_joueur
          and d.fini_le >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
          and (d.fini_le at time zone 'Europe/Paris')::date > (d.cree_le at time zone 'Europe/Paris')::date))
      and not exists (select 1 from public.titre_combats_rendus r   -- rendu par l'admin
        where r.division = d.division and (r.joueur_id is null or r.joueur_id = p_joueur) and r.le >= d.fini_le));
$$;
revoke all on function public.titre_deja_joue(uuid, text) from public, anon, authenticated;

create or replace function public.admin_titre_joues_jour()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ACCES_REFUSE'; end if;
  return (select coalesce(jsonb_agg(x order by x->>'division', x->>'pseudo'), '[]') from (
    select distinct on (d.division, j.id) jsonb_build_object('division', d.division, 'joueur', j.id, 'pseudo', j.pseudo) x
    from public.defis_titre d join public.joueurs j on j.id in (d.challenger, d.adversaire)
    where d.statut = 'joue' and d.fini_le >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
      and public.titre_deja_joue(j.id, d.division)) y);
end $$;
revoke all on function public.admin_titre_joues_jour() from public, anon;
grant execute on function public.admin_titre_joues_jour() to authenticated;

create or replace function public.admin_titre_rendre(p_division text, p_joueur uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare nb int;
begin
  if not public.is_admin() then raise exception 'ACCES_REFUSE'; end if;
  if p_division not in ('rare', 'epique', 'libre') then raise exception 'Ceinture inconnue : %', p_division; end if;
  select count(distinct j) into nb from (
    select unnest(array[d.challenger, d.adversaire]) j from public.defis_titre d
    where d.statut = 'joue' and d.division = p_division
      and d.fini_le >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris') t
  where (p_joueur is null or j = p_joueur) and public.titre_deja_joue(j, p_division);
  insert into public.titre_combats_rendus (division, joueur_id) values (p_division, p_joueur);
  return nb;
end $$;
revoke all on function public.admin_titre_rendre(text, uuid) from public, anon;
grant execute on function public.admin_titre_rendre(text, uuid) to authenticated;
