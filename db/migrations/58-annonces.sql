-- 58-annonces.sql (a executer une fois dans Supabase, apres 57)
-- Les annonces de l'admin (onglet « Annonces » du site) : une annonce simple (titre, texte, image),
-- ou un vote (des options, chacune avec son image : par exemple la prochaine collection a sortir).
-- Un joueur vote pour une seule option et peut changer d'avis tant que le vote est ouvert. Il voit
-- les resultats une fois son vote donne, ou a la cloture ; l'admin les voit toujours.

create table if not exists public.annonces (
  id bigserial primary key,
  type text not null default 'annonce' check (type in ('annonce', 'vote')),
  titre text not null check (length(btrim(titre)) between 1 and 200),
  texte text not null default '' check (length(texte) <= 5000),
  image_path text,
  ouvert boolean not null default true,
  cree_le timestamptz not null default now()
);

create table if not exists public.annonces_options (
  id bigserial primary key,
  annonce_id bigint not null references public.annonces(id) on delete cascade,
  libelle text not null check (length(btrim(libelle)) between 1 and 200),
  image_path text,
  ordre integer not null default 0
);
create index if not exists annonces_options_annonce_idx on public.annonces_options (annonce_id);

create table if not exists public.annonces_votes (
  annonce_id bigint not null references public.annonces(id) on delete cascade,
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  option_id bigint not null references public.annonces_options(id) on delete cascade,
  vote_le timestamptz not null default now(),
  primary key (annonce_id, joueur_id)
);

-- Annonces et options : lues par tous, ecrites par l'admin. Les votes : seulement par les fonctions.
alter table public.annonces enable row level security;
alter table public.annonces_options enable row level security;
alter table public.annonces_votes enable row level security;
revoke all on public.annonces, public.annonces_options, public.annonces_votes from public, anon, authenticated;
grant select on public.annonces, public.annonces_options to anon, authenticated;
grant insert, update, delete on public.annonces, public.annonces_options to authenticated;
grant usage on sequence public.annonces_id_seq, public.annonces_options_id_seq to authenticated;

drop policy if exists annonces_lire on public.annonces;
create policy annonces_lire on public.annonces for select to anon, authenticated using (true);
drop policy if exists annonces_admin on public.annonces;
create policy annonces_admin on public.annonces for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists annonces_options_lire on public.annonces_options;
create policy annonces_options_lire on public.annonces_options for select to anon, authenticated using (true);
drop policy if exists annonces_options_admin on public.annonces_options;
create policy annonces_options_admin on public.annonces_options for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Les annonces, les plus recentes d'abord, avec pour un vote : ses options, le vote du joueur, et les
-- voix (seulement si le joueur a vote, si le vote est clos, ou pour l'admin).
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
        from public.annonces_options o where o.annonce_id = a.id), '[]')
    ) as item
    from public.annonces a
    left join public.annonces_votes mv on mv.annonce_id = a.id and mv.joueur_id = auth.uid()
  ) x;
$$;
revoke all on function public.annonces_liste() from public;
grant execute on function public.annonces_liste() to anon, authenticated;

-- Joueur : vote pour une option (ou change son vote) tant que le vote est ouvert.
create or replace function public.voter_annonce(p_option bigint)
returns void language plpgsql security definer set search_path = public as $$
declare a public.annonces;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour voter.'; end if;
  select an.* into a from public.annonces an join public.annonces_options o on o.annonce_id = an.id
  where o.id = p_option;
  if a.id is null then raise exception 'Option inconnue.'; end if;
  if a.type <> 'vote' then raise exception 'Cette annonce n''est pas un vote.'; end if;
  if not a.ouvert then raise exception 'Le vote est clos.'; end if;
  insert into public.annonces_votes (annonce_id, joueur_id, option_id) values (a.id, auth.uid(), p_option)
  on conflict (annonce_id, joueur_id) do update set option_id = excluded.option_id, vote_le = now();
end $$;
revoke all on function public.voter_annonce(bigint) from public, anon;
grant execute on function public.voter_annonce(bigint) to authenticated;
