-- 24-champignons.sql — Forest Card
-- Mini-jeu quotidien de la boutique : « Les champignons de la forêt ».
-- Une fois par jour (heure de Paris), le joueur choisit 1 champignon parmi 3 : il gagne le gold caché dessous.
-- Ensuite, s'il veut, il peut tenter UN « quitte ou double » sur ce gain (50 % : gain doublé, 50 % : gain perdu).
-- Tout est tiré ici, côté Supabase : impossible de tricher depuis le navigateur.
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

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
