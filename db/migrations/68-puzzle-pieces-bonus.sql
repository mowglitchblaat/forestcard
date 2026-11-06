-- 68-puzzle-pieces-bonus.sql — Forest Card
-- Pièces en plus pour un joueur, pour la journée (Paris) : annonces_puzzle_bonus, que l'admin remplit (ex. un joueur
-- à qui on redonne des pièces). La main du jour = pièces par jour du puzzle + bonus du jour.
-- À lancer une fois dans Supabase (SQL Editor), après 67-ceinture-vacante-sans-jeton.sql ; peut être relancé.

create table if not exists public.annonces_puzzle_bonus (
  annonce_id bigint not null references public.annonces(id) on delete cascade,
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  jour date not null,
  pieces integer not null default 0 check (pieces >= 0),
  primary key (annonce_id, joueur_id, jour)
);
alter table public.annonces_puzzle_bonus enable row level security;
revoke all on public.annonces_puzzle_bonus from public, anon, authenticated;

create or replace function public.puzzle_main(p_annonce bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.annonces; v_jour date := public.puzzle_jour_paris(); v_faites int; v_manque int; v_total int; v_quota int;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour jouer au puzzle.'; end if;
  select * into a from public.annonces where id = p_annonce;
  if a.id is null or a.type <> 'puzzle' then raise exception 'Puzzle introuvable.'; end if;
  if not exists (select 1 from public.annonces_puzzle_images i where i.annonce_id = a.id) then
    raise exception 'Le puzzle se prépare : reviens dans quelques minutes.'; end if;
  v_total := a.puzzle_cols * a.puzzle_lignes;
  v_quota := a.puzzle_jour + coalesce((select b.pieces from public.annonces_puzzle_bonus b
    where b.annonce_id = a.id and b.joueur_id = auth.uid() and b.jour = v_jour), 0);
  delete from public.annonces_pioches m
  where m.annonce_id = a.id and m.joueur_id = auth.uid()
    and (m.jour <> v_jour or exists (select 1 from public.annonces_pieces p where p.annonce_id = a.id and p.piece = m.piece));
  select count(*) into v_faites from public.annonces_pieces p
  where p.annonce_id = a.id and p.joueur_id = auth.uid() and (p.pose_le at time zone 'Europe/Paris')::date = v_jour;
  if a.ouvert then
    v_manque := greatest(0, v_quota - v_faites
      - (select count(*) from public.annonces_pioches m where m.annonce_id = a.id and m.joueur_id = auth.uid())::int);
    if v_manque > 0 then
      insert into public.annonces_pioches (annonce_id, joueur_id, jour, piece)
      select a.id, auth.uid(), v_jour, g.n from generate_series(0, v_total - 1) g(n)
      where not exists (select 1 from public.annonces_pieces p where p.annonce_id = a.id and p.piece = g.n)
        and not exists (select 1 from public.annonces_pioches m where m.annonce_id = a.id and m.joueur_id = auth.uid() and m.piece = g.n)
      order by exists (select 1 from public.annonces_pioches o where o.annonce_id = a.id and o.jour = v_jour and o.piece = g.n), random()
      limit v_manque;
    end if;
  end if;
  return jsonb_build_object(
    'pieces', coalesce((select jsonb_agg(jsonb_build_object('jeton', i.jeton, 'image', i.image) order by i.jeton)
                        from public.annonces_pioches m
                        join public.annonces_puzzle_images i on i.annonce_id = m.annonce_id and i.piece = m.piece
                        where m.annonce_id = a.id and m.joueur_id = auth.uid()), '[]'),
    'faites', v_faites, 'par_jour', v_quota,
    'erreurs', public.puzzle_erreurs(a.id, auth.uid()),
    'erreurs_max', greatest(1, public.reglage_num('puzzle_erreurs_max', 3)::int),
    'bloque_jusqua', public.puzzle_bloque_jusqua(a.id, auth.uid()));
end $$;
revoke all on function public.puzzle_main(bigint) from public, anon;
grant execute on function public.puzzle_main(bigint) to authenticated;
