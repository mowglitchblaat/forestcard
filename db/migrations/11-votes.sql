-- 11-votes.sql — Forest Card
-- Votes d'équilibrage des joueurs : chaque joueur choisit des cartes et, pour chacune,
-- indique ce qu'il voudrait voir changer (ATQ, PV, passif, ultime, effet) : nerf, up ou rework.
-- Limite : 5 cartes différentes par joueur et par semaine (la semaine repart chaque lundi, heure de Paris).
-- Affiché dans l'onglet « Patch notes → Votes » du site. À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

create table if not exists public.votes_equilibrage (
  id         bigserial primary key,
  joueur_id  uuid not null,
  carte_id   bigint not null,
  aspect     text not null check (aspect ~ '^(atq|pv|ultime|effet|passif:[0-9]+)$'),
  sens       text not null check (sens in ('nerf','up','rework')),
  semaine    date not null,
  cree_le    timestamptz not null default now(),
  unique (joueur_id, carte_id, aspect, semaine)
);
create index if not exists votes_equilibrage_semaine_idx on public.votes_equilibrage (semaine, carte_id);

-- Les joueurs ne lisent jamais la table directement (on ne montre pas qui a voté quoi) : tout passe par les fonctions ci-dessous.
alter table public.votes_equilibrage enable row level security;
drop policy if exists "votes lecture admin" on public.votes_equilibrage;
create policy "votes lecture admin" on public.votes_equilibrage for select to authenticated using (public.is_admin());
drop policy if exists "votes suppression admin" on public.votes_equilibrage;
create policy "votes suppression admin" on public.votes_equilibrage for delete to authenticated using (public.is_admin());
grant select, delete on public.votes_equilibrage to authenticated;

-- Lundi de la semaine en cours (heure de Paris)
create or replace function public.semaine_vote() returns date
language sql stable as $$ select date_trunc('week', now() at time zone 'Europe/Paris')::date $$;

-- Enregistre (ou remplace) le vote du joueur pour une carte. p_choix = [{"aspect":"atq","sens":"nerf"}, …]
-- Liste vide = retirer son vote pour cette carte. Renvoie le nombre de cartes qu'il peut encore voter cette semaine.
create or replace function public.voter_carte(p_carte bigint, p_choix jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare s date := public.semaine_vote(); n int; e jsonb;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour voter'; end if;
  if not exists (select 1 from public.cartes where id = p_carte) then raise exception 'Carte inconnue'; end if;
  delete from public.votes_equilibrage where joueur_id = auth.uid() and carte_id = p_carte and semaine = s;
  select count(distinct carte_id) into n from public.votes_equilibrage where joueur_id = auth.uid() and semaine = s;
  if p_choix is null or jsonb_typeof(p_choix) <> 'array' or jsonb_array_length(p_choix) = 0 then return greatest(0, 5 - n); end if;
  if n >= 5 then raise exception 'Tu as déjà voté pour 5 cartes cette semaine'; end if;
  for e in select * from jsonb_array_elements(p_choix) loop
    insert into public.votes_equilibrage (joueur_id, carte_id, aspect, sens, semaine)
    values (auth.uid(), p_carte, e->>'aspect', e->>'sens', s)
    on conflict (joueur_id, carte_id, aspect, semaine) do update set sens = excluded.sens;
  end loop;
  return greatest(0, 4 - n);
end $$;

-- Les votes du joueur connecté pour la semaine en cours
create or replace function public.mes_votes()
returns table (carte_id bigint, aspect text, sens text)
language sql stable security definer set search_path = public as $$
  select v.carte_id, v.aspect, v.sens from public.votes_equilibrage v
  where v.joueur_id = auth.uid() and v.semaine = public.semaine_vote()
$$;

-- Résultats agrégés (sans les noms des votants). p_decalage = 0 : cette semaine, 1 : la semaine dernière…
create or replace function public.resultats_votes(p_decalage int default 0)
returns table (carte_id bigint, carte_nom text, aspect text, sens text, nb bigint, votants bigint)
language sql stable security definer set search_path = public as $$
  with v as (select * from public.votes_equilibrage where semaine = public.semaine_vote() - 7 * greatest(0, p_decalage))
  select v.carte_id, c.nom, v.aspect, v.sens, count(*),
         (select count(distinct w.joueur_id) from v w where w.carte_id = v.carte_id)
  from v join public.cartes c on c.id = v.carte_id
  group by v.carte_id, c.nom, v.aspect, v.sens
$$;

grant execute on function public.semaine_vote() to anon, authenticated;
grant execute on function public.voter_carte(bigint, jsonb) to authenticated;
grant execute on function public.mes_votes() to authenticated;
grant execute on function public.resultats_votes(int) to anon, authenticated;
