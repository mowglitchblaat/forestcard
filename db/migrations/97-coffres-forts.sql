-- 97-coffres-forts.sql — Forest Card
-- Mini-jeu « Les coffres-forts » (Lore > Événements) : trois coffres communs à toute la communauté (bleu,
-- violet, légendaire), à percer avec des foreuses achetées en gold (1000 par défaut, sans limite). Chaque foreuse
-- posée fait un trou définitif dans la porte (position tirée par la base). À sa dernière foreuse (20, 55, 100 par
-- défaut), le coffre s'ouvre : les cartes que l'admin y a rangées (cartes non publiées, gardées secrètes) sont
-- publiées et entrent dans le jeu. Un événement dure une semaine par défaut ; il reste visible 3 jours après la fin.
-- À lancer une fois dans Supabase (SQL Editor), après 96-lueur-ciel.sql ; peut être relancé.

create table if not exists public.coffres_evenements (
  id bigint generated always as identity primary key,
  titre text not null default 'Les coffres-forts',
  debut timestamptz not null default now(),
  fin timestamptz not null default now() + interval '7 days',
  prix integer not null default 1000 check (prix >= 0),
  cree_le timestamptz not null default now()
);

create table if not exists public.coffres (
  id bigint generated always as identity primary key,
  evenement_id bigint not null references public.coffres_evenements(id) on delete cascade,
  rang integer not null,
  nom text not null,
  teinte text not null check (teinte in ('bleu', 'violet', 'or')),
  requis integer not null check (requis > 0),
  ouvert_le timestamptz,
  unique (evenement_id, rang)
);

-- Le butin d'un coffre : secret jusqu'à l'ouverture (admin seulement).
create table if not exists public.coffres_cartes (
  coffre_id bigint not null references public.coffres(id) on delete cascade,
  carte_id integer not null references public.cartes(id) on delete cascade,
  primary key (coffre_id, carte_id)
);

-- Les foreuses achetées et pas encore posées, par joueur et par événement.
create table if not exists public.coffres_stock (
  evenement_id bigint not null references public.coffres_evenements(id) on delete cascade,
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  foreuses integer not null default 0 check (foreuses >= 0),
  achetees integer not null default 0,
  primary key (evenement_id, joueur_id)
);

-- Chaque foreuse posée : un trou dans la porte, pour toujours (x, y : position sur la porte, 0 à 1 ; angle :
-- sens de la foreuse, en degrés).
create table if not exists public.coffres_trous (
  id bigint generated always as identity primary key,
  coffre_id bigint not null references public.coffres(id) on delete cascade,
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  x real not null,
  y real not null,
  angle real not null,
  pose_le timestamptz not null default now()
);
create index if not exists coffres_trous_coffre_idx on public.coffres_trous (coffre_id);

alter table public.coffres_evenements enable row level security;
alter table public.coffres enable row level security;
alter table public.coffres_cartes enable row level security;
alter table public.coffres_stock enable row level security;
alter table public.coffres_trous enable row level security;
revoke all on public.coffres_evenements, public.coffres, public.coffres_cartes, public.coffres_stock,
  public.coffres_trous from public, anon, authenticated;

-- L'événement à montrer : le dernier commencé, jusqu'à 3 jours après sa fin.
create or replace function public._coffres_courant()
returns public.coffres_evenements language sql stable security definer set search_path = public as $$
  select * from public.coffres_evenements
  where debut <= now() and fin > now() - interval '3 days'
  order by debut desc limit 1;
$$;
revoke all on function public._coffres_courant() from public, anon, authenticated;

