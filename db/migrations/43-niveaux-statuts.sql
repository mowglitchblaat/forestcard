-- 43 · Rework d'octobre 2026 : statuts à niveaux.
-- Écrit le niveau (I, II, III) sur chaque statut des cartes, le plus proche de l'ancienne valeur
-- (même règle que le moteur pour une carte sans niveau : packages/engine/src/model/levels.ts,
-- legacyLevel), et retire les anciens champs que le moteur ne lit plus.
--   poison : degtour (4 / 8 / 14)          saignement : pctpv (3 / 5 / 8), reducsoin retiré
--   brûlure : pctpv (2 / 4 / 7), calcine retiré   fatigue : fatval (15 / 30 / 50), u retiré
--   fracture : fchance (15 / 30 / 50), degfrac retiré   glas : glasv (5 / 8 / 12)
--   malédiction : val retiré (−3 fixe)      rage : fatniv selon ragev (≤ 5 : I, ≤ 12 : II, sinon III)
--   souffle, missiles, riposte de blocage : niveau d'après sval pour le statut choisi (sval reste,
--   il sert au gel) · mutation : msaignniv d'après msaignpct
-- À égalité entre deux niveaux, le plus bas.
--
-- Sauvegarde d'abord : cartes_avant_niveaux (passif, ultime, effet de chaque carte). Pour revenir en
-- arrière : update cartes c set passif = s.passif, ultime = s.ultime, effet = s.effet
--           from cartes_avant_niveaux s where s.id = c.id;
-- Rejouable : une carte déjà convertie n'est pas modifiée (son niveau est gardé).

create table if not exists cartes_avant_niveaux as
  select id, passif, ultime, effet, now() as sauvegarde_le from cartes;
alter table cartes_avant_niveaux enable row level security; -- sauvegarde : lisible par l'admin SQL seulement

create or replace function pg_temp.niv_proche(v numeric, a numeric, b numeric, c numeric)
returns int language sql immutable as $$
  select case when v is null or v <= 0 then 1
              when abs(v - a) <= abs(v - b) and abs(v - a) <= abs(v - c) then 1
              when abs(v - b) <= abs(v - c) then 2
              else 3 end
$$;

create or replace function pg_temp.num(j jsonb, k text)
returns numeric language sql immutable as $$
  select case when jsonb_typeof(j -> k) = 'number' then (j ->> k)::numeric
              when jsonb_typeof(j -> k) = 'string' and (j ->> k) ~ '^-?[0-9]+(\.[0-9]+)?$' then (j ->> k)::numeric
              else null end
$$;

-- Le niveau d'un statut d'après une valeur (élément d'un souffle, d'un missile, d'une riposte).
create or replace function pg_temp.niv_element(el text, v numeric)
returns int language sql immutable as $$
  select case el
    when 'poison' then pg_temp.niv_proche(v, 4, 8, 14)
    when 'saignement' then pg_temp.niv_proche(v, 3, 5, 8)
    when 'brulure' then pg_temp.niv_proche(v, 2, 4, 7)
    when 'fatigue' then pg_temp.niv_proche(v, 15, 30, 50)
    else null end
$$;

create or replace function pg_temp.niveaux(j jsonb)
returns jsonb language plpgsql immutable as $$
declare
  k text; t text; n int; el text;
begin
  if j is null then return null; end if;
  if jsonb_typeof(j) = 'array' then
    return (select coalesce(jsonb_agg(pg_temp.niveaux(x) order by o), '[]'::jsonb)
            from jsonb_array_elements(j) with ordinality as e(x, o));
  end if;
  if jsonb_typeof(j) <> 'object' then return j; end if;
  for k in select jsonb_object_keys(j) loop
    if jsonb_typeof(j -> k) in ('object', 'array') then
      j := jsonb_set(j, array[k], pg_temp.niveaux(j -> k));
    end if;
  end loop;
  t := regexp_replace(coalesce(j ->> 'type', ''), '^atk_', '');
  if t in ('poison', 'poison_effet', 'saignement', 'brulure', 'brulure_effet', 'fatigue', 'fracture', 'glas', 'glas_effet')
     and not (j ? 'niveau' and (j ->> 'niveau') in ('1', '2', '3')) then
    n := case
      when t in ('poison', 'poison_effet') then pg_temp.niv_proche(pg_temp.num(j, 'degtour'), 4, 8, 14)
      when t = 'saignement' then pg_temp.niv_proche(pg_temp.num(j, 'pctpv'), 3, 5, 8)
      when t in ('brulure', 'brulure_effet') then pg_temp.niv_proche(pg_temp.num(j, 'pctpv'), 2, 4, 7)
      when t = 'fatigue' then pg_temp.niv_proche(pg_temp.num(j, 'fatval'), 15, 30, 50)
      when t = 'fracture' then pg_temp.niv_proche(pg_temp.num(j, 'fchance'), 15, 30, 50)
      else pg_temp.niv_proche(pg_temp.num(j, 'glasv'), 5, 8, 12) end;
    j := jsonb_set(j, '{niveau}', to_jsonb(n))
         - 'degtour' - 'pctpv' - 'reducsoin' - 'calcine' - 'fatval' - 'fchance' - 'degfrac' - 'glasv';
    if t = 'fatigue' then j := j - 'u'; end if;
  elsif t = 'malediction' then
    j := j - 'val';
  elsif t = 'rage' and not (j ? 'fatniv') then
    j := jsonb_set(j, '{fatniv}', to_jsonb(case when coalesce(pg_temp.num(j, 'ragev'), 0) <= 5 then 1
                                                when pg_temp.num(j, 'ragev') <= 12 then 2 else 3 end)) - 'fatval';
  elsif t in ('souffle', 'missiles', 'bloque_attaque') and not (j ? 'niveau') then
    el := coalesce(j ->> 'statut', j ->> 'mstatut', j ->> 'rstatut');
    n := pg_temp.niv_element(el, pg_temp.num(j, 'sval'));
    if n is not null then j := jsonb_set(j, '{niveau}', to_jsonb(n)); end if;
    j := j - 'reducsoin';
  elsif t = 'mutation' and not (j ? 'msaignniv') and coalesce(pg_temp.num(j, 'msaignpct'), 0) > 0 then
    j := jsonb_set(j, '{msaignniv}', to_jsonb(pg_temp.niv_proche(pg_temp.num(j, 'msaignpct'), 3, 5, 8))) - 'msaignpct';
  end if;
  return j;
end
$$;

update cartes set
  passif = pg_temp.niveaux(passif),
  ultime = pg_temp.niveaux(ultime),
  effet = pg_temp.niveaux(effet)
where passif is distinct from pg_temp.niveaux(passif)
   or ultime is distinct from pg_temp.niveaux(ultime)
   or effet is distinct from pg_temp.niveaux(effet);

-- Le tableau des niveaux : vide = valeurs par défaut du moteur (Admin > Réglages > Niveaux des statuts).
insert into reglages_jeu (cle, valeur) values ('niveaux_statuts', '')
  on conflict (cle) do nothing;
