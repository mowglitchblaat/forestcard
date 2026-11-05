-- 63-puzzle-pieces-secretes.sql — Forest Card
-- Le puzzle des annonces (59-puzzle.sql) se trichait :
--   - une mauvaise case ne coûtait rien : il suffisait de cliquer partout ;
--   - l'image entière était dans la page (et le stockage public se liste : le dossier annonces/ la donnait) ;
--   - le numéro d'une pièce était celui de sa case (lisible dans la page et dans les réponses du serveur).
-- Désormais :
--   - l'admin découpe l'image dans son navigateur à la création (ou avec « Redécouper » pour un puzzle déjà
--     publié : les pièces posées gardent leur case) ; chaque pièce est une petite image au nom tiré au hasard
--     (dossier puzzle/ du stockage public, envoyées dans le désordre) et a un jeton au hasard ; le joueur ne
--     voit que les jetons et les images de sa main, jamais la case d'une pièce non posée ;
--   - l'image d'origine va dans un stockage privé (bucket puzzles, lecture admin) et n'est plus renvoyée aux
--     joueurs ; le fond flou vient d'une miniature (puzzle_fond), et le puzzle terminé s'affiche avec ses pièces ;
--   - au 3e essai raté de la journée (réglage puzzle_erreurs_max), le joueur est bloqué 3 heures (réglage
--     puzzle_blocage_heures) ; le compte des erreurs repart à zéro après un blocage, et chaque jour.
-- À lancer une fois dans Supabase (SQL Editor), après 62-admin-ceintures-avertissements.sql ; peut être relancé.

-- Stockage privé des images d'origine
insert into storage.buckets (id, name, public) values ('puzzles', 'puzzles', false) on conflict (id) do nothing;
drop policy if exists "puzzles admin lecture" on storage.objects;
drop policy if exists "puzzles admin ajout" on storage.objects;
drop policy if exists "puzzles admin suppression" on storage.objects;
create policy "puzzles admin lecture" on storage.objects for select to authenticated using (bucket_id = 'puzzles' and public.is_admin());
create policy "puzzles admin ajout" on storage.objects for insert to authenticated with check (bucket_id = 'puzzles' and public.is_admin());
create policy "puzzles admin suppression" on storage.objects for delete to authenticated using (bucket_id = 'puzzles' and public.is_admin());

alter table public.annonces add column if not exists puzzle_source text;   -- image d'origine, bucket puzzles
alter table public.annonces add column if not exists puzzle_fond text;     -- miniature pour le fond flou

-- Les pièces découpées : une image et un jeton au hasard par case
create table if not exists public.annonces_puzzle_images (
  annonce_id bigint not null references public.annonces(id) on delete cascade,
  piece integer not null check (piece >= 0),
  jeton uuid not null default gen_random_uuid() unique,
  image text not null,
  primary key (annonce_id, piece)
);
create table if not exists public.annonces_puzzle_erreurs (
  annonce_id bigint not null references public.annonces(id) on delete cascade,
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  le timestamptz not null default now()
);
create index if not exists annonces_puzzle_erreurs_idx on public.annonces_puzzle_erreurs (annonce_id, joueur_id, le);
create table if not exists public.annonces_puzzle_blocages (
  annonce_id bigint not null references public.annonces(id) on delete cascade,
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  fin timestamptz not null
);
create index if not exists annonces_puzzle_blocages_idx on public.annonces_puzzle_blocages (annonce_id, joueur_id, fin);
alter table public.annonces_puzzle_images enable row level security;
alter table public.annonces_puzzle_erreurs enable row level security;
alter table public.annonces_puzzle_blocages enable row level security;
revoke all on public.annonces_puzzle_images, public.annonces_puzzle_erreurs, public.annonces_puzzle_blocages from public, anon, authenticated;
-- l'admin lit les images des pièces (nettoyage des images inutilisées : elles sont gardées)
grant select on public.annonces_puzzle_images to authenticated;
drop policy if exists "puzzle images : admin" on public.annonces_puzzle_images;
create policy "puzzle images : admin" on public.annonces_puzzle_images for select to authenticated using (public.is_admin());

