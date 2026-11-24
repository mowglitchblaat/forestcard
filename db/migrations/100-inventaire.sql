-- 100-inventaire.sql — Forest Card
-- L'inventaire du joueur (onglet Inventaire) et les mini-coffres.
--   - inventaire : les objets qu'un joueur garde, par objet et quantité. Pour commencer les foreuses et les
--     Perce-Abîme : achetées en gold seulement pendant un événement des coffres-forts (97, 98), elles restent
--     ensuite dans l'inventaire, utilisables sur les coffres de l'événement comme sur les mini-coffres. Les
--     foreuses pas encore posées (coffres_stock) y passent une fois pour toutes.
--   - inventaire_coffres : les mini-coffres d'un joueur (bleu, violet, légendaire), donnés par l'admin. Chacun a sa
--     défense, tirée à sa création entre deux valeurs (réglages) et gardée secrète. Il se perce comme les coffres
--     de l'événement (une foreuse : un trou ; une Perce-Abîme : puissance_giga trous, 7 par défaut) ; à sa
--     dernière foreuse il s'ouvre et donne son butin, tiré au hasard selon sa couleur. Il reste dans l'inventaire
--     tant qu'il n'est pas ouvert.
--   - coffres_butin_reglages, coffres_butin : par couleur, la défense (min, max), le nombre de tirages et les
--     chances de carte ; les lots possibles (gold, fragments, fragments épiques, légendaires, GGEZ, booster,
--     foreuse, Perce-Abîme) avec leur poids et leur quantité. Réglés dans Admin > Cadeaux.
--     Carte : de la rareté du coffre (bleu : rare, violet : épique, légendaire : légendaire), une version tirée
--     selon son poids, parmi les cartes publiées des collections sorties. GGEZ : seulement dans le légendaire.
-- À lancer une fois dans Supabase (SQL Editor), après 99-eclair-absorbe.sql ; peut être relancé.

-- ── L'inventaire ──

create table if not exists public.inventaire (
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  objet text not null check (objet in ('foreuse', 'perce_abime')),
  quantite integer not null default 0 check (quantite >= 0),
  primary key (joueur_id, objet)
);
alter table public.inventaire enable row level security;
revoke all on public.inventaire from public, anon, authenticated;

create or replace function public._inventaire_ajouter(p_joueur uuid, p_objet text, p_n integer)
returns void language sql security definer set search_path = public as $$
  insert into public.inventaire (joueur_id, objet, quantite) values (p_joueur, p_objet, greatest(p_n, 0))
  on conflict (joueur_id, objet) do update set quantite = public.inventaire.quantite + excluded.quantite;
$$;
revoke all on function public._inventaire_ajouter(uuid, text, integer) from public, anon, authenticated;

create or replace function public._inventaire_quantite(p_joueur uuid, p_objet text)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select quantite from public.inventaire where joueur_id = p_joueur and objet = p_objet), 0);
$$;
revoke all on function public._inventaire_quantite(uuid, text) from public, anon, authenticated;

-- Les foreuses pas encore posées passent dans l'inventaire (une fois : le stock de l'événement est remis à 0).
insert into public.inventaire (joueur_id, objet, quantite)
select joueur_id, 'foreuse', sum(foreuses) from public.coffres_stock group by joueur_id having sum(foreuses) > 0
on conflict (joueur_id, objet) do update set quantite = public.inventaire.quantite + excluded.quantite;
insert into public.inventaire (joueur_id, objet, quantite)
select joueur_id, 'perce_abime', sum(giga) from public.coffres_stock group by joueur_id having sum(giga) > 0
on conflict (joueur_id, objet) do update set quantite = public.inventaire.quantite + excluded.quantite;
update public.coffres_stock set foreuses = 0, giga = 0 where foreuses > 0 or giga > 0;

-- ── L'événement des coffres-forts : ses foreuses vont dans l'inventaire ──

