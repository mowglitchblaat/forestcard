-- 24-jeux-du-jour.sql — Forest Card
-- Trois mini-jeux gratuits dans la boutique, chacun jouable une fois par jour (heure de Paris).
-- Tout est tiré ici, côté Supabase : impossible de tricher depuis le navigateur.
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

-- =====================================================================
-- JEU 1 : « Les champignons de la forêt »
-- Une fois par jour (heure de Paris), le joueur choisit 1 champignon parmi 3 : il gagne le gold caché dessous.
-- Ensuite, s'il veut, il peut tenter UN « quitte ou double » sur ce gain (50 % : gain doublé, 50 % : gain perdu).
-- =====================================================================

create table if not exists public.champignons_jour (
  joueur_id uuid not null,
  jour date not null,
  choix int not null,
  gain int not null,
  autres int[] not null,                 -- ce que cachaient les 2 autres champignons
  double_fait boolean not null default false,
  double_gagne boolean,
  cree_le timestamptz not null default now(),
  primary key (joueur_id, jour)
);
alter table public.champignons_jour enable row level security;   -- lecture et écriture uniquement par les fonctions ci-dessous
revoke all on public.champignons_jour from anon, authenticated;

-- Table des gains : gold et chance (sur 100). Gain moyen ≈ 32 gold par jour.
create or replace function public.champignon_tirer()
returns int language sql volatile as $$
  select case
    when r < 35 then 10
    when r < 63 then 20
    when r < 81 then 35
    when r < 92 then 50
    when r < 98 then 100
    else 250 end
  from (select random() * 100 as r) x;
$$;

create or replace function public.champignons_jour_paris() returns date language sql stable as $$
  select (now() at time zone 'Europe/Paris')::date;
$$;

-- État du jour pour le joueur connecté
create or replace function public.champignons_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.champignons_jour;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into c from public.champignons_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris();
  if not found then return jsonb_build_object('joue', false); end if;
  return jsonb_build_object('joue', true, 'choix', c.choix, 'gain', c.gain, 'autres', to_jsonb(c.autres),
    'double_fait', c.double_fait, 'double_gagne', c.double_gagne);
end $$;

-- Jouer : p_choix = 0, 1 ou 2
create or replace function public.champignons_jouer(p_choix int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g int; a int[]; m int;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  if p_choix is null or p_choix not between 0 and 2 then raise exception 'CHOIX_INVALIDE'; end if;
  if not exists (select 1 from public.joueurs where id = auth.uid()) then raise exception 'JOUEUR_INCONNU'; end if;
  g := public.champignon_tirer();
  a := array[public.champignon_tirer(), public.champignon_tirer()];
  insert into public.champignons_jour (joueur_id, jour, choix, gain, autres)
  values (auth.uid(), public.champignons_jour_paris(), p_choix, g, a)
  on conflict (joueur_id, jour) do nothing;
  if not found then raise exception 'DEJA_JOUE'; end if;
  delete from public.champignons_jour where joueur_id = auth.uid() and jour < public.champignons_jour_paris() - 7;   -- ménage
  update public.joueurs set monnaie = coalesce(monnaie, 0) + g where id = auth.uid() returning monnaie into m;
  return jsonb_build_object('gain', g, 'autres', to_jsonb(a), 'monnaie', m);
end $$;

-- Quitte ou double (une seule fois, sur le gain du jour)
create or replace function public.champignons_doubler()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.champignons_jour; ok boolean; m int;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into c from public.champignons_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris() for update;
  if not found then raise exception 'PAS_ENCORE_JOUE'; end if;
  if c.double_fait then raise exception 'DEJA_DOUBLE'; end if;
  select monnaie into m from public.joueurs where id = auth.uid() for update;
  if coalesce(m, 0) < c.gain then raise exception 'MONNAIE_INSUFFISANTE'; end if;   -- le gain a déjà été dépensé
  ok := random() < 0.5;
  update public.champignons_jour set double_fait = true, double_gagne = ok where joueur_id = c.joueur_id and jour = c.jour;
  update public.joueurs set monnaie = monnaie + case when ok then c.gain else -c.gain end where id = auth.uid() returning monnaie into m;
  return jsonb_build_object('gagne', ok, 'gain', c.gain, 'monnaie', m);
end $$;

revoke execute on function public.champignon_tirer() from public, anon, authenticated;
grant execute on function public.champignons_etat() to authenticated;
grant execute on function public.champignons_jouer(int) to authenticated;
grant execute on function public.champignons_doubler() to authenticated;

-- Ménage : on ne garde que les 7 derniers jours
delete from public.champignons_jour where jour < public.champignons_jour_paris() - 7;

-- =====================================================================
-- JEU 2 : « Duel d'ATQ » (au meilleur des 3 manches)
-- Le joueur tire une carte combattant du jeu au hasard, le bot aussi : la plus grosse ATQ gagne la manche.
-- Égalité = manche rejouée. Le premier à 2 manches gagne.
-- Victoire : un booster tiré au hasard parmi les boosters en vente à 250 gold ou moins, ajouté à son stock.
-- =====================================================================
create table if not exists public.duel_atq_jour (
  joueur_id uuid not null,
  jour date not null,
  manches jsonb not null,
  gagne boolean not null,
  booster jsonb,
  cree_le timestamptz not null default now(),
  primary key (joueur_id, jour)
);
alter table public.duel_atq_jour enable row level security;
revoke all on public.duel_atq_jour from anon, authenticated;

-- Une carte combattant active au hasard (avec son image et la couleur de sa rareté)
create or replace function public.duel_atq_carte()
returns jsonb language sql volatile security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'nom', c.nom, 'atq', c.atq,
    'image', (select v.image_path from public.variantes_carte v where v.carte_id = c.id and v.image_path is not null order by v.id limit 1),
    'couleur', (select r.couleur from public.raretes r where r.id = c.rarete_id))
  from public.cartes c
  where c.actif and c.type = 'combattant' and c.atq is not null
  order by random() limit 1;
