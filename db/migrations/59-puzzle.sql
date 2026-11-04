-- 59-puzzle.sql (a executer une fois dans Supabase, apres 58-annonces.sql ; peut etre relance sans risque)
-- Un puzzle commun dans les annonces : l'admin choisit une image et la decoupe en colonnes x lignes
-- (10 x 10 = 100 pieces par defaut). Chaque joueur recoit chaque jour quelques pieces (5 par defaut)
-- a placer : il fait glisser une piece vers une case ; a la bonne case elle se pose pour tout le monde,
-- sinon elle revient dans sa main (il peut reessayer, sans rien perdre). Une piece posee par un autre
-- joueur avant lui est remplacee par une autre. L'image se revele piece apres piece ; quand la derniere
-- est posee, le puzzle est termine (il se ferme tout seul). Pas de recompense.
-- Jour = jour de Paris.

alter table public.annonces drop constraint if exists annonces_type_check;
alter table public.annonces add constraint annonces_type_check check (type in ('annonce', 'vote', 'puzzle'));
alter table public.annonces add column if not exists puzzle_cols integer check (puzzle_cols between 2 and 20);
alter table public.annonces add column if not exists puzzle_lignes integer check (puzzle_lignes between 2 and 20);
alter table public.annonces add column if not exists puzzle_jour integer check (puzzle_jour between 1 and 50);
alter table public.annonces add column if not exists puzzle_ratio real check (puzzle_ratio > 0);   -- largeur / hauteur de l'image

-- Les pieces posees (une seule fois chacune), et qui les a posees.
create table if not exists public.annonces_pieces (
  annonce_id bigint not null references public.annonces(id) on delete cascade,
  piece integer not null check (piece >= 0),
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  pose_le timestamptz not null default now(),
  primary key (annonce_id, piece)
);
-- La main du jour de chaque joueur : les pieces qu'il peut poser aujourd'hui.
create table if not exists public.annonces_pioches (
  annonce_id bigint not null references public.annonces(id) on delete cascade,
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  jour date not null,
  piece integer not null,
  primary key (annonce_id, joueur_id, piece)
);
create index if not exists annonces_pioches_jour_idx on public.annonces_pioches (annonce_id, jour);
alter table public.annonces_pieces enable row level security;
alter table public.annonces_pioches enable row level security;
revoke all on public.annonces_pieces, public.annonces_pioches from public, anon, authenticated;

create or replace function public.puzzle_jour_paris()
returns date language sql stable as $$ select (now() at time zone 'Europe/Paris')::date $$;

-- Les annonces (58-annonces.sql), avec pour un puzzle : sa grille, les pieces posees, le nombre de
-- participants et le nombre de pieces posees par le joueur.
create or replace function public.annonces_liste()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.item order by x.cree_le desc), '[]')
  from (
    select a.cree_le, jsonb_build_object(
      'id', a.id, 'type', a.type, 'titre', a.titre, 'texte', a.texte, 'image_path', a.image_path,
      'ouvert', a.ouvert, 'cree_le', a.cree_le,
      'mon_vote', mv.option_id,
      'resultats', (mv.option_id is not null or not a.ouvert or public.is_admin()),
      'total', case when mv.option_id is not null or not a.ouvert or public.is_admin()
        then (select count(*) from public.annonces_votes v where v.annonce_id = a.id) end,
      'options', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', o.id, 'libelle', o.libelle, 'image_path', o.image_path,
          'voix', case when mv.option_id is not null or not a.ouvert or public.is_admin()
            then (select count(*) from public.annonces_votes v where v.option_id = o.id) end
        ) order by o.ordre, o.id)
        from public.annonces_options o where o.annonce_id = a.id), '[]'),
      'puzzle', case when a.type = 'puzzle' then jsonb_build_object(
        'cols', a.puzzle_cols, 'lignes', a.puzzle_lignes, 'par_jour', a.puzzle_jour, 'ratio', a.puzzle_ratio,
        'posees', coalesce((select jsonb_agg(p.piece order by p.piece) from public.annonces_pieces p
                            where p.annonce_id = a.id), '[]'),
        'participants', (select count(distinct p.joueur_id) from public.annonces_pieces p where p.annonce_id = a.id),
        'miennes', (select count(*) from public.annonces_pieces p where p.annonce_id = a.id and p.joueur_id = auth.uid())
      ) end
    ) as item
    from public.annonces a
    left join public.annonces_votes mv on mv.annonce_id = a.id and mv.joueur_id = auth.uid()
  ) x;
