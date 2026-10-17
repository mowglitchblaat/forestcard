-- 24-jeux-du-jour.sql — Forest Card
-- Quatre mini-jeux gratuits dans la boutique (3 jeux du jour + 1 jeu bonus), chacun jouable une fois par jour (heure de Paris).
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

-- =====================================================================
-- JEU 4 (bonus) : « Ticket à gratter »
-- 6 cases cachées sous des dos de cartes. Chaque case révèle une rareté.
-- 3 fois la même rareté = gagné : Commun 15 · Rare 30 · Épique 60 · Légendaire 120 · GGEZ 300 gold.
-- Le ticket est tiré ici ; le gold n'est versé qu'une fois le ticket entièrement gratté (pas de spoil dans l'en-tête).
-- =====================================================================
create table if not exists public.ticket_jour (
  joueur_id uuid not null,
  jour date not null,
  grille text[] not null,
  gagnant text,                          -- rareté gagnante (null = perdu)
  gain int not null default 0,
  encaisse boolean not null default false,
  cree_le timestamptz not null default now(),
  primary key (joueur_id, jour)
);
alter table public.ticket_jour enable row level security;
revoke all on public.ticket_jour from anon, authenticated;

-- Tirage : ~39 % de tickets gagnants, gain moyen ≈ 16 gold
create or replace function public.ticket_tirer(out p_grille text[], out p_gagnant text, out p_gain int)
language plpgsql volatile as $$
declare R text[] := array['commun','rare','epique','legendaire','ggez']; G int[] := array[15,30,60,120,300];
  x numeric := random() * 100; w int; pool text[] := '{}'; s text; i int;
begin
  w := case when x < 18 then 1 when x < 29 then 2 when x < 35 then 3 when x < 38 then 4 when x < 39 then 5 else 0 end;
  -- les autres cases : chaque rareté au plus 2 fois (sinon ce serait un 2e gain)
  foreach s in array R loop if w = 0 or s <> R[w] then pool := pool || s || s; end if; end loop;
  select array_agg(v order by random()) into pool from unnest(pool) v;
  if w > 0 then p_grille := array[R[w], R[w], R[w]] || pool[1:3]; p_gagnant := R[w]; p_gain := G[w];
  else p_grille := pool[1:6]; p_gagnant := null; p_gain := 0; end if;
  select array_agg(v order by random()) into p_grille from unnest(p_grille) v;   -- mélange des 6 cases
end $$;
revoke execute on function public.ticket_tirer() from public, anon, authenticated;

create or replace function public.ticket_vue(t public.ticket_jour) returns jsonb language sql stable as $$
  select jsonb_build_object('joue', true, 'grille', to_jsonb(t.grille), 'gagnant', t.gagnant, 'gain', t.gain, 'encaisse', t.encaisse);
$$;

create or replace function public.ticket_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.ticket_jour;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into t from public.ticket_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris();
  if not found then return jsonb_build_object('joue', false); end if;
  return public.ticket_vue(t);
end $$;

create or replace function public.ticket_prendre()
returns jsonb language plpgsql security definer set search_path = public as $$
declare g text[]; w text; n int; t public.ticket_jour;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  if not exists (select 1 from public.joueurs where id = auth.uid()) then raise exception 'JOUEUR_INCONNU'; end if;
  select * into g, w, n from public.ticket_tirer();
  insert into public.ticket_jour (joueur_id, jour, grille, gagnant, gain) values (auth.uid(), public.champignons_jour_paris(), g, w, n)
  on conflict (joueur_id, jour) do nothing returning * into t;
  if t is null then raise exception 'DEJA_JOUE'; end if;
  delete from public.ticket_jour where joueur_id = auth.uid() and jour < public.champignons_jour_paris() - 7;   -- ménage
  return public.ticket_vue(t);
end $$;

-- Appelé quand toutes les cases sont grattées : verse le gain (une seule fois)
create or replace function public.ticket_encaisser()
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.ticket_jour;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into t from public.ticket_jour where joueur_id = auth.uid() and jour = public.champignons_jour_paris() for update;
  if not found then raise exception 'PAS_ENCORE_JOUE'; end if;
  if not t.encaisse then
    update public.ticket_jour set encaisse = true where joueur_id = t.joueur_id and jour = t.jour;
    if t.gain > 0 then update public.joueurs set monnaie = coalesce(monnaie, 0) + t.gain where id = auth.uid(); end if;
    t.encaisse := true;
  end if;
  return public.ticket_vue(t);
end $$;

grant execute on function public.ticket_etat() to authenticated;
grant execute on function public.ticket_prendre() to authenticated;
grant execute on function public.ticket_encaisser() to authenticated;
