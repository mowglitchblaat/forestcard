-- 23-historique-10-et-boosters.sql — Forest Card
-- 1) L'historique des combats garde maintenant les 10 derniers combats de chaque joueur (au lieu de 30).
-- 2) Nouvel historique des 5 derniers boosters ouverts par chaque joueur (onglet Historique du site).
--    La fonction actuelle ouvrir_booster est gardée telle quelle sous le nom ouvrir_booster_base ;
--    la nouvelle ouvrir_booster l'appelle, puis note le booster ouvert. Si la note échoue, l'ouverture marche quand même.
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

-- ================= 1) Historique des combats : 10 derniers =================
-- (ce bloc contient aussi tout ce que faisait 16-historique-30.sql : pas besoin de l'avoir lancé avant)
create index if not exists historique_combats_a_idx on public.historique_combats (joueur_a, cree_le desc);
create index if not exists historique_combats_b_idx on public.historique_combats (joueur_b, cree_le desc);

-- Ménage pour une liste de joueurs (null = tous)
-- Un combat est effacé si, pour CHACUN de ses deux joueurs, il y a déjà au moins p_garder (10) combats plus récents.
create or replace function public.nettoyer_historique(p_joueurs uuid[] default null, p_garder int default 10)
returns int language plpgsql security definer set search_path = public as $$
declare n int; minuit timestamptz := (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris');
begin
  delete from public.historique_combats h
  where h.cree_le < minuit   -- jamais les combats du jour
    and (p_joueurs is null or h.joueur_a = any(p_joueurs) or h.joueur_b = any(p_joueurs))
    and (h.joueur_a is null or (select count(*) from public.historique_combats x
         where (x.joueur_a = h.joueur_a or x.joueur_b = h.joueur_a) and (x.cree_le, x.id) > (h.cree_le, h.id)) >= p_garder)
    and (h.joueur_b is null or (select count(*) from public.historique_combats x
         where (x.joueur_a = h.joueur_b or x.joueur_b = h.joueur_b) and (x.cree_le, x.id) > (h.cree_le, h.id)) >= p_garder);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.nettoyer_historique(uuid[], int) from public, anon, authenticated;

-- Après chaque combat enregistré : ménage pour les deux joueurs (10 derniers combats)
create or replace function public.historique_apres_combat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.nettoyer_historique(array_remove(array[new.joueur_a, new.joueur_b], null), 10);
  return null;
end $$;
drop trigger if exists historique_30 on public.historique_combats;
create trigger historique_30 after insert on public.historique_combats
  for each row execute function public.historique_apres_combat();
select public.nettoyer_historique(null::uuid[], 10) as combats_effaces;

-- ================= 2) Historique des boosters ouverts =================
create table if not exists public.historique_boosters (
  id bigserial primary key,
  joueur_id uuid,
  pseudo text,
  booster text,
  cartes jsonb not null default '[]'::jsonb,
  cree_le timestamptz not null default now()
);
create index if not exists historique_boosters_joueur_idx on public.historique_boosters (joueur_id, cree_le desc);
alter table public.historique_boosters enable row level security;   -- lecture uniquement par la fonction ci-dessous
revoke all on public.historique_boosters from anon, authenticated;

-- Ne garder que les 5 derniers boosters de chaque joueur
create or replace function public.boosters_apres_ouverture()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.historique_boosters h
  where h.joueur_id is not distinct from new.joueur_id and h.id not in (
    select x.id from public.historique_boosters x where x.joueur_id is not distinct from new.joueur_id order by x.cree_le desc, x.id desc limit 5);
  return null;
end $$;
drop trigger if exists historique_boosters_5 on public.historique_boosters;
create trigger historique_boosters_5 after insert on public.historique_boosters
  for each row execute function public.boosters_apres_ouverture();

-- Lecture par le site : les 5 derniers boosters du joueur connecté
create or replace function public.mes_boosters_ouverts()
returns table (id bigint, booster text, cartes jsonb, cree_le timestamptz)
language sql stable security definer set search_path = public as $$
  select h.id, h.booster, h.cartes, h.cree_le from public.historique_boosters h
  where h.joueur_id = auth.uid() order by h.cree_le desc, h.id desc limit 5;
$$;
grant execute on function public.mes_boosters_ouverts() to authenticated;

-- Branchement sur ouvrir_booster
do $$
declare
  f oid; arg text; res text; noms text[]; appel text; qui text;
begin
  if not exists (select 1 from pg_proc where proname = 'ouvrir_booster_base' and pronamespace = 'public'::regnamespace) then
    select oid into f from pg_proc where proname = 'ouvrir_booster' and pronamespace = 'public'::regnamespace limit 1;
    if f is null then raise exception 'Fonction ouvrir_booster introuvable'; end if;
    execute format('alter function public.ouvrir_booster(%s) rename to ouvrir_booster_base', pg_get_function_identity_arguments(f));
  end if;
  select oid into f from pg_proc where proname = 'ouvrir_booster_base' and pronamespace = 'public'::regnamespace limit 1;
  arg := pg_get_function_arguments(f);            -- avec les valeurs par défaut
  res := pg_get_function_result(f);
  noms := (select proargnames from pg_proc where oid = f);
  if res ilike 'setof%' or res ilike 'table%' then
    raise notice 'ouvrir_booster renvoie plusieurs lignes : historique des boosters non branché'; return;
  end if;
  appel := 'public.ouvrir_booster_base(' || coalesce((select string_agg(format('%1$I => %1$I', n), ', ') from unnest(noms) n), '') || ')';
  -- retrouver le joueur : par son identifiant Twitch si possible, sinon par le pseudo renvoyé
  if 'p_twitch_id' = any(noms) and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'joueurs' and column_name = 'twitch_id') then
    qui := '(select j.id from public.joueurs j where j.twitch_id::text = p_twitch_id::text limit 1)';
  else
    qui := '(select j.id from public.joueurs j where lower(j.pseudo) = lower(r->>''pseudo'') limit 1)';
  end if;
  execute format($f$
    create or replace function public.ouvrir_booster(%1$s) returns %2$s
    language plpgsql security definer set search_path = public as $b$
    declare v %2$s; r jsonb; j uuid;
    begin
      v := %3$s;
      begin
        r := to_jsonb(v);
        if jsonb_typeof(r) = 'string' then r := (r #>> '{}')::jsonb; end if;
        if jsonb_typeof(r) = 'array' then r := r -> 0; end if;
        if r ? 'ouvrir_booster' then r := r -> 'ouvrir_booster'; end if;
        if jsonb_typeof(r -> 'cartes') = 'array' and jsonb_array_length(r -> 'cartes') > 0 then
          j := %4$s;
          insert into public.historique_boosters (joueur_id, pseudo, booster, cartes)
          values (j, r ->> 'pseudo', r ->> 'booster', r -> 'cartes');
        end if;
      exception when others then
        raise warning 'historique_boosters : %%', sqlerrm;   -- l'ouverture n'est jamais bloquée
      end;
      return v;
    end $b$;$f$, arg, res, appel, qui);
  -- exactement les mêmes droits que l'ancienne fonction (personne de plus ne peut ouvrir un booster)
  execute format('revoke all on function public.ouvrir_booster(%s) from public', pg_get_function_identity_arguments(f));
  if (select proacl from pg_proc where oid = f) is null then
    execute format('grant execute on function public.ouvrir_booster(%s) to public', pg_get_function_identity_arguments(f));
  else
    for qui in select case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end
               from pg_proc p, aclexplode(p.proacl) a left join pg_roles r on r.oid = a.grantee
               where p.oid = f and a.privilege_type = 'EXECUTE' loop
      execute format('grant execute on function public.ouvrir_booster(%s) to %s', pg_get_function_identity_arguments(f), qui);
    end loop;
  end if;
end $$;