create or replace function public.coffres_acheter(p_n integer, p_giga boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev public.coffres_evenements; j public.joueurs; total integer;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into ev from public._coffres_courant();
  if ev.id is null then raise exception 'AUCUN_EVENEMENT'; end if;
  if ev.fin <= now() then raise exception 'EVENEMENT_TERMINE'; end if;
  if p_n is null or p_n < 1 or p_n > 100 then raise exception 'QUANTITE'; end if;
  total := p_n * case when p_giga then ev.prix_giga else ev.prix end;
  select * into j from public.joueurs where id = auth.uid() for update;
  if coalesce(j.monnaie, 0) < total then raise exception 'GOLD_INSUFFISANT'; end if;
  update public.joueurs set monnaie = monnaie - total where id = j.id;
  perform public._inventaire_ajouter(j.id, case when p_giga then 'perce_abime' else 'foreuse' end, p_n);
  -- ce que le joueur a acheté pendant l'événement (le stock lui-même est dans l'inventaire)
  insert into public.coffres_stock (evenement_id, joueur_id, foreuses, achetees, giga)
  values (ev.id, j.id, 0, case when p_giga then 0 else p_n end, 0)
  on conflict (evenement_id, joueur_id) do update set achetees = coffres_stock.achetees + excluded.achetees;
  return jsonb_build_object('monnaie', j.monnaie - total);
end $$;
grant execute on function public.coffres_acheter(integer, boolean) to authenticated;

create or replace function public.coffres_percer(p_coffre bigint, p_n integer default 1, p_giga boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.coffres; ev public.coffres_evenements; stock integer; poses integer; n integer; i integer;
        w integer; r real; a real; trous jsonb := '[]'::jsonb; t record; ouvert boolean := false;
        obj text := case when p_giga then 'perce_abime' else 'foreuse' end;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into c from public.coffres where id = p_coffre for update;
  if c.id is null then raise exception 'COFFRE_INCONNU'; end if;
  select * into ev from public.coffres_evenements where id = c.evenement_id;
  if ev.fin <= now() or ev.debut > now() then raise exception 'EVENEMENT_TERMINE'; end if;
  if c.ouvert_le is not null then raise exception 'COFFRE_OUVERT'; end if;
  select quantite into stock from public.inventaire where joueur_id = auth.uid() and objet = obj for update;
  if coalesce(stock, 0) < 1 then
    raise exception '%', case when p_giga then 'PAS_DE_GIGA' else 'PAS_DE_FOREUSE' end;
  end if;
  w := case when p_giga then greatest(ev.puissance_giga, 1) else 1 end;
  select coalesce(sum(tr.poids), 0) into poses from public.coffres_trous tr where tr.coffre_id = c.id;
  n := least(greatest(coalesce(p_n, 1), 1), stock, ceil((c.requis - poses)::numeric / w)::integer);
  for i in 1..n loop
    r := case when p_giga then 0.24 + random() * 0.1 else 0.2 + random() * 0.2 end;
    a := random() * 2 * pi();
    insert into public.coffres_trous (coffre_id, joueur_id, x, y, angle, poids)
    values (c.id, auth.uid(), 0.5 + r * cos(a), 0.5 + r * sin(a), degrees(a), w)
    returning id, x, y, angle into t;
    trous := trous || jsonb_build_object('id', t.id, 'x', t.x, 'y', t.y, 'angle', t.angle, 'moi', true, 'poids', w);
  end loop;
  update public.inventaire set quantite = quantite - n where joueur_id = auth.uid() and objet = obj;
  if poses + n * w >= c.requis then
    update public.coffres set ouvert_le = now() where id = c.id;
    ouvert := true;
  end if;
  return jsonb_build_object('trous', trous, 'ouvert', ouvert);
end $$;
grant execute on function public.coffres_percer(bigint, integer, boolean) to authenticated;

-- L'état de l'événement : son stock (stock, stock_giga) est celui de l'inventaire.
create or replace function public.coffres_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ev public.coffres_evenements; moi uuid := auth.uid();
begin
  select * into ev from public._coffres_courant();
  if ev.id is null then return null; end if;
  return jsonb_build_object(
    'id', ev.id, 'titre', ev.titre, 'debut', ev.debut, 'fin', ev.fin, 'prix', ev.prix,
    'prix_giga', ev.prix_giga, 'puissance_giga', ev.puissance_giga,
    'termine', ev.fin <= now(),
    'monnaie', (select monnaie from public.joueurs where id = moi),
    'stock', public._inventaire_quantite(moi, 'foreuse'),
    'stock_giga', public._inventaire_quantite(moi, 'perce_abime'),
    'coffres', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'rang', c.rang, 'nom', c.nom, 'teinte', c.teinte, 'ouvert_le', c.ouvert_le, -- requis : secret
        'trous', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'x', t.x, 'y', t.y, 'angle', t.angle,
            'moi', t.joueur_id = moi, 'poids', t.poids) order by t.id) from public.coffres_trous t where t.coffre_id = c.id),
            '[]'::jsonb),
        'tresor', case when c.ouvert_le is null then null
                  else jsonb_build_object('nb', c.nb_cartes, 'rarete', c.rarete) end,
        'cartes', '[]'::jsonb
      ) order by c.rang) from public.coffres c where c.evenement_id = ev.id), '[]'::jsonb),
    'perceurs', coalesce((select jsonb_agg(x order by (x->>'foreuses')::int desc) from (
        select jsonb_build_object('pseudo', j.pseudo, 'foreuses', sum(t.poids)) as x
        from public.coffres_trous t join public.coffres c on c.id = t.coffre_id join public.joueurs j on j.id = t.joueur_id
        where c.evenement_id = ev.id group by j.pseudo order by sum(t.poids) desc limit 5) s), '[]'::jsonb),
    'mes_foreuses', (select coalesce(sum(t.poids), 0) from public.coffres_trous t join public.coffres c on c.id = t.coffre_id
                     where c.evenement_id = ev.id and t.joueur_id = moi)
  );