-- L'état du jeu pour le joueur connecté (ou un visiteur) : null s'il n'y a pas d'événement.
create or replace function public.coffres_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ev public.coffres_evenements; moi uuid := auth.uid();
begin
  select * into ev from public._coffres_courant();
  if ev.id is null then return null; end if;
  return jsonb_build_object(
    'id', ev.id, 'titre', ev.titre, 'debut', ev.debut, 'fin', ev.fin, 'prix', ev.prix,
    'termine', ev.fin <= now(),
    'monnaie', (select monnaie from public.joueurs where id = moi),
    'stock', coalesce((select foreuses from public.coffres_stock where evenement_id = ev.id and joueur_id = moi), 0),
    'coffres', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'rang', c.rang, 'nom', c.nom, 'teinte', c.teinte, 'ouvert_le', c.ouvert_le, -- requis : secret
        'trous', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'x', t.x, 'y', t.y, 'angle', t.angle,
            'moi', t.joueur_id = moi) order by t.id) from public.coffres_trous t where t.coffre_id = c.id), '[]'::jsonb),
        -- le butin n'est montré qu'une fois le coffre ouvert
        'cartes', case when c.ouvert_le is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
            'id', ca.id, 'nom', btrim(ca.nom), 'type', ca.type, 'rarete', r.nom, 'couleur', r.couleur,
            'image', (select v.image_path from public.variantes_carte v where v.carte_id = ca.id and v.image_path is not null
                      order by (upper(btrim(v.nom)) = 'STANDARD') desc, v.id limit 1))
            order by ca.nom) from public.coffres_cartes cc join public.cartes ca on ca.id = cc.carte_id
            left join public.raretes r on r.id = ca.rarete_id where cc.coffre_id = c.id), '[]'::jsonb) end
      ) order by c.rang) from public.coffres c where c.evenement_id = ev.id), '[]'::jsonb),
    'perceurs', coalesce((select jsonb_agg(x order by (x->>'foreuses')::int desc) from (
        select jsonb_build_object('pseudo', j.pseudo, 'foreuses', count(*)) as x
        from public.coffres_trous t join public.coffres c on c.id = t.coffre_id join public.joueurs j on j.id = t.joueur_id
        where c.evenement_id = ev.id group by j.pseudo order by count(*) desc limit 5) s), '[]'::jsonb),
    'mes_foreuses', (select count(*) from public.coffres_trous t join public.coffres c on c.id = t.coffre_id
                     where c.evenement_id = ev.id and t.joueur_id = moi)
  );
end $$;
grant execute on function public.coffres_etat() to anon, authenticated;

