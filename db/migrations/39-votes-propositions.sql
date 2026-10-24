-- 39-votes-propositions.sql — Forest Card
-- Votes d'équilibrage, nouvelle formule : un joueur PROPOSE une de ses cartes avec un sens
-- (nerf, up ou rework), éventuellement sur une partie précise (ATQ, PV, un passif, l'ultime, l'effet)
-- et avec un petit commentaire. La proposition apparaît dans l'onglet Votes de tous les joueurs,
-- qui votent OUI ou NON (une voix chacun, modifiable jusqu'à la fin de la semaine).
-- Règles :
--   - 5 propositions par joueur et par semaine (la semaine repart chaque lundi, heure de Paris) ;
--   - une carte ne peut être proposée qu'une fois par semaine : déjà proposée, elle n'est plus
--     proposable jusqu'au lundi suivant ;
--   - l'auteur compte d'office pour OUI et ne vote pas sur sa propre proposition ;
--   - il peut la retirer tant que personne d'autre n'a voté (la carte redevient proposable).
-- Les anciens votes (11-votes.sql) ne sont pas touchés. Utilise la vue echange_coll (28-echanges.sql).
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

create table if not exists public.votes_propositions (
  id          bigserial primary key,
  carte_id    bigint not null references public.cartes(id) on delete cascade,
  auteur_id   uuid not null,
  sens        text not null check (sens in ('nerf','up','rework')),
  aspect      text check (aspect is null or aspect ~ '^(atq|pv|ultime|effet|passif:[0-9]+)$'),
  commentaire text check (commentaire is null or char_length(commentaire) <= 200),
  semaine     date not null,
  cree_le     timestamptz not null default now(),
  unique (carte_id, semaine)
);
create index if not exists votes_propositions_semaine_idx on public.votes_propositions (semaine, auteur_id);

create table if not exists public.votes_propositions_avis (
  proposition_id bigint not null references public.votes_propositions(id) on delete cascade,
  joueur_id      uuid not null,
  oui            boolean not null,
  cree_le        timestamptz not null default now(),
  primary key (proposition_id, joueur_id)
);

-- Personne ne lit les tables directement (qui a voté quoi reste caché) : tout passe par les fonctions.
alter table public.votes_propositions enable row level security;
alter table public.votes_propositions_avis enable row level security;
drop policy if exists "propositions lecture admin" on public.votes_propositions;
create policy "propositions lecture admin" on public.votes_propositions for select to authenticated using (public.is_admin());
drop policy if exists "propositions suppression admin" on public.votes_propositions;
create policy "propositions suppression admin" on public.votes_propositions for delete to authenticated using (public.is_admin());
drop policy if exists "avis lecture admin" on public.votes_propositions_avis;
create policy "avis lecture admin" on public.votes_propositions_avis for select to authenticated using (public.is_admin());
grant select, delete on public.votes_propositions to authenticated;
grant select on public.votes_propositions_avis to authenticated;

-- Propose une carte. Renvoie le nombre de propositions qu'il reste au joueur cette semaine.
create or replace function public.proposer_vote(p_carte bigint, p_sens text, p_aspect text default null, p_commentaire text default null)
returns int language plpgsql security definer set search_path = public as $$
declare s date := public.semaine_vote(); n int; pid bigint; com text := nullif(btrim(coalesce(p_commentaire, '')), '');
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour proposer une carte'; end if;
  if p_sens not in ('nerf','up','rework') then raise exception 'Choisis nerf, up ou rework'; end if;
  if not exists (select 1 from public.cartes where id = p_carte and actif) then raise exception 'Carte inconnue'; end if;
  if not coalesce(public.is_admin(), false) and not exists (
    select 1 from public.echange_coll k join public.variantes_carte v on v.id = k.variante_id
    where k.joueur_id = auth.uid() and v.carte_id = p_carte and k.quantite > 0
  ) then raise exception 'Tu ne peux proposer que tes propres cartes'; end if;
  if com is not null and char_length(com) > 200 then raise exception 'Commentaire trop long (200 caractères max)'; end if;
  select count(*) into n from public.votes_propositions where auteur_id = auth.uid() and semaine = s;
  if n >= 5 then raise exception 'Tu as déjà fait 5 propositions cette semaine'; end if;
  if exists (select 1 from public.votes_propositions where carte_id = p_carte and semaine = s) then
    raise exception 'Cette carte a déjà été proposée cette semaine : vote sur sa proposition';
  end if;
  insert into public.votes_propositions (carte_id, auteur_id, sens, aspect, commentaire, semaine)
  values (p_carte, auth.uid(), p_sens, nullif(p_aspect, ''), com, s) returning id into pid;
  insert into public.votes_propositions_avis (proposition_id, joueur_id, oui) values (pid, auth.uid(), true);
  return greatest(0, 4 - n);
end $$;

-- Vote OUI (true) ou NON (false) sur une proposition de la semaine ; null = retirer son vote.
create or replace function public.voter_proposition(p_proposition bigint, p_oui boolean)
returns void language plpgsql security definer set search_path = public as $$
declare p public.votes_propositions;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour voter'; end if;
  select * into p from public.votes_propositions where id = p_proposition;
  if not found then raise exception 'Proposition introuvable'; end if;
  if p.semaine <> public.semaine_vote() then raise exception 'Ce vote est terminé'; end if;
  if p.auteur_id = auth.uid() then raise exception 'C''est ta proposition : ton vote compte déjà pour oui'; end if;
  if p_oui is null then
    delete from public.votes_propositions_avis where proposition_id = p.id and joueur_id = auth.uid();
  else
    insert into public.votes_propositions_avis (proposition_id, joueur_id, oui) values (p.id, auth.uid(), p_oui)
    on conflict (proposition_id, joueur_id) do update set oui = excluded.oui, cree_le = now();
  end if;
end $$;

-- Retire une proposition : son auteur, tant que personne d'autre n'a voté ; l'admin, toujours.
create or replace function public.retirer_proposition(p_proposition bigint)
returns void language plpgsql security definer set search_path = public as $$
declare p public.votes_propositions;
begin
  select * into p from public.votes_propositions where id = p_proposition;
  if not found then return; end if;
  if not coalesce(public.is_admin(), false) then
    if p.auteur_id is distinct from auth.uid() then raise exception 'Ce n''est pas ta proposition'; end if;
    if p.semaine <> public.semaine_vote() then raise exception 'Ce vote est terminé'; end if;
    if exists (select 1 from public.votes_propositions_avis where proposition_id = p.id and joueur_id <> p.auteur_id) then
      raise exception 'Des joueurs ont déjà voté : la proposition ne peut plus être retirée';
    end if;
  end if;
  delete from public.votes_propositions where id = p.id;
end $$;

-- Les propositions d'une semaine (0 : cette semaine, 1 : la semaine dernière…), avec les totaux
-- OUI / NON, le vote du joueur connecté et si la proposition est la sienne. Jamais les noms.
create or replace function public.propositions_vote(p_decalage int default 0)
returns table (id bigint, carte_id bigint, carte_nom text, sens text, aspect text, commentaire text,
               oui bigint, non bigint, mon_avis boolean, a_moi boolean, cree_le timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.carte_id, c.nom::text, p.sens, p.aspect, p.commentaire,
         count(*) filter (where a.oui), count(*) filter (where not a.oui),
         bool_or(a.oui) filter (where a.joueur_id = auth.uid()),
         coalesce(p.auteur_id = auth.uid(), false), p.cree_le
  from public.votes_propositions p
  join public.cartes c on c.id = p.carte_id
  left join public.votes_propositions_avis a on a.proposition_id = p.id
  where p.semaine = public.semaine_vote() - 7 * greatest(0, p_decalage)
  group by p.id, c.nom
  order by p.cree_le desc
$$;

grant execute on function public.proposer_vote(bigint, text, text, text) to authenticated;
grant execute on function public.voter_proposition(bigint, boolean) to authenticated;
grant execute on function public.retirer_proposition(bigint) to authenticated;
grant execute on function public.propositions_vote(int) to anon, authenticated;