-- Fin du blocage en cours d'un joueur sur un puzzle (null s'il n'est pas bloqué)
create or replace function public.puzzle_bloque_jusqua(p_annonce bigint, p_joueur uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select max(fin) from public.annonces_puzzle_blocages where annonce_id = p_annonce and joueur_id = p_joueur and fin > now();
$$;
revoke all on function public.puzzle_bloque_jusqua(bigint, uuid) from public, anon, authenticated;

-- Les erreurs qui comptent : celles d'aujourd'hui (Paris), après le dernier blocage
create or replace function public.puzzle_erreurs(p_annonce bigint, p_joueur uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.annonces_puzzle_erreurs e
  where e.annonce_id = p_annonce and e.joueur_id = p_joueur
    and (e.le at time zone 'Europe/Paris')::date = public.puzzle_jour_paris()
    and e.le > coalesce((select max(b.fin) from public.annonces_puzzle_blocages b
                         where b.annonce_id = p_annonce and b.joueur_id = p_joueur), '-infinity');
$$;
revoke all on function public.puzzle_erreurs(bigint, uuid) from public, anon, authenticated;

-- Admin : enregistre le découpage d'un puzzle (remplace l'ancien) ; rend les images à effacer du stockage
create or replace function public.admin_puzzle_decoupe(p_annonce bigint, p_fond text, p_source text, p_pieces jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.annonces; anciennes jsonb; n int;
begin
  if not public.is_admin() then raise exception 'ACCES_REFUSE'; end if;
  select * into a from public.annonces where id = p_annonce for update;
  if a.id is null or a.type <> 'puzzle' then raise exception 'Puzzle introuvable.'; end if;
  n := jsonb_array_length(p_pieces);
  if n <> a.puzzle_cols * a.puzzle_lignes then raise exception 'Il faut % pièces, pas %.', a.puzzle_cols * a.puzzle_lignes, n; end if;
  select coalesce(jsonb_agg(image), '[]') into anciennes from public.annonces_puzzle_images where annonce_id = a.id;
  if a.puzzle_fond is not null and a.puzzle_fond is distinct from p_fond then anciennes := anciennes || to_jsonb(a.puzzle_fond); end if;
  -- l'ancienne image d'origine publique (annonces/…), désormais rangée dans le stockage privé
  if p_source is not null and a.puzzle_source is null and a.image_path is not null then anciennes := anciennes || to_jsonb(a.image_path); end if;
  delete from public.annonces_puzzle_images where annonce_id = a.id;
  insert into public.annonces_puzzle_images (annonce_id, piece, image)
  select a.id, (x->>'piece')::int, x->>'image' from jsonb_array_elements(p_pieces) x;
  update public.annonces set puzzle_fond = p_fond,
    puzzle_source = coalesce(p_source, puzzle_source),
    image_path = case when p_source is not null then null else image_path end
  where id = a.id;
  return anciennes;
end $$;
revoke all on function public.admin_puzzle_decoupe(bigint, text, text, jsonb) from public, anon;
grant execute on function public.admin_puzzle_decoupe(bigint, text, text, jsonb) to authenticated;

-- Les annonces : pour un puzzle, les pièces posées avec leur image, et le fond ; plus d'image d'origine
-- pour les joueurs (l'admin a puzzle_source pour redécouper)
create or replace function public.annonces_liste()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.item order by x.cree_le desc), '[]')
  from (
    select a.cree_le, jsonb_build_object(
      'id', a.id, 'type', a.type, 'titre', a.titre, 'texte', a.texte,
      'image_path', case when a.type = 'puzzle' and not public.is_admin() then null else a.image_path end,
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
        'images', coalesce((select jsonb_object_agg(p.piece::text, i.image) from public.annonces_pieces p
                            join public.annonces_puzzle_images i on i.annonce_id = p.annonce_id and i.piece = p.piece
                            where p.annonce_id = a.id), '{}'),
        'decoupe', exists (select 1 from public.annonces_puzzle_images i where i.annonce_id = a.id),
        'fond', a.puzzle_fond,
        'source', case when public.is_admin() then coalesce(a.puzzle_source, a.image_path) end,
        'source_privee', case when public.is_admin() then a.puzzle_source is not null end,
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

-- Joueur : sa main du jour, en jetons et images (jamais la case), et où il en est de ses erreurs
create or replace function public.puzzle_main(p_annonce bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.annonces; v_jour date := public.puzzle_jour_paris(); v_faites int; v_manque int; v_total int;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour jouer au puzzle.'; end if;
  select * into a from public.annonces where id = p_annonce;
  if a.id is null or a.type <> 'puzzle' then raise exception 'Puzzle introuvable.'; end if;
  if not exists (select 1 from public.annonces_puzzle_images i where i.annonce_id = a.id) then
    raise exception 'Le puzzle se prépare : reviens dans quelques minutes.'; end if;
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
    'pieces', coalesce((select jsonb_agg(jsonb_build_object('jeton', i.jeton, 'image', i.image) order by i.jeton)
                        from public.annonces_pioches m
                        join public.annonces_puzzle_images i on i.annonce_id = m.annonce_id and i.piece = m.piece
                        where m.annonce_id = a.id and m.joueur_id = auth.uid()), '[]'),
    'faites', v_faites, 'par_jour', a.puzzle_jour,
    'erreurs', public.puzzle_erreurs(a.id, auth.uid()),
    'erreurs_max', greatest(1, public.reglage_num('puzzle_erreurs_max', 3)::int),
    'bloque_jusqua', public.puzzle_bloque_jusqua(a.id, auth.uid()));
end $$;
revoke all on function public.puzzle_main(bigint) from public, anon;
grant execute on function public.puzzle_main(bigint) to authenticated;

-- L'ancienne pose par numéro de pièce n'existe plus (le numéro donnait la case)
drop function if exists public.puzzle_poser(bigint, integer, integer);

-- Joueur : pose la pièce (son jeton) sur une case. Mauvaise case : une erreur, la pièce reste dans sa main ;
-- au 3e essai raté de la journée, bloqué 3 heures. Bonne case : posée pour tout le monde.
create or replace function public.puzzle_poser(p_annonce bigint, p_jeton uuid, p_case integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.annonces; v_jour date := public.puzzle_jour_paris(); v_piece int; n int; v_complet boolean;
        v_max int; v_err int; v_fin timestamptz;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour jouer au puzzle.'; end if;
  select * into a from public.annonces where id = p_annonce for update;
  if a.id is null or a.type <> 'puzzle' then raise exception 'Puzzle introuvable.'; end if;
  if not a.ouvert then raise exception 'Ce puzzle est fermé.'; end if;
  v_fin := public.puzzle_bloque_jusqua(a.id, auth.uid());
  if v_fin is not null then
    raise exception 'Trop d''essais ratés : tu pourras reposer des pièces à %.', to_char(v_fin at time zone 'Europe/Paris', 'HH24:MI'); end if;
  select i.piece into v_piece from public.annonces_puzzle_images i where i.annonce_id = a.id and i.jeton = p_jeton;
  if v_piece is null or not exists (select 1 from public.annonces_pioches m where m.annonce_id = a.id and m.joueur_id = auth.uid()
                 and m.jour = v_jour and m.piece = v_piece) then
    raise exception 'Cette pièce n''est pas dans ta main du jour.'; end if;
  if p_case is distinct from v_piece then
    if exists (select 1 from public.annonces_pieces p where p.annonce_id = a.id and p.piece = p_case) then
      raise exception 'Cette case est déjà prise.'; end if;
    insert into public.annonces_puzzle_erreurs (annonce_id, joueur_id) values (a.id, auth.uid());
    v_max := greatest(1, public.reglage_num('puzzle_erreurs_max', 3)::int);
    v_err := public.puzzle_erreurs(a.id, auth.uid());
    if v_err >= v_max then
      v_fin := now() + make_interval(hours => greatest(1, public.reglage_num('puzzle_blocage_heures', 3)::int));
      insert into public.annonces_puzzle_blocages (annonce_id, joueur_id, fin) values (a.id, auth.uid(), v_fin);
    end if;
    return jsonb_build_object('ok', false, 'erreurs', least(v_err, v_max), 'erreurs_max', v_max, 'bloque_jusqua', v_fin);
  end if;
  insert into public.annonces_pieces (annonce_id, piece, joueur_id) values (a.id, v_piece, auth.uid())
  on conflict (annonce_id, piece) do nothing;
  get diagnostics n = row_count;
  delete from public.annonces_pioches m where m.annonce_id = a.id and m.joueur_id = auth.uid() and m.piece = v_piece;
  if n = 0 then return jsonb_build_object('ok', false, 'deja', true); end if;
  v_complet := (select count(*) from public.annonces_pieces p where p.annonce_id = a.id) >= a.puzzle_cols * a.puzzle_lignes;
  if v_complet then update public.annonces set ouvert = false where id = a.id; end if;
  return jsonb_build_object('ok', true, 'complet', v_complet);
end $$;
revoke all on function public.puzzle_poser(bigint, uuid, integer) from public, anon;
grant execute on function public.puzzle_poser(bigint, uuid, integer) to authenticated;
