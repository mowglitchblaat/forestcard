-- 71-titre-combat-rendu.sql — Forest Card
-- Admin > Réglages, « Championnat » : rendre le combat pour le titre du jour, ceinture par ceinture, à un
-- joueur ou à tous. Un combat rendu ne compte plus dans titre_deja_joue : le joueur peut redéfier aujourd'hui.
-- Cas d'origine : un défi lancé la veille et accepté le lendemain compte pour le jour où il est joué.
--   - titre_combats_rendus : une ligne par remise (ceinture, joueur ou null = tous, moment). Tout combat de
--     cette ceinture fini avant ce moment ne compte plus pour le jour.
--   - admin_titre_joues_jour() : par ceinture, les joueurs dont le combat du jour est utilisé.
--   - admin_titre_rendre(division, joueur) : rend le combat du jour (joueur null = à tous).
-- À lancer une fois dans Supabase (SQL Editor), après 70-evenements-boss.sql ; peut être relancé.

create table if not exists public.titre_combats_rendus (
  id bigint generated always as identity primary key,
  division text not null check (division in ('rare', 'epique', 'libre')),
  joueur_id uuid references public.joueurs (id) on delete cascade,   -- null : tous les joueurs
  le timestamptz not null default now()
);
alter table public.titre_combats_rendus enable row level security;   -- fermée aux joueurs (aucune règle)

create or replace function public.titre_deja_joue(p_joueur uuid, p_division text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.defis_titre d
    where d.statut = 'joue' and d.division = p_division and p_joueur in (d.challenger, d.adversaire)
      and d.pour_champion                                      -- ceinture vacante : ne compte pas
      and d.gagnant is not null                                -- match nul : le combat est rendu
      and not (d.adversaire = p_joueur)                        -- défense de sa ceinture : ne compte pas
      and d.fini_le >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
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
    from public.defis_titre d join public.joueurs j on j.id = d.challenger
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
  -- combien de joueurs retrouvent leur combat (compté avant la remise)
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