-- Acheter des foreuses (sans limite). Refus : NON_CONNECTE, AUCUN_EVENEMENT, EVENEMENT_TERMINE, QUANTITE,
-- GOLD_INSUFFISANT.
create or replace function public.coffres_acheter(p_n integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev public.coffres_evenements; j public.joueurs; total integer;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into ev from public._coffres_courant();
  if ev.id is null then raise exception 'AUCUN_EVENEMENT'; end if;
  if ev.fin <= now() then raise exception 'EVENEMENT_TERMINE'; end if;
  if p_n is null or p_n < 1 or p_n > 100 then raise exception 'QUANTITE'; end if;
  total := p_n * ev.prix;
  select * into j from public.joueurs where id = auth.uid() for update;
  if coalesce(j.monnaie, 0) < total then raise exception 'GOLD_INSUFFISANT'; end if;
  update public.joueurs set monnaie = monnaie - total where id = j.id;
  insert into public.coffres_stock (evenement_id, joueur_id, foreuses, achetees) values (ev.id, j.id, p_n, p_n)
  on conflict (evenement_id, joueur_id) do update
    set foreuses = coffres_stock.foreuses + excluded.foreuses, achetees = coffres_stock.achetees + excluded.achetees;
  return jsonb_build_object('monnaie', j.monnaie - total,
    'stock', (select foreuses from public.coffres_stock where evenement_id = ev.id and joueur_id = j.id));
end $$;
grant execute on function public.coffres_acheter(integer) to authenticated;

-- Poser des foreuses sur un coffre (p_n d'un coup, au plus ce qu'il reste à percer). Chaque foreuse fait un trou
-- à une place tirée au hasard sur la porte, hors de la roue centrale. À la dernière, le coffre s'ouvre et ses cartes
-- sont publiées. Un coffre sans butin s'arrête à une foreuse de céder (COFFRE_EN_ATTENTE) jusqu'à ce que l'admin
-- range ses cartes. Refus : NON_CONNECTE, COFFRE_INCONNU, EVENEMENT_TERMINE, COFFRE_OUVERT, PAS_DE_FOREUSE.
create or replace function public.coffres_percer(p_coffre bigint, p_n integer default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.coffres; ev public.coffres_evenements; stock integer; poses integer; n integer; i integer;
        r real; a real; trous jsonb := '[]'::jsonb; t record; ouvert boolean := false;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into c from public.coffres where id = p_coffre for update;
  if c.id is null then raise exception 'COFFRE_INCONNU'; end if;
  select * into ev from public.coffres_evenements where id = c.evenement_id;
  if ev.fin <= now() or ev.debut > now() then raise exception 'EVENEMENT_TERMINE'; end if;
  if c.ouvert_le is not null then raise exception 'COFFRE_OUVERT'; end if;
  select foreuses into stock from public.coffres_stock where evenement_id = ev.id and joueur_id = auth.uid() for update;
  if coalesce(stock, 0) < 1 then raise exception 'PAS_DE_FOREUSE'; end if;
  select count(*) into poses from public.coffres_trous where coffre_id = c.id;
  n := least(greatest(coalesce(p_n, 1), 1), stock, c.requis - poses);
  -- sans butin rangé par l'admin, le coffre s'arrête à une foreuse de céder
  if not exists (select 1 from public.coffres_cartes where coffre_id = c.id) then
    n := least(n, c.requis - poses - 1);
    if n < 1 then raise exception 'COFFRE_EN_ATTENTE'; end if;
  end if;
  for i in 1..n loop
    r := 0.2 + random() * 0.2;            -- entre la roue centrale et le bord de la porte
    a := random() * 2 * pi();
    insert into public.coffres_trous (coffre_id, joueur_id, x, y, angle)
    values (c.id, auth.uid(), 0.5 + r * cos(a), 0.5 + r * sin(a), degrees(a))
    returning id, x, y, angle into t;
    trous := trous || jsonb_build_object('id', t.id, 'x', t.x, 'y', t.y, 'angle', t.angle, 'moi', true);
  end loop;
  update public.coffres_stock set foreuses = foreuses - n where evenement_id = ev.id and joueur_id = auth.uid();
  if poses + n >= c.requis then
    update public.coffres set ouvert_le = now() where id = c.id;
    update public.cartes set actif = true where id in (select carte_id from public.coffres_cartes where coffre_id = c.id);
    ouvert := true;
  end if;
  return jsonb_build_object('trous', trous, 'ouvert', ouvert, 'stock', stock - n);
end $$;
grant execute on function public.coffres_percer(bigint, integer) to authenticated;

-- ── Admin ──

-- Un nouvel événement et ses trois coffres (bleu 20, violet 55, légendaire 100 foreuses par défaut).
create or replace function public.admin_coffres_creer(p_titre text, p_fin timestamptz, p_prix integer,
  p_bleu integer default 20, p_violet integer default 55, p_or integer default 100)
returns bigint language plpgsql security definer set search_path = public as $$
declare ev bigint;
begin
  if not public.is_admin() then raise exception 'ADMIN'; end if;
  insert into public.coffres_evenements (titre, fin, prix)
  values (coalesce(nullif(btrim(p_titre), ''), 'Les coffres-forts'), coalesce(p_fin, now() + interval '7 days'),
          coalesce(p_prix, 1000))
  returning id into ev;
  insert into public.coffres (evenement_id, rang, nom, teinte, requis) values
    (ev, 1, 'Coffre bleu', 'bleu', greatest(coalesce(p_bleu, 20), 1)),
    (ev, 2, 'Coffre violet', 'violet', greatest(coalesce(p_violet, 55), 1)),
    (ev, 3, 'Coffre légendaire', 'or', greatest(coalesce(p_or, 100), 1));
  return ev;
end $$;
grant execute on function public.admin_coffres_creer(text, timestamptz, integer, integer, integer, integer) to authenticated;

-- Le butin d'un coffre (remplace l'ancien) : tant qu'il est fermé.
create or replace function public.admin_coffres_cartes(p_coffre bigint, p_cartes integer[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN'; end if;
  if exists (select 1 from public.coffres where id = p_coffre and ouvert_le is not null) then
    raise exception 'COFFRE_OUVERT';
  end if;
  delete from public.coffres_cartes where coffre_id = p_coffre;
  insert into public.coffres_cartes (coffre_id, carte_id)
  select p_coffre, x from unnest(coalesce(p_cartes, '{}')) x on conflict do nothing;
end $$;
grant execute on function public.admin_coffres_cartes(bigint, integer[]) to authenticated;

-- La fin d'un événement, changée.
create or replace function public.admin_coffres_fin(p_id bigint, p_fin timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN'; end if;
  update public.coffres_evenements set fin = p_fin where id = p_id;
end $$;
grant execute on function public.admin_coffres_fin(bigint, timestamptz) to authenticated;

-- Supprimer un événement (ses coffres, trous et stocks ; les cartes publiées restent publiées).
create or replace function public.admin_coffres_supprimer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN'; end if;
  delete from public.coffres_evenements where id = p_id;
end $$;
grant execute on function public.admin_coffres_supprimer(bigint) to authenticated;

-- Tous les événements, avec le butin de chaque coffre (admin).
create or replace function public.admin_coffres_liste()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', ev.id, 'titre', ev.titre, 'debut', ev.debut, 'fin', ev.fin, 'prix', ev.prix,
      'coffres', (select jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.nom, 'teinte', c.teinte, 'requis', c.requis,
          'ouvert_le', c.ouvert_le, 'poses', (select count(*) from public.coffres_trous t where t.coffre_id = c.id),
          'cartes', coalesce((select jsonb_agg(cc.carte_id) from public.coffres_cartes cc where cc.coffre_id = c.id), '[]'::jsonb))
        order by c.rang) from public.coffres c where c.evenement_id = ev.id)
    ) order by ev.debut desc) from public.coffres_evenements ev), '[]'::jsonb);
end $$;
grant execute on function public.admin_coffres_liste() to authenticated;
