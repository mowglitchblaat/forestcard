-- 90-atelier-tac.sql — Forest Card
-- L'atelier, partie 1 : TAC-001, la machine de la collection Mecanique et Technologie, convertit les fragments (ceux
-- du recyclage) en fragments de rarete : Epique, Legendaire ou GGEZ. Le joueur choisit un palier, mise ses fragments
-- (atelier_mise_<palier> : 150, 600, 2400), TAC-001 fait tourner sa roue : x0,5 (40 %), x1,2 (35 %), x2 (20 %),
-- x3, le jackpot (5 %) ; il recoit atelier_gain_base (100) x la case en fragments du palier. Les fragments de rarete
-- serviront chez la forgeronne (partie 2) a forger des cartes de cette rarete.
-- Tout se regle dans reglages_jeu (Admin > Reglages : atelier_*).
-- A lancer une fois dans Supabase (SQL Editor), apres 89-jeux-differences-ombres.sql ; peut etre relance.

alter table public.joueurs
  add column if not exists fragments_epique integer not null default 0,
  add column if not exists fragments_legendaire integer not null default 0,
  add column if not exists fragments_ggez integer not null default 0;

insert into public.reglages_jeu (cle, valeur) values
  ('atelier_mise_epique', '150'), ('atelier_mise_legendaire', '600'), ('atelier_mise_ggez', '2400'),
  ('atelier_gain_base', '100'),
  ('atelier_poids_x05', '40'), ('atelier_poids_x12', '35'), ('atelier_poids_x2', '20'), ('atelier_poids_x3', '5')
on conflict (cle) do nothing;

create table if not exists public.atelier_tours (
  id bigint generated always as identity primary key,
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  palier text not null check (palier in ('epique', 'legendaire', 'ggez')),
  mise integer not null,
  multiplicateur numeric not null,
  gain integer not null,
  cree_le timestamptz not null default now()
);
create index if not exists atelier_tours_joueur_idx on public.atelier_tours (joueur_id, cree_le desc);
alter table public.atelier_tours enable row level security;

-- La roue : ses cases dans l'ordre (le site les dessine dans cet ordre), multiplicateur et poids.
create or replace function public.atelier_roue()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_agg(jsonb_build_object('mult', m, 'poids', public.parrainage_reglage(c, d)) order by o)
  from (values (1, 0.5, 'atelier_poids_x05', 40), (2, 1.2, 'atelier_poids_x12', 35),
               (3, 2.0, 'atelier_poids_x2', 20), (4, 3.0, 'atelier_poids_x3', 5)) v(o, m, c, d);
$$;

create or replace function public.atelier_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare j public.joueurs;
begin
  select * into j from public.joueurs where id = auth.uid();
  return jsonb_build_object(
    'fragments', coalesce(j.fragments, 0),
    'gain_base', public.parrainage_reglage('atelier_gain_base', 100),
    'roue', public.atelier_roue(),
    'paliers', jsonb_build_array(
      jsonb_build_object('cle', 'epique', 'nom', 'Épique', 'mise', public.parrainage_reglage('atelier_mise_epique', 150),
        'solde', coalesce(j.fragments_epique, 0), 'couleur', (select couleur from public.raretes where id = 4)),
      jsonb_build_object('cle', 'legendaire', 'nom', 'Légendaire', 'mise', public.parrainage_reglage('atelier_mise_legendaire', 600),
        'solde', coalesce(j.fragments_legendaire, 0), 'couleur', (select couleur from public.raretes where id = 3)),
      jsonb_build_object('cle', 'ggez', 'nom', 'GGEZ', 'mise', public.parrainage_reglage('atelier_mise_ggez', 2400),
        'solde', coalesce(j.fragments_ggez, 0), 'couleur', (select couleur from public.raretes where id = 5))),
    'tac', (select jsonb_build_object('nom', c.nom, 'image', coalesce(v.image_combat, v.image_path))
            from public.cartes c join public.variantes_carte v on v.carte_id = c.id
            where c.nom = 'TAC-001' order by v.id limit 1),
    'derniers', coalesce((select jsonb_agg(jsonb_build_object('palier', t.palier, 'mult', t.multiplicateur, 'gain', t.gain,
                  'le', t.cree_le) order by t.cree_le desc)
                from (select * from public.atelier_tours where joueur_id = auth.uid() order by cree_le desc limit 5) t), '[]'::jsonb));
end $$;
grant execute on function public.atelier_etat() to authenticated;

-- Un tour de roue : la mise du palier est prise, la case tiree selon les poids, le gain verse.
-- Rend { case (indice dans la roue), mult, gain, palier } ; refus : NON_CONNECTE, PALIER_INCONNU, FRAGMENTS_INSUFFISANTS.
create or replace function public.atelier_tac(p_palier text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare j public.joueurs; mise integer; roue jsonb; total integer; tirage numeric; acc integer := 0; i integer;
        k integer := 0; mult numeric; gain integer;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  if p_palier not in ('epique', 'legendaire', 'ggez') then raise exception 'PALIER_INCONNU'; end if;
  mise := public.parrainage_reglage('atelier_mise_' || p_palier, case p_palier when 'epique' then 150 when 'legendaire' then 600 else 2400 end);
  select * into j from public.joueurs where id = auth.uid() for update;
  if coalesce(j.fragments, 0) < mise then raise exception 'FRAGMENTS_INSUFFISANTS'; end if;
  roue := public.atelier_roue();
  select sum((c->>'poids')::int) into total from jsonb_array_elements(roue) c;
  if coalesce(total, 0) <= 0 then raise exception 'ROUE_VIDE'; end if;
  tirage := random() * total;
  for i in 0 .. jsonb_array_length(roue) - 1 loop
    acc := acc + (roue->i->>'poids')::int;
    if tirage < acc then k := i; exit; end if;
  end loop;
  mult := (roue->k->>'mult')::numeric;
  gain := round(public.parrainage_reglage('atelier_gain_base', 100) * mult);
  update public.joueurs set fragments = fragments - mise,
    fragments_epique = fragments_epique + case when p_palier = 'epique' then gain else 0 end,
    fragments_legendaire = fragments_legendaire + case when p_palier = 'legendaire' then gain else 0 end,
    fragments_ggez = fragments_ggez + case when p_palier = 'ggez' then gain else 0 end
  where id = auth.uid();
  insert into public.atelier_tours (joueur_id, palier, mise, multiplicateur, gain) values (auth.uid(), p_palier, mise, mult, gain);
  return jsonb_build_object('case', k, 'mult', mult, 'gain', gain, 'palier', p_palier);
end $$;
grant execute on function public.atelier_tac(text) to authenticated;