$$;
revoke all on function public.annonces_liste() from public;
grant execute on function public.annonces_liste() to anon, authenticated;

-- Joueur : sa main du jour. Les pieces deja posees (par lui ou par un autre) et celles des jours
-- passes s'en vont ; la main est completee jusqu'au nombre de pieces du jour, moins celles qu'il a
-- deja posees aujourd'hui, avec des pieces pas encore posees (de preference pas deja dans la main d'un
-- autre joueur aujourd'hui).
create or replace function public.puzzle_main(p_annonce bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.annonces; v_jour date := public.puzzle_jour_paris(); v_faites int; v_manque int; v_total int;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour jouer au puzzle.'; end if;
  select * into a from public.annonces where id = p_annonce;
  if a.id is null or a.type <> 'puzzle' then raise exception 'Puzzle introuvable.'; end if;
  v_total := a.puzzle_cols * a.puzzle_lignes;
  delete from public.annonces_pioches m
  where m.annonce_id = a.id and m.joueur_id = auth.uid()
    and (m.jour <> v_jour or exists (select 1 from public.annonces_pieces p where p.annonce_id = a.id and p.piece = m.piece));
  select count(*) into v_faites from public.annonces_pieces p
  where p.annonce_id = a.id and p.joueur_id = auth.uid() and (p.pose_le at time zone 'Europe/Paris')::date = v_jour;
  if a.ouvert then
    v_manque := greatest(0, a.puzzle_jour - v_faites
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
    -- melangees (pas dans l'ordre des cases), mais toujours dans le meme ordre pour un joueur
    'pieces', coalesce((select jsonb_agg(m.piece order by md5(m.piece::text || auth.uid()::text))
                        from public.annonces_pioches m where m.annonce_id = a.id and m.joueur_id = auth.uid()), '[]'),
    'faites', v_faites, 'par_jour', a.puzzle_jour);
end $$;
revoke all on function public.puzzle_main(bigint) from public, anon;
grant execute on function public.puzzle_main(bigint) to authenticated;

-- Joueur : pose une piece de sa main sur une case. Mauvaise case : rien ne se passe (ok = false), la
-- piece reste dans sa main. Bonne case : la piece est posee pour tout le monde. Deja posee par un autre
-- entre-temps : deja = true, elle quitte sa main (puzzle_main la remplace).
create or replace function public.puzzle_poser(p_annonce bigint, p_piece integer, p_case integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.annonces; v_jour date := public.puzzle_jour_paris(); n int; v_complet boolean;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour jouer au puzzle.'; end if;
  select * into a from public.annonces where id = p_annonce for update;
  if a.id is null or a.type <> 'puzzle' then raise exception 'Puzzle introuvable.'; end if;
  if not a.ouvert then raise exception 'Ce puzzle est fermé.'; end if;
  if not exists (select 1 from public.annonces_pioches m where m.annonce_id = a.id and m.joueur_id = auth.uid()
                 and m.jour = v_jour and m.piece = p_piece) then
    raise exception 'Cette pièce n''est pas dans ta main du jour.'; end if;
  if p_case is distinct from p_piece then return jsonb_build_object('ok', false); end if;
  insert into public.annonces_pieces (annonce_id, piece, joueur_id) values (a.id, p_piece, auth.uid())
  on conflict (annonce_id, piece) do nothing;
  get diagnostics n = row_count;
  delete from public.annonces_pioches m where m.annonce_id = a.id and m.joueur_id = auth.uid() and m.piece = p_piece;
  if n = 0 then return jsonb_build_object('ok', false, 'deja', true); end if;
  v_complet := (select count(*) from public.annonces_pieces p where p.annonce_id = a.id) >= a.puzzle_cols * a.puzzle_lignes;
  if v_complet then update public.annonces set ouvert = false where id = a.id; end if;
  return jsonb_build_object('ok', true, 'complet', v_complet);
end $$;
revoke all on function public.puzzle_poser(bigint, integer, integer) from public, anon;
grant execute on function public.puzzle_poser(bigint, integer, integer) to authenticated;
