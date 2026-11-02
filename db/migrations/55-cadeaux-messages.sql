-- 55-cadeaux-messages.sql (a executer une fois dans Supabase, apres 54)
-- Un petit mot joint a un cadeau de l'admin (Admin > Cadeaux) : le joueur le voit a sa prochaine connexion au site,
-- une seule fois. Le cadeau lui-meme passe toujours par offrir_boosters.

create table if not exists public.cadeaux_messages (
  id bigserial primary key,
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  message text not null check (length(message) between 1 and 500),
  type_id integer,
  quantite integer,
  cree_le timestamptz not null default now(),
  lu_le timestamptz
);
create index if not exists cadeaux_messages_joueur_idx on public.cadeaux_messages (joueur_id) where lu_le is null;
alter table public.cadeaux_messages enable row level security;
revoke all on public.cadeaux_messages from public, anon, authenticated;
grant select on public.cadeaux_messages to authenticated;
drop policy if exists cadeaux_messages_lire on public.cadeaux_messages;
create policy cadeaux_messages_lire on public.cadeaux_messages for select to authenticated using (joueur_id = auth.uid());

-- Admin : joint un mot au cadeau d'un joueur (p_joueur nul : tous les joueurs, comme offrir_boosters)
create or replace function public.cadeau_message(p_joueur uuid, p_message text, p_type_id integer, p_quantite integer)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'INTERDIT'; end if;
  if coalesce(btrim(p_message), '') = '' then return 0; end if;
  insert into public.cadeaux_messages (joueur_id, message, type_id, quantite)
  select j.id, left(btrim(p_message), 500), p_type_id, p_quantite from public.joueurs j where p_joueur is null or j.id = p_joueur;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.cadeau_message(uuid, text, integer, integer) from public, anon;
grant execute on function public.cadeau_message(uuid, text, integer, integer) to authenticated;

-- Joueur : ses mots pas encore lus (avec le cadeau), puis il les marque comme lus
create or replace function public.cadeaux_non_lus()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'message', m.message, 'quantite', m.quantite, 'booster', t.nom, 'le', m.cree_le) order by m.cree_le), '[]')
  from public.cadeaux_messages m left join public.types_boosters t on t.id = m.type_id
  where m.joueur_id = auth.uid() and m.lu_le is null;
$$;
revoke all on function public.cadeaux_non_lus() from public, anon;
grant execute on function public.cadeaux_non_lus() to authenticated;

create or replace function public.cadeaux_lus(p_ids bigint[])
returns void language sql security definer set search_path = public as $$
  update public.cadeaux_messages set lu_le = now() where joueur_id = auth.uid() and id = any(p_ids) and lu_le is null;
$$;
revoke all on function public.cadeaux_lus(bigint[]) from public, anon;
grant execute on function public.cadeaux_lus(bigint[]) to authenticated;
