-- 92-atelier-mise-libre.sql — Forest Card
-- TAC-001, nouvelle regle : le joueur mise ce qu'il veut (au moins atelier_mise_min, 50 fragments) et choisit le palier
-- de rarete. Chaque palier a son taux : Epique 1 (1 fragment = 1 fragment epique), Legendaire 3 (3 fragments = 1
-- legendaire), GGEZ 10 (10 fragments = 1 GGEZ). Gain = arrondi inferieur de (mise x case de la roue / taux) :
-- 100 fragments en Legendaire a x1,2 donnent 40 fragments legendaires.
-- Remplace les mises fixes de 90-atelier-tac.sql (atelier_mise_<palier> et atelier_gain_base ne sont plus lus).
-- A lancer une fois dans Supabase (SQL Editor), apres 91-ombres-manches.sql ; peut etre relance.

insert into public.reglages_jeu (cle, valeur) values
  ('atelier_mise_min', '50'), ('atelier_taux_epique', '1'), ('atelier_taux_legendaire', '3'), ('atelier_taux_ggez', '10')
on conflict (cle) do nothing;

create or replace function public.atelier_taux(p_palier text)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(1, public.parrainage_reglage('atelier_taux_' || p_palier,
    case p_palier when 'epique' then 1 when 'legendaire' then 3 else 10 end));
$$;
revoke all on function public.atelier_taux(text) from public, anon, authenticated;

create or replace function public.atelier_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare j public.joueurs;
begin
  select * into j from public.joueurs where id = auth.uid();
  return jsonb_build_object(
    'fragments', coalesce(j.fragments, 0),
    'mise_min', greatest(1, public.parrainage_reglage('atelier_mise_min', 50)),
    'roue', public.atelier_roue(),
    'paliers', jsonb_build_array(
      jsonb_build_object('cle', 'epique', 'nom', 'Épique', 'taux', public.atelier_taux('epique'),
        'solde', coalesce(j.fragments_epique, 0), 'couleur', (select couleur from public.raretes where id = 4)),
      jsonb_build_object('cle', 'legendaire', 'nom', 'Légendaire', 'taux', public.atelier_taux('legendaire'),
        'solde', coalesce(j.fragments_legendaire, 0), 'couleur', (select couleur from public.raretes where id = 3)),
      jsonb_build_object('cle', 'ggez', 'nom', 'GGEZ', 'taux', public.atelier_taux('ggez'),
        'solde', coalesce(j.fragments_ggez, 0), 'couleur', (select couleur from public.raretes where id = 5))),
    'tac', (select jsonb_build_object('nom', c.nom, 'image', coalesce(v.image_combat, v.image_path))
            from public.cartes c join public.variantes_carte v on v.carte_id = c.id
            where c.nom = 'TAC-001' order by v.id limit 1),
    'derniers', coalesce((select jsonb_agg(jsonb_build_object('palier', t.palier, 'mise', t.mise, 'mult', t.multiplicateur,
                  'gain', t.gain, 'le', t.cree_le) order by t.cree_le desc)
                from (select * from public.atelier_tours where joueur_id = auth.uid() order by cree_le desc limit 5) t), '[]'::jsonb));
end $$;
grant execute on function public.atelier_etat() to authenticated;

-- Un tour : la mise est prise, la case tiree selon les poids, le gain (mise x case / taux, arrondi inferieur) verse.
-- Refus : NON_CONNECTE, PALIER_INCONNU, MISE_TROP_PETITE, FRAGMENTS_INSUFFISANTS, ROUE_VIDE.
create or replace function public.atelier_tac(p_palier text, p_mise integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare j public.joueurs; roue jsonb; total integer; tirage numeric; acc integer := 0; i integer;
        k integer := 0; mult numeric; v_gain integer;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  if p_palier not in ('epique', 'legendaire', 'ggez') then raise exception 'PALIER_INCONNU'; end if;
  if p_mise is null or p_mise < greatest(1, public.parrainage_reglage('atelier_mise_min', 50)) then
    raise exception 'MISE_TROP_PETITE';
  end if;
  select * into j from public.joueurs where id = auth.uid() for update;
  if coalesce(j.fragments, 0) < p_mise then raise exception 'FRAGMENTS_INSUFFISANTS'; end if;
  roue := public.atelier_roue();
  select sum((c->>'poids')::int) into total from jsonb_array_elements(roue) c;
  if coalesce(total, 0) <= 0 then raise exception 'ROUE_VIDE'; end if;
  tirage := random() * total;
  for i in 0 .. jsonb_array_length(roue) - 1 loop
    acc := acc + (roue->i->>'poids')::int;
    if tirage < acc then k := i; exit; end if;
  end loop;
  mult := (roue->k->>'mult')::numeric;
  v_gain := floor(p_mise * mult / public.atelier_taux(p_palier));
  update public.joueurs set fragments = fragments - p_mise,
    fragments_epique = fragments_epique + case when p_palier = 'epique' then v_gain else 0 end,
    fragments_legendaire = fragments_legendaire + case when p_palier = 'legendaire' then v_gain else 0 end,
    fragments_ggez = fragments_ggez + case when p_palier = 'ggez' then v_gain else 0 end
  where id = auth.uid();
  insert into public.atelier_tours (joueur_id, palier, mise, multiplicateur, gain)
  values (auth.uid(), p_palier, p_mise, mult, v_gain);
  return jsonb_build_object('case', k, 'mult', mult, 'gain', v_gain, 'palier', p_palier, 'mise', p_mise);
end $$;
grant execute on function public.atelier_tac(text, integer) to authenticated;

-- L'ancienne version (mise fixe par palier) ne sert plus.
create or replace function public.atelier_tac(p_palier text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  raise exception 'MISE_TROP_PETITE';
end $$;