end $$;
grant execute on function public.coffres_etat() to anon, authenticated;

-- ── Les mini-coffres ──

create table if not exists public.coffres_butin_reglages (
  teinte text primary key check (teinte in ('bleu', 'violet', 'or')),
  defense_min integer not null check (defense_min > 0),
  defense_max integer not null check (defense_max > 0),
  tirages integer not null default 2 check (tirages between 1 and 10),
  chance_carte numeric not null default 0 check (chance_carte between 0 and 100),   -- % par ouverture
  chance_ggez numeric not null default 0 check (chance_ggez between 0 and 100)      -- % par ouverture (légendaire)
);
insert into public.coffres_butin_reglages (teinte, defense_min, defense_max, tirages, chance_carte, chance_ggez) values
  ('bleu', 8, 12, 2, 10, 0),
  ('violet', 22, 42, 3, 2, 0),
  ('or', 32, 62, 4, 0.5, 0.1)
on conflict (teinte) do nothing;

create table if not exists public.coffres_butin (
  id bigint generated always as identity primary key,
  teinte text not null check (teinte in ('bleu', 'violet', 'or')),
  objet text not null check (objet in ('gold', 'fragments', 'fragments_epique', 'fragments_legendaire',
    'fragments_ggez', 'booster', 'foreuse', 'perce_abime')),
  poids integer not null check (poids > 0),
  min integer not null check (min > 0),
  max integer not null check (max > 0)
);
-- Les lots par défaut, la première fois seulement.
insert into public.coffres_butin (teinte, objet, poids, min, max)
select * from (values
  ('bleu', 'gold', 40, 300, 900), ('bleu', 'fragments', 30, 20, 60), ('bleu', 'fragments_epique', 12, 5, 15),
  ('bleu', 'booster', 10, 1, 1), ('bleu', 'foreuse', 8, 1, 2),
  ('violet', 'gold', 35, 800, 2000), ('violet', 'fragments', 20, 50, 120), ('violet', 'fragments_epique', 20, 20, 50),
  ('violet', 'fragments_legendaire', 8, 5, 15), ('violet', 'booster', 10, 1, 2), ('violet', 'foreuse', 6, 2, 4),
  ('violet', 'perce_abime', 1, 1, 1),
  ('or', 'gold', 30, 2000, 5000), ('or', 'fragments', 15, 100, 250), ('or', 'fragments_epique', 15, 40, 100),
  ('or', 'fragments_legendaire', 15, 20, 60), ('or', 'fragments_ggez', 3, 5, 15), ('or', 'booster', 10, 2, 3),
  ('or', 'foreuse', 8, 3, 6), ('or', 'perce_abime', 4, 1, 1)
) v(teinte, objet, poids, min, max)
where not exists (select 1 from public.coffres_butin);

