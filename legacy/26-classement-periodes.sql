-- 26-classement-periodes.sql — Forest Card
-- Classements hebdomadaire et mensuel (en plus du classement global).
-- Chaque combat enregistré dans historique_combats ajoute une ligne de résultat par joueur dans resultats_combats.
-- Semaine = depuis lundi 0 h (heure de Paris) ; mois = depuis le 1er à 0 h. On garde 40 jours de résultats.
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

create table if not exists public.resultats_combats (
  id bigserial primary key,
  joueur_id uuid not null,
  resultat text not null check (resultat in ('victoire', 'defaite', 'nul')),
  cree_le timestamptz not null default now()
);
create index if not exists resultats_combats_date_idx on public.resultats_combats (cree_le, joueur_id);
alter table public.resultats_combats enable row level security;   -- lecture uniquement par la fonction de classement
revoke all on public.resultats_combats from anon, authenticated;

-- Après chaque combat : un résultat pour chacun des deux joueurs (gagnant 0 = joueur_a, 1 = joueur_b, vide = nul)
create or replace function public.resultat_apres_combat()
returns trigger language plpgsql security definer set search_path = public as $$
declare g text := new.gagnant::text;
begin
  begin
    if new.joueur_a is not null then
      insert into public.resultats_combats (joueur_id, resultat, cree_le)
      values (new.joueur_a, case when g = '0' then 'victoire' when g = '1' then 'defaite' else 'nul' end, coalesce(new.cree_le, now()));
    end if;
    if new.joueur_b is not null then
      insert into public.resultats_combats (joueur_id, resultat, cree_le)
      values (new.joueur_b, case when g = '1' then 'victoire' when g = '0' then 'defaite' else 'nul' end, coalesce(new.cree_le, now()));
    end if;
    delete from public.resultats_combats where cree_le < now() - interval '40 days';   -- ménage
  exception when others then
    raise warning 'resultats_combats : %', sqlerrm;   -- jamais bloquant pour le combat
  end;
  return null;
end $$;
drop trigger if exists resultats_combats_ajout on public.historique_combats;
create trigger resultats_combats_ajout after insert on public.historique_combats
  for each row execute function public.resultat_apres_combat();

-- Rattrapage (une seule fois) : les combats encore présents dans l'historique depuis le début du mois
insert into public.resultats_combats (joueur_id, resultat, cree_le)
select x.j, x.r, x.d from (
  select h.joueur_a j, case when h.gagnant::text = '0' then 'victoire' when h.gagnant::text = '1' then 'defaite' else 'nul' end r, h.cree_le d from public.historique_combats h where h.joueur_a is not null
  union all
  select h.joueur_b, case when h.gagnant::text = '1' then 'victoire' when h.gagnant::text = '0' then 'defaite' else 'nul' end, h.cree_le from public.historique_combats h where h.joueur_b is not null
) x
where x.d >= date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
  and not exists (select 1 from public.resultats_combats);

-- Classement d'une période : p_periode = 'semaine' ou 'mois'
create or replace function public.classement_periode(p_periode text)
returns table (joueur_id uuid, pseudo text, victoires bigint, defaites bigint, nuls bigint, debut timestamptz)
language sql stable security definer set search_path = public as $$
  with d as (
    select case when p_periode = 'mois'
      then date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
      else date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris' end as debut)
  select r.joueur_id, j.pseudo,
    count(*) filter (where r.resultat = 'victoire'), count(*) filter (where r.resultat = 'defaite'), count(*) filter (where r.resultat = 'nul'),
    (select debut from d)
  from public.resultats_combats r join public.joueurs j on j.id = r.joueur_id
  where r.cree_le >= (select debut from d)
  group by r.joueur_id, j.pseudo;
$$;
grant execute on function public.classement_periode(text) to authenticated;

-- La remise à zéro des stats (Admin > Joueurs) vide aussi ces classements
create or replace function public.admin_reset_stats(p_joueur uuid default null, p_historique boolean default true)
returns text language plpgsql security definer set search_path = public as $$
declare n_j int; n_c int; n_h int := 0;
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;

  update public.stats_joueurs set
    victoires = 0, defaites = 0, nuls = 0, serie_actuelle = 0, meilleure_serie = 0,
    plus_gros_coup = 0, degats_totaux = 0, victoire_rapide_tours = null, combat_long_tours = null,
    boosters_ouverts = 0, maj = now()
  where p_joueur is null or joueur_id = p_joueur;
  get diagnostics n_j = row_count;

  delete from public.stats_cartes where p_joueur is null or joueur_id = p_joueur;
  get diagnostics n_c = row_count;

  delete from public.resultats_combats where p_joueur is null or joueur_id = p_joueur;

  if p_historique then
    delete from public.historique_combats where p_joueur is null or joueur_a = p_joueur or joueur_b = p_joueur;
    get diagnostics n_h = row_count;
  end if;

  return format('%s profil(s) remis à zéro, %s ligne(s) de stats de cartes et %s combat(s) d''historique effacés', n_j, n_c, n_h);
end $$;
grant execute on function public.admin_reset_stats(uuid, boolean) to authenticated;
