-- 17-unites-en-pourcent.sql — Forest Card
-- Passe en % toutes les valeurs d'effets qui étaient en unités (points), en GARDANT le même nombre :
-- « ATQ −7 » devient « ATQ −7 % », « soigne de 10 PV » devient « soigne de 10 % des PV max », etc.
-- Concerne : fatigue (malus d'ATQ), rage, modif d'ATQ / PV, soins, régénération, ATQ / PV tous les X tours,
-- réduction de dégâts, renvoi, bonus de frappe, attaque de base qui fatigue, et les effets perso qui ont une unité.
-- Les dégâts directs et le vol de vie (sans choix d'unité) ne changent pas.
-- Une sauvegarde est faite d'abord (table cartes_avant_pourcent) : on peut revenir en arrière (voir tout en bas).
-- À lancer une fois dans Supabase (SQL Editor).

-- 1) Sauvegarde (une seule fois : si la table existe déjà, on ne l'écrase pas)
create table if not exists public.cartes_avant_pourcent as
  select id, passif, ultime, effet, now() as sauve_le from public.cartes;
alter table public.cartes_avant_pourcent enable row level security;   -- invisible depuis le site

-- 2) Conversion : parcourt tout le contenu des effets (y compris multi-effets et pièges)
create or replace function public._fc_en_pourcent(j jsonb, types text[]) returns jsonb
language plpgsql immutable as $$
declare k text; v jsonb; r jsonb;
begin
  if j is null then return null; end if;
  if jsonb_typeof(j) = 'array' then
    select coalesce(jsonb_agg(public._fc_en_pourcent(x, types) order by o), '[]'::jsonb) into r
    from jsonb_array_elements(j) with ordinality t(x, o);
    return r;
  elsif jsonb_typeof(j) = 'object' then
    r := '{}'::jsonb;
    for k, v in select * from jsonb_each(j) loop r := r || jsonb_build_object(k, public._fc_en_pourcent(v, types)); end loop;
    if r ? 'type' and (r->>'type') = any(types) then r := r || '{"u":"pct"}'; end if;
    return r;
  end if;
  return j;
end $$;

do $$
declare types text[] := array['atk_fatigue','atq_mod','atq_tours','bonus_frappe','fatigue','pv_mod','pv_tours','rage',
                             'reduc_degats','renvoi','soin','soin_tour','soin_tours'];
        n int;
begin
  -- + les effets perso qui ont un champ « Unité »
  begin
    types := types || coalesce((select array_agg(cle) from public.effets_perso where to_jsonb(params) ? 'u'), '{}');
  exception when undefined_table then null; end;
  update public.cartes c set
    passif = public._fc_en_pourcent(c.passif::jsonb, types),
    ultime = public._fc_en_pourcent(c.ultime::jsonb, types),
    effet  = public._fc_en_pourcent(c.effet::jsonb, types)
  where c.passif::jsonb is distinct from public._fc_en_pourcent(c.passif::jsonb, types)
     or c.ultime::jsonb is distinct from public._fc_en_pourcent(c.ultime::jsonb, types)
     or c.effet::jsonb  is distinct from public._fc_en_pourcent(c.effet::jsonb, types);
  get diagnostics n = row_count;
  raise notice '% carte(s) passée(s) en %%', n;
end $$;

drop function public._fc_en_pourcent(jsonb, text[]);

-- Pour revenir en arrière (à lancer seulement si besoin) :
-- update public.cartes c set passif = s.passif, ultime = s.ultime, effet = s.effet
--   from public.cartes_avant_pourcent s where s.id = c.id;