create table if not exists public.inventaire_coffres (
  id bigint generated always as identity primary key,
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  teinte text not null check (teinte in ('bleu', 'violet', 'or')),
  defense integer not null check (defense > 0),   -- secret : les foreuses qu'il faut
  origine text,                                   -- le mot de l'admin, montré au joueur
  cree_le timestamptz not null default now(),
  ouvert_le timestamptz,
  butin jsonb
);
create index if not exists inventaire_coffres_joueur_idx on public.inventaire_coffres (joueur_id);

create table if not exists public.inventaire_coffres_trous (
  id bigint generated always as identity primary key,
  coffre_id bigint not null references public.inventaire_coffres(id) on delete cascade,
  x real not null,
  y real not null,
  angle real not null,
  poids integer not null default 1,
  pose_le timestamptz not null default now()
);
create index if not exists inventaire_coffres_trous_idx on public.inventaire_coffres_trous (coffre_id);

alter table public.coffres_butin_reglages enable row level security;
alter table public.coffres_butin enable row level security;
alter table public.inventaire_coffres enable row level security;
alter table public.inventaire_coffres_trous enable row level security;
revoke all on public.coffres_butin_reglages, public.coffres_butin, public.inventaire_coffres,
  public.inventaire_coffres_trous from public, anon, authenticated;

-- Un mini-coffre donné à un joueur : sa défense tirée entre les bornes de sa couleur.
create or replace function public._inventaire_coffre_creer(p_joueur uuid, p_teinte text, p_origine text)
returns bigint language plpgsql security definer set search_path = public as $$
declare r public.coffres_butin_reglages; nouveau bigint;
begin
  select * into r from public.coffres_butin_reglages where teinte = p_teinte;
  if r.teinte is null then raise exception 'COULEUR'; end if;
  insert into public.inventaire_coffres (joueur_id, teinte, defense, origine)
  values (p_joueur, p_teinte,
          least(r.defense_min, r.defense_max) + floor(random() * (abs(r.defense_max - r.defense_min) + 1))::integer,
          nullif(btrim(coalesce(p_origine, '')), ''))
  returning inventaire_coffres.id into nouveau;
  return nouveau;
end $$;
revoke all on function public._inventaire_coffre_creer(uuid, text, text) from public, anon, authenticated;

-- Une carte au hasard d'une rareté (nom de la table raretes), parmi les cartes publiées des collections sorties
-- (ou sans collection) ; sa version tirée selon son poids. Rend la version, ou null.
create or replace function public._carte_au_hasard(p_rarete text)
returns integer language sql volatile security definer set search_path = public as $$
  with cartes_ok as (
    select c.id from public.cartes c
    join public.raretes r on r.id = c.rarete_id
    left join public.collections k on k.id = c.collection_id
    where c.actif and lower(r.nom) = lower(p_rarete) and (c.collection_id is null or k.active)
    order by random() limit 1
  ), versions as (
    select v.id, greatest(coalesce(nullif(v.poids::text, '')::numeric, 100), 0.0001) as w
    from public.variantes_carte v join cartes_ok c on c.id = v.carte_id
  )
  select id from versions order by -ln(greatest(random(), 1e-9)) / w limit 1;
$$;
revoke all on function public._carte_au_hasard(text) from public, anon, authenticated;