$$;
revoke execute on function public.duel_atq_carte() from public, anon, authenticated;

create or replace function public.duel_atq_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.duel_atq_jour;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into d from public.duel_atq_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris();
  if not found then return jsonb_build_object('joue', false); end if;
  return jsonb_build_object('joue', true, 'manches', d.manches, 'gagne', d.gagne, 'booster', d.booster);
end $$;
grant execute on function public.duel_atq_etat() to authenticated;

-- La fonction de jeu est créée ici en repérant la colonne « type de booster » de stock_boosters
do $$
declare col text;
begin
  select a.attname into col
  from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
  where k.contype = 'f' and k.conrelid = 'public.stock_boosters'::regclass and k.confrelid = 'public.types_boosters'::regclass limit 1;
  col := coalesce(col, 'type_id');
  execute format($f$
  create or replace function public.duel_atq_jouer()
  returns jsonb language plpgsql security definer set search_path = public as $b$
  declare m jsonb := '[]'::jsonb; a jsonb; b jsonb; moi int := 0; bot int := 0; n int := 0; g text; bo record; bj jsonb;
  begin
    if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
    if not exists (select 1 from public.joueurs where id = auth.uid()) then raise exception 'JOUEUR_INCONNU'; end if;
    if exists (select 1 from public.duel_atq_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris()) then raise exception 'DEJA_JOUE'; end if;
    while moi < 2 and bot < 2 and n < 20 loop
      n := n + 1;
      a := public.duel_atq_carte(); b := public.duel_atq_carte();
      if a is null or b is null then raise exception 'AUCUNE_CARTE'; end if;
      g := case when (a->>'atq')::numeric > (b->>'atq')::numeric then 'moi' when (a->>'atq')::numeric < (b->>'atq')::numeric then 'bot' else 'egal' end;
      if g = 'moi' then moi := moi + 1; elsif g = 'bot' then bot := bot + 1; end if;
      m := m || jsonb_build_array(jsonb_build_object('moi', a, 'bot', b, 'gagnant', g));
    end loop;
    if moi >= 2 then
      select t.id, t.nom, t.image_path into bo from public.types_boosters t
        where t.actif and t.prix is not null and t.prix <= 250 order by random() limit 1;
      if found then
        update public.stock_boosters set quantite = quantite + 1 where joueur_id = auth.uid() and %1$I = bo.id;
        if not found then insert into public.stock_boosters (joueur_id, %1$I, quantite) values (auth.uid(), bo.id, 1); end if;
        bj := jsonb_build_object('id', bo.id, 'nom', bo.nom, 'image', bo.image_path);
      end if;
    end if;
    insert into public.duel_atq_jour (joueur_id, jour, manches, gagne, booster) values (auth.uid(), public.champignons_jour_paris(), m, moi >= 2, bj);
    delete from public.duel_atq_jour where joueur_id = auth.uid() and jour < public.champignons_jour_paris() - 7;   -- ménage
    return jsonb_build_object('manches', m, 'gagne', moi >= 2, 'booster', bj);
  end $b$;$f$, col);
end $$;
grant execute on function public.duel_atq_jouer() to authenticated;

-- =====================================================================
-- JEU 3 : « Plus ou moins » (PV)
-- Une carte combattant est montrée avec ses PV. La suivante en aura-t-elle PLUS ou MOINS ?
-- Chaque bonne réponse fait monter la série : 10, 25, 50, 100 puis 200 gold (5 bonnes réponses = maximum).
-- On peut encaisser à tout moment ; une mauvaise réponse fait tout perdre. Égalité de PV = bonne réponse.
-- La carte suivante n'est tirée qu'au moment de la réponse : rien à deviner dans le navigateur.
-- =====================================================================
create table if not exists public.plusmoins_jour (
  joueur_id uuid not null,
  jour date not null,
  carte jsonb not null,                  -- carte affichée en ce moment
  vues int[] not null default '{}',      -- cartes déjà sorties (pas de doublon dans une partie)
  serie int not null default 0,
  fini boolean not null default false,
  gain int not null default 0,
  coups jsonb not null default '[]'::jsonb,
  cree_le timestamptz not null default now(),
  primary key (joueur_id, jour)
);
alter table public.plusmoins_jour enable row level security;
revoke all on public.plusmoins_jour from anon, authenticated;

