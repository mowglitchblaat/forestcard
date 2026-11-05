-- 62-admin-ceintures-avertissements.sql — Forest Card
-- Admin > Réglages, « Championnat » : deux boutons pour ne plus passer par du SQL à la main.
--   - Rendre une ceinture vacante : le règne en cours se termine (raison 'admin'), les défis en attente
--     contre le champion sont annulés (comme titre_vacante pour l'inactivité ou les refus).
--   - Retirer les avertissements d'un joueur (ceux qui comptent encore), et, au choix, lever sa privation
--     de combats de ceinture.
-- admin_titre_sanctions() liste les joueurs qui ont des avertissements actifs ou une privation en cours
-- (les tables sont fermées aux joueurs, 57-titre-un-defi-a-la-fois.sql).
-- À lancer une fois dans Supabase (SQL Editor), après 60-lore.sql (déjà appliqué dans la base le 05/11) ; peut être relancé sans risque.

create or replace function public.admin_ceinture_vacante(p_division text)
returns text language plpgsql security definer set search_path = public as $$
declare champ uuid; qui text;
begin
  if not public.is_admin() then raise exception 'ACCES_REFUSE'; end if;
  if p_division not in ('rare', 'epique', 'libre') then raise exception 'Ceinture inconnue : %', p_division; end if;
  select champion into champ from public.ceintures where division = p_division;
  if champ is null then raise exception 'La % est déjà vacante', public.titre_nom(p_division); end if;
  qui := coalesce((select pseudo from public.joueurs where id = champ), '?');
  perform public.titre_vacante(p_division, 'admin');
  return qui;
end $$;
revoke all on function public.admin_ceinture_vacante(text) from public, anon;
grant execute on function public.admin_ceinture_vacante(text) to authenticated;

create or replace function public.admin_titre_sanctions()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ACCES_REFUSE'; end if;
  return (select coalesce(jsonb_agg(x order by x->>'pseudo'), '[]') from (
    select jsonb_build_object('joueur', j.id, 'pseudo', j.pseudo,
      'avertissements', (select count(*) from public.titre_avertissements a where a.joueur_id = j.id and not a.efface),
      'prive_jusqua', public.titre_prive_jusqua(j.id)) x
    from public.joueurs j
    where exists (select 1 from public.titre_avertissements a where a.joueur_id = j.id and not a.efface)
       or public.titre_prive_jusqua(j.id) is not null) y);
end $$;
revoke all on function public.admin_titre_sanctions() from public, anon;
grant execute on function public.admin_titre_sanctions() to authenticated;

create or replace function public.admin_retirer_avertissements(p_joueur uuid, p_privation boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare nb int; lev int := 0;
begin
  if not public.is_admin() then raise exception 'ACCES_REFUSE'; end if;
  update public.titre_avertissements set efface = true where joueur_id = p_joueur and not efface;
  get diagnostics nb = row_count;
  if p_privation then
    update public.titre_privations set fin = now() where joueur_id = p_joueur and fin > now();
    get diagnostics lev = row_count;
  end if;
  return jsonb_build_object('avertissements', nb, 'privations', lev);
end $$;
revoke all on function public.admin_retirer_avertissements(uuid, boolean) from public, anon;
grant execute on function public.admin_retirer_avertissements(uuid, boolean) to authenticated;