-- Le butin d'un coffre de cette couleur, donné au joueur ; rend la liste des lots.
create or replace function public._coffre_butin(p_joueur uuid, p_teinte text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.coffres_butin_reglages; total integer; tir integer; lot public.coffres_butin; n integer;
        out jsonb := '[]'::jsonb; b record; var integer; rarete text;
begin
  select * into r from public.coffres_butin_reglages where teinte = p_teinte;
  select coalesce(sum(poids), 0) into total from public.coffres_butin where teinte = p_teinte;
  for i in 1..coalesce(r.tirages, 1) loop
    exit when total <= 0;
    tir := floor(random() * total)::integer;
    for lot in select * from public.coffres_butin where teinte = p_teinte order by id loop
      tir := tir - lot.poids;
      if tir < 0 then exit; end if;
    end loop;
    n := least(lot.min, lot.max) + floor(random() * (abs(lot.max - lot.min) + 1))::integer;
    case lot.objet
      when 'gold' then
        update public.joueurs set monnaie = coalesce(monnaie, 0) + n where id = p_joueur;
        out := out || jsonb_build_object('objet', 'gold', 'n', n);
      when 'fragments' then
        update public.joueurs set fragments = coalesce(fragments, 0) + n where id = p_joueur;
        out := out || jsonb_build_object('objet', 'fragments', 'n', n);
      when 'fragments_epique' then
        update public.joueurs set fragments_epique = coalesce(fragments_epique, 0) + n where id = p_joueur;
        out := out || jsonb_build_object('objet', 'fragments_epique', 'n', n);
      when 'fragments_legendaire' then
        update public.joueurs set fragments_legendaire = coalesce(fragments_legendaire, 0) + n where id = p_joueur;
        out := out || jsonb_build_object('objet', 'fragments_legendaire', 'n', n);
      when 'fragments_ggez' then
        update public.joueurs set fragments_ggez = coalesce(fragments_ggez, 0) + n where id = p_joueur;
        out := out || jsonb_build_object('objet', 'fragments_ggez', 'n', n);
      when 'booster' then
        -- un booster de la boutique, au hasard
        select t.id, t.nom, t.image_path into b from public.types_boosters t where t.actif order by random() limit 1;
        if b.id is not null then
          insert into public.stock_boosters (joueur_id, type_id, quantite) values (p_joueur, b.id, n)
          on conflict (joueur_id, type_id) do update set quantite = public.stock_boosters.quantite + excluded.quantite;
          out := out || jsonb_build_object('objet', 'booster', 'n', n, 'nom', b.nom, 'image', b.image_path);
        end if;
      else  -- foreuse, perce_abime
        perform public._inventaire_ajouter(p_joueur, lot.objet, n);
        out := out || jsonb_build_object('objet', lot.objet, 'n', n);
    end case;
  end loop;
  -- la carte de sa couleur, rare ; la GGEZ, plus rare encore, seulement dans le légendaire
  rarete := case when p_teinte = 'or' and random() * 100 < r.chance_ggez then 'GGEZ'
                 when random() * 100 < r.chance_carte then
                   case p_teinte when 'bleu' then 'Rare' when 'violet' then 'Epique' else 'Légendaire' end
            end;
  if rarete is not null then
    var := public._carte_au_hasard(rarete);
    if var is not null then
      insert into public.collection_joueur (joueur_id, variante_id, quantite) values (p_joueur, var, 1)
      on conflict (joueur_id, variante_id) do update set quantite = public.collection_joueur.quantite + 1;
      out := out || (select jsonb_build_object('objet', 'carte', 'n', 1, 'variante_id', v.id, 'nom', c.nom,
          'version', v.nom, 'image', v.image_path, 'rarete', ra.nom, 'couleur', ra.couleur)
        from public.variantes_carte v join public.cartes c on c.id = v.carte_id
        left join public.raretes ra on ra.id = c.rarete_id where v.id = var);
    end if;
  end if;
  return out;
end $$;
revoke all on function public._coffre_butin(uuid, text) from public, anon, authenticated;

-- L'inventaire du joueur connecté : ses boosters, son gold et ses fragments, ses objets, ses mini-coffres
-- (fermés, et les 12 derniers ouverts avec leur butin). La défense des coffres reste secrète.
create or replace function public.inventaire_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare moi uuid := auth.uid(); j public.joueurs;
begin
  if moi is null then return null; end if;
  select * into j from public.joueurs where id = moi;
  return jsonb_build_object(
    'monnaie', coalesce(j.monnaie, 0),
    'fragments', coalesce(j.fragments, 0),
    'fragments_epique', coalesce(j.fragments_epique, 0),
    'fragments_legendaire', coalesce(j.fragments_legendaire, 0),
    'fragments_ggez', coalesce(j.fragments_ggez, 0),
    'puissance_giga', coalesce((select ev.puissance_giga from public.coffres_evenements ev order by ev.debut desc limit 1), 7),
    'boosters', coalesce((select jsonb_agg(jsonb_build_object('type_id', s.type_id, 'nom', t.nom,
        'image', t.image_path, 'nb_cartes', t.nb_cartes, 'quantite', s.quantite) order by t.nom)
      from public.stock_boosters s join public.types_boosters t on t.id = s.type_id
      where s.joueur_id = moi and s.quantite > 0), '[]'::jsonb),
    'objets', jsonb_build_object(
      'foreuse', public._inventaire_quantite(moi, 'foreuse'),
      'perce_abime', public._inventaire_quantite(moi, 'perce_abime')),
    'coffres', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'teinte', c.teinte, 'origine', c.origine,
        'cree_le', c.cree_le, 'ouvert_le', c.ouvert_le, 'butin', c.butin,
        'trous', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'x', t.x, 'y', t.y, 'angle', t.angle,
            'moi', true, 'poids', t.poids) order by t.id) from public.inventaire_coffres_trous t where t.coffre_id = c.id),
            '[]'::jsonb)
      ) order by c.ouvert_le is not null, c.ouvert_le desc, c.cree_le) from (
        select * from public.inventaire_coffres where joueur_id = moi and ouvert_le is null
        union all
        (select * from public.inventaire_coffres where joueur_id = moi and ouvert_le is not null
         order by ouvert_le desc limit 12)
      ) c), '[]'::jsonb)
  );