create or replace function public.plusmoins_gain(n int) returns int language sql immutable as $$
  select (array[0, 10, 25, 50, 100, 200])[least(greatest(n, 0), 5) + 1];
$$;

create or replace function public.plusmoins_carte(p_sauf int[])
returns jsonb language sql volatile security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'nom', c.nom, 'pv', c.pv,
    'image', (select v.image_path from public.variantes_carte v where v.carte_id = c.id and v.image_path is not null order by v.id limit 1),
    'couleur', (select r.couleur from public.raretes r where r.id = c.rarete_id))
  from public.cartes c
  where c.actif and c.type = 'combattant' and c.pv is not null and not (c.id = any(coalesce(p_sauf, '{}')))
  order by random() limit 1;
$$;
revoke execute on function public.plusmoins_carte(int[]) from public, anon, authenticated;

create or replace function public.plusmoins_vue(p public.plusmoins_jour)
returns jsonb language sql stable as $$
  select jsonb_build_object('joue', true, 'carte', p.carte, 'serie', p.serie, 'fini', p.fini, 'gain', p.gain,
    'coups', p.coups, 'gain_actuel', public.plusmoins_gain(p.serie), 'gain_suivant', public.plusmoins_gain(p.serie + 1));
$$;

create or replace function public.plusmoins_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p public.plusmoins_jour;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into p from public.plusmoins_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris();
  if not found then return jsonb_build_object('joue', false, 'gain_suivant', public.plusmoins_gain(1)); end if;
  return public.plusmoins_vue(p);
end $$;

create or replace function public.plusmoins_commencer()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb; p public.plusmoins_jour;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  if not exists (select 1 from public.joueurs where id = auth.uid()) then raise exception 'JOUEUR_INCONNU'; end if;
  c := public.plusmoins_carte('{}');
  if c is null then raise exception 'AUCUNE_CARTE'; end if;
  insert into public.plusmoins_jour (joueur_id, jour, carte, vues) values (auth.uid(), public.champignons_jour_paris(), c, array[(c->>'id')::int])
  on conflict (joueur_id, jour) do nothing returning * into p;
  if p is null then raise exception 'DEJA_JOUE'; end if;
  delete from public.plusmoins_jour where joueur_id = auth.uid() and jour < public.champignons_jour_paris() - 7;   -- ménage
  return public.plusmoins_vue(p);
end $$;

create or replace function public.plusmoins_jouer(p_choix text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.plusmoins_jour; c jsonb; a numeric; b numeric; ok boolean;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  if p_choix not in ('plus', 'moins') then raise exception 'CHOIX_INVALIDE'; end if;
  select * into p from public.plusmoins_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris() for update;
  if not found then raise exception 'PAS_ENCORE_JOUE'; end if;
  if p.fini then raise exception 'PARTIE_FINIE'; end if;
  c := public.plusmoins_carte(p.vues);
  if c is null then c := public.plusmoins_carte('{}'); end if;   -- plus assez de cartes différentes
  a := (p.carte->>'pv')::numeric; b := (c->>'pv')::numeric;
  ok := case when p_choix = 'plus' then b >= a else b <= a end;
  p.coups := p.coups || jsonb_build_array(jsonb_build_object('avant', p.carte, 'apres', c, 'choix', p_choix, 'ok', ok));
  p.carte := c; p.vues := p.vues || (c->>'id')::int;
  if ok then
    p.serie := p.serie + 1;
    if p.serie >= 5 then   -- série maximale : encaissé automatiquement
      p.fini := true; p.gain := public.plusmoins_gain(p.serie);
      update public.joueurs set monnaie = coalesce(monnaie, 0) + p.gain where id = auth.uid();
    end if;
  else
    p.fini := true; p.gain := 0;
  end if;
  update public.plusmoins_jour set carte = p.carte, vues = p.vues, serie = p.serie, fini = p.fini, gain = p.gain, coups = p.coups
    where joueur_id = p.joueur_id and jour = p.jour;
  return public.plusmoins_vue(p) || jsonb_build_object('dernier_ok', ok);
end $$;

create or replace function public.plusmoins_encaisser()
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.plusmoins_jour;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into p from public.plusmoins_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris() for update;
  if not found then raise exception 'PAS_ENCORE_JOUE'; end if;
  if p.fini then raise exception 'PARTIE_FINIE'; end if;
  if p.serie < 1 then raise exception 'RIEN_A_ENCAISSER'; end if;
  p.fini := true; p.gain := public.plusmoins_gain(p.serie);
  update public.plusmoins_jour set fini = true, gain = p.gain where joueur_id = p.joueur_id and jour = p.jour;
  update public.joueurs set monnaie = coalesce(monnaie, 0) + p.gain where id = auth.uid();
  return public.plusmoins_vue(p);
end $$;

grant execute on function public.plusmoins_etat() to authenticated;
grant execute on function public.plusmoins_commencer() to authenticated;
grant execute on function public.plusmoins_jouer(text) to authenticated;
grant execute on function public.plusmoins_encaisser() to authenticated;
