-- 19-annuler-pourcent.sql — Forest Card
-- Annule le passage en % du script 17 : les effets qui étaient en POINTS avant le script 17 repassent en points
-- (ex. Colosse de chair : « +39 % des PV » redevient « +39 PV »).
-- Les valeurs modifiées depuis (équilibrage fait dans l'admin) sont GARDÉES : seule l'unité est remise comme avant.
-- L'unité est écrite en clair (« points ») pour que l'admin l'affiche correctement quand tu modifies la carte.
-- Une sauvegarde de l'état actuel est faite d'abord (table cartes_avant_annulation_pourcent).
-- À lancer une fois dans Supabase (SQL Editor). Le résultat affiche les cartes remises en points.

-- 1) Sauvegarde de l'état actuel (une seule fois)
create table if not exists public.cartes_avant_annulation_pourcent as
  select id, nom, passif, ultime, effet, now() as sauve_le from public.cartes;
alter table public.cartes_avant_annulation_pourcent enable row level security;   -- invisible depuis le site

-- 2) Parcourt l'effet actuel et l'effet d'avant le script 17 en parallèle ;
--    un effet passé de « points » à « % » par le script 17 retrouve son unité « points »
create or replace function public._fc_unite_avant(cur jsonb, old jsonb) returns jsonb
language plpgsql immutable as $$
declare k text; v jsonb; r jsonb; n int;
begin
  if cur is null or old is null then return cur; end if;
  if jsonb_typeof(cur) = 'array' and jsonb_typeof(old) = 'array' then
    n := jsonb_array_length(cur);
    if n <> jsonb_array_length(old) then return cur; end if;   -- structure changée depuis : on ne touche pas
    select coalesce(jsonb_agg(public._fc_unite_avant(cur->(i-1), old->(i-1)) order by i), '[]'::jsonb) into r
    from generate_series(1, n) i;
    return r;
  elsif jsonb_typeof(cur) = 'object' and jsonb_typeof(old) = 'object' then
    r := '{}'::jsonb;
    for k, v in select * from jsonb_each(cur) loop
      r := r || jsonb_build_object(k, case when old ? k then public._fc_unite_avant(v, old->k) else v end);
    end loop;
    if (r->>'type') is not null and (r->>'type') = (old->>'type')
       and (r->>'u') = 'pct' and coalesce(old->>'u', 'pts') <> 'pct' then
      r := r || '{"u":"pts"}';
    end if;
    return r;
  end if;
  return cur;
end $$;

-- 3) Application + liste des cartes remises en points
with avant as (
  select c.id, c.nom,
         public._fc_unite_avant(c.passif::jsonb, s.passif::jsonb) as p,
         public._fc_unite_avant(c.ultime::jsonb, s.ultime::jsonb) as u,
         public._fc_unite_avant(c.effet::jsonb,  s.effet::jsonb)  as e
  from public.cartes c join public.cartes_avant_pourcent s on s.id = c.id
), maj as (
  update public.cartes c set passif = a.p, ultime = a.u, effet = a.e
  from avant a
  where a.id = c.id
    and (c.passif::jsonb is distinct from a.p or c.ultime::jsonb is distinct from a.u or c.effet::jsonb is distinct from a.e)
  returning c.nom
)
select nom as "cartes remises en points" from maj order by nom;

drop function public._fc_unite_avant(jsonb, jsonb);

-- Pour revenir à l'état d'avant ce script (à lancer seulement si besoin) :
-- update public.cartes c set passif = s.passif, ultime = s.ultime, effet = s.effet
--   from public.cartes_avant_annulation_pourcent s where s.id = c.id;