end $$;
grant execute on function public.inventaire_etat() to authenticated;

-- Percer un de ses mini-coffres (p_n foreuses d'un coup, ou une Perce-Abîme). À la dernière foreuse il s'ouvre et
-- donne son butin. Refus : NON_CONNECTE, COFFRE_INCONNU, COFFRE_OUVERT, PAS_DE_FOREUSE, PAS_DE_GIGA.
create or replace function public.inventaire_percer(p_coffre bigint, p_n integer default 1, p_giga boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.inventaire_coffres; stock integer; poses integer; n integer; w integer; r real; a real;
        trous jsonb := '[]'::jsonb; t record; gain jsonb := null;
        obj text := case when p_giga then 'perce_abime' else 'foreuse' end;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into c from public.inventaire_coffres where id = p_coffre and joueur_id = auth.uid() for update;
  if c.id is null then raise exception 'COFFRE_INCONNU'; end if;
  if c.ouvert_le is not null then raise exception 'COFFRE_OUVERT'; end if;
  select quantite into stock from public.inventaire where joueur_id = auth.uid() and objet = obj for update;
  if coalesce(stock, 0) < 1 then
    raise exception '%', case when p_giga then 'PAS_DE_GIGA' else 'PAS_DE_FOREUSE' end;
  end if;
  w := case when p_giga then greatest(coalesce((select ev.puissance_giga from public.coffres_evenements ev
                                                order by ev.debut desc limit 1), 7), 1) else 1 end;
  select coalesce(sum(tr.poids), 0) into poses from public.inventaire_coffres_trous tr where tr.coffre_id = c.id;
  n := least(greatest(coalesce(p_n, 1), 1), stock, ceil((c.defense - poses)::numeric / w)::integer);
  for i in 1..n loop
    r := case when p_giga then 0.24 + random() * 0.1 else 0.2 + random() * 0.2 end;
    a := random() * 2 * pi();
    insert into public.inventaire_coffres_trous (coffre_id, x, y, angle, poids)
    values (c.id, 0.5 + r * cos(a), 0.5 + r * sin(a), degrees(a), w)
    returning id, x, y, angle into t;
    trous := trous || jsonb_build_object('id', t.id, 'x', t.x, 'y', t.y, 'angle', t.angle, 'moi', true, 'poids', w);
  end loop;
  update public.inventaire set quantite = quantite - n where joueur_id = auth.uid() and objet = obj;
  if poses + n * w >= c.defense then
    gain := public._coffre_butin(auth.uid(), c.teinte);
    update public.inventaire_coffres set ouvert_le = now(), butin = gain where id = c.id;
  end if;
  return jsonb_build_object('trous', trous, 'ouvert', gain is not null, 'butin', gain);
end $$;
grant execute on function public.inventaire_percer(bigint, integer, boolean) to authenticated;

-- ── Admin ──

-- Donner p_n mini-coffres d'une couleur à un joueur (p_joueur nul : à tous), avec un mot facultatif.
-- Rend le nombre de coffres donnés.
create or replace function public.admin_inventaire_coffres_donner(p_joueur uuid, p_teinte text, p_n integer,
  p_origine text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare j record; k integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN'; end if;
  if p_n is null or p_n < 1 or p_n > 50 then raise exception 'QUANTITE'; end if;
  for j in select id from public.joueurs where p_joueur is null or id = p_joueur loop
    for i in 1..p_n loop
      perform public._inventaire_coffre_creer(j.id, p_teinte, p_origine);
      k := k + 1;
    end loop;
  end loop;
  return k;
end $$;
grant execute on function public.admin_inventaire_coffres_donner(uuid, text, integer, text) to authenticated;

-- Donner des foreuses ou des Perce-Abîme (p_joueur nul : à tous). Rend le nombre de joueurs servis.
create or replace function public.admin_inventaire_objets_donner(p_joueur uuid, p_objet text, p_n integer)
returns integer language plpgsql security definer set search_path = public as $$
declare j record; k integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN'; end if;
  if p_objet not in ('foreuse', 'perce_abime') then raise exception 'OBJET'; end if;
  if p_n is null or p_n < 1 or p_n > 1000 then raise exception 'QUANTITE'; end if;
  for j in select id from public.joueurs where p_joueur is null or id = p_joueur loop
    perform public._inventaire_ajouter(j.id, p_objet, p_n);
    k := k + 1;
  end loop;
  return k;
end $$;
grant execute on function public.admin_inventaire_objets_donner(uuid, text, integer) to authenticated;

-- Les réglages des mini-coffres, avec ce qui est en jeu (coffres fermés, ouverts).
create or replace function public.admin_coffres_butin()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN'; end if;
  return jsonb_build_object(
    'reglages', (select jsonb_agg(to_jsonb(r) order by array_position(array['bleu', 'violet', 'or'], r.teinte))
                 from public.coffres_butin_reglages r),
    'lots', coalesce((select jsonb_agg(to_jsonb(b) order by array_position(array['bleu', 'violet', 'or'], b.teinte), b.id)
                      from public.coffres_butin b), '[]'::jsonb),
    'fermes', (select count(*) from public.inventaire_coffres where ouvert_le is null),
    'ouverts', (select count(*) from public.inventaire_coffres where ouvert_le is not null)
  );
end $$;
grant execute on function public.admin_coffres_butin() to authenticated;

-- Remplacer les réglages et les lots (p_reglages : [{teinte, defense_min, defense_max, tirages, chance_carte,
-- chance_ggez}], p_lots : [{teinte, objet, poids, min, max}]). Les coffres déjà donnés gardent leur défense.
create or replace function public.admin_coffres_butin_regler(p_reglages jsonb, p_lots jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare x jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_reglages, '[]'::jsonb)) loop
    update public.coffres_butin_reglages set
      defense_min = greatest((x->>'defense_min')::integer, 1),
      defense_max = greatest((x->>'defense_max')::integer, 1),
      tirages = least(greatest((x->>'tirages')::integer, 1), 10),
      chance_carte = least(greatest((x->>'chance_carte')::numeric, 0), 100),
      chance_ggez = least(greatest(coalesce((x->>'chance_ggez')::numeric, 0), 0), 100)
    where teinte = x->>'teinte';
  end loop;
  if p_lots is not null then
    delete from public.coffres_butin where true;
    insert into public.coffres_butin (teinte, objet, poids, min, max)
    select l->>'teinte', l->>'objet', greatest((l->>'poids')::integer, 1), greatest((l->>'min')::integer, 1),
           greatest((l->>'max')::integer, 1)
    from jsonb_array_elements(p_lots) l;
  end if;
end $$;
grant execute on function public.admin_coffres_butin_regler(jsonb, jsonb) to authenticated;
