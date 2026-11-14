-- 93-atelier-trois-rouleaux.sql — Forest Card
-- TAC-001 a trois rouleaux, comme une machine a sous : chacun tire sa case de la roue (x0,5, x1,2, x2, x3, selon les
-- poids atelier_poids_*), et le multiplicateur du tour est leur produit (x0,5 x0,5 x1,2 = x0,3 ; trois 7 : x27).
-- Gain = arrondi inferieur de (mise x produit / taux du palier). Les cases tirees sont gardees (atelier_tours.cases).
-- A lancer une fois dans Supabase (SQL Editor), apres 92-atelier-mise-libre.sql ; peut etre relance.

alter table public.atelier_tours add column if not exists cases integer[];

-- Une case de la roue, tiree selon les poids : son indice.
create or replace function public._atelier_case(p_roue jsonb)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare total integer; tirage numeric; acc integer := 0; i integer;
begin
  select sum((c->>'poids')::int) into total from jsonb_array_elements(p_roue) c;
  if coalesce(total, 0) <= 0 then raise exception 'ROUE_VIDE'; end if;
  tirage := random() * total;
  for i in 0 .. jsonb_array_length(p_roue) - 1 loop
    acc := acc + (p_roue->i->>'poids')::int;
    if tirage < acc then return i; end if;
  end loop;
  return 0;
end $$;
revoke all on function public._atelier_case(jsonb) from public, anon, authenticated;

create or replace function public.atelier_tac(p_palier text, p_mise integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare j public.joueurs; roue jsonb; ks integer[] := '{}'; k integer; mult numeric := 1; v_gain integer;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  if p_palier not in ('epique', 'legendaire', 'ggez') then raise exception 'PALIER_INCONNU'; end if;
  if p_mise is null or p_mise < greatest(1, public.parrainage_reglage('atelier_mise_min', 50)) then
    raise exception 'MISE_TROP_PETITE';
  end if;
  select * into j from public.joueurs where id = auth.uid() for update;
  if coalesce(j.fragments, 0) < p_mise then raise exception 'FRAGMENTS_INSUFFISANTS'; end if;
  roue := public.atelier_roue();
  for r in 1 .. 3 loop
    k := public._atelier_case(roue);
    ks := ks || k;
    mult := mult * (roue->k->>'mult')::numeric;
  end loop;
  v_gain := floor(p_mise * mult / public.atelier_taux(p_palier));
  update public.joueurs set fragments = fragments - p_mise,
    fragments_epique = fragments_epique + case when p_palier = 'epique' then v_gain else 0 end,
    fragments_legendaire = fragments_legendaire + case when p_palier = 'legendaire' then v_gain else 0 end,
    fragments_ggez = fragments_ggez + case when p_palier = 'ggez' then v_gain else 0 end
  where id = auth.uid();
  insert into public.atelier_tours (joueur_id, palier, mise, multiplicateur, gain, cases)
  values (auth.uid(), p_palier, p_mise, mult, v_gain, ks);
  return jsonb_build_object('cases', to_jsonb(ks), 'mult', mult, 'gain', v_gain, 'palier', p_palier, 'mise', p_mise);
end $$;
grant execute on function public.atelier_tac(text, integer) to authenticated;
