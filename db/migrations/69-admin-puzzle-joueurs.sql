-- 69-admin-puzzle-joueurs.sql — Forest Card
-- Admin > Annonces, sous un puzzle : « Joueurs du puzzle ». Pour chaque joueur qui a déjà posé une pièce (ou raté un
-- essai) : ses pièces posées aujourd'hui sur sa main du jour, ses essais ratés, son blocage. Deux gestes :
--   - admin_puzzle_bonus : lui donner N pièces de plus pour aujourd'hui (annonces_puzzle_bonus, 68-puzzle-pieces-bonus.sql) ;
--   - admin_puzzle_reset_essais : remettre ses essais ratés à zéro et lever son blocage (un blocage qui finit maintenant :
--     les erreurs ne comptent qu'après le dernier blocage, 63-puzzle-pieces-secretes.sql).
-- À lancer une fois dans Supabase (SQL Editor), après 68-puzzle-pieces-bonus.sql ; peut être relancé.

create or replace function public.admin_puzzle_joueurs(p_annonce bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a public.annonces; v_jour date := public.puzzle_jour_paris();
begin
  if not public.is_admin() then raise exception 'ACCES_REFUSE'; end if;
  select * into a from public.annonces where id = p_annonce and type = 'puzzle';
  if a.id is null then raise exception 'Puzzle introuvable.'; end if;
  return (select coalesce(jsonb_agg(x order by x->>'pseudo'), '[]') from (
    select jsonb_build_object(
      'joueur', j.id, 'pseudo', j.pseudo,
      'aujourdhui', (select count(*) from public.annonces_pieces p where p.annonce_id = a.id and p.joueur_id = j.id
                       and (p.pose_le at time zone 'Europe/Paris')::date = v_jour),
      'total', (select count(*) from public.annonces_pieces p where p.annonce_id = a.id and p.joueur_id = j.id),
      'quota', a.puzzle_jour + coalesce((select b.pieces from public.annonces_puzzle_bonus b
                 where b.annonce_id = a.id and b.joueur_id = j.id and b.jour = v_jour), 0),
      'erreurs', public.puzzle_erreurs(a.id, j.id),
      'bloque_jusqua', public.puzzle_bloque_jusqua(a.id, j.id)) x
    from public.joueurs j
    where exists (select 1 from public.annonces_pieces p where p.annonce_id = a.id and p.joueur_id = j.id)
       or exists (select 1 from public.annonces_pioches m where m.annonce_id = a.id and m.joueur_id = j.id)
       or exists (select 1 from public.annonces_puzzle_erreurs e where e.annonce_id = a.id and e.joueur_id = j.id)) y);
end $$;
revoke all on function public.admin_puzzle_joueurs(bigint) from public, anon;
grant execute on function public.admin_puzzle_joueurs(bigint) to authenticated;

create or replace function public.admin_puzzle_bonus(p_annonce bigint, p_joueur uuid, p_pieces integer)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'ACCES_REFUSE'; end if;
  if p_pieces is null or p_pieces < 1 or p_pieces > 50 then raise exception 'Entre 1 et 50 pièces.'; end if;
  insert into public.annonces_puzzle_bonus (annonce_id, joueur_id, jour, pieces)
  values (p_annonce, p_joueur, public.puzzle_jour_paris(), p_pieces)
  on conflict (annonce_id, joueur_id, jour) do update set pieces = annonces_puzzle_bonus.pieces + excluded.pieces
  returning pieces into n;
  return n;
end $$;
revoke all on function public.admin_puzzle_bonus(bigint, uuid, integer) from public, anon;
grant execute on function public.admin_puzzle_bonus(bigint, uuid, integer) to authenticated;

create or replace function public.admin_puzzle_reset_essais(p_annonce bigint, p_joueur uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ACCES_REFUSE'; end if;
  update public.annonces_puzzle_blocages set fin = now() where annonce_id = p_annonce and joueur_id = p_joueur and fin > now();
  insert into public.annonces_puzzle_blocages (annonce_id, joueur_id, fin) values (p_annonce, p_joueur, now());
end $$;
revoke all on function public.admin_puzzle_reset_essais(bigint, uuid) from public, anon;
grant execute on function public.admin_puzzle_reset_essais(bigint, uuid) to authenticated;
