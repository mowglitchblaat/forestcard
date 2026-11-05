-- 60-lore.sql (a executer une fois dans Supabase, apres 59)
-- L'onglet Lore du site : les chapitres de l'histoire, la carte du monde (une image et ses lieux,
-- chacun lie a une collection) et les evenements.
--
-- Deux sortes d'evenements, ouverts jusqu'a `fin` :
--   - defense : chaque joueur place un de ses combattants. Chance de reussite collective : base_pct,
--     + cle_pct par combattant cle place (chaque cle ne compte qu'une fois), + autre_pct par
--     combattant ni cle ni nuisible, - nuisible_pct par combattant nuisible ; bornee a 0..100.
--   - vote : chaque joueur vote pour une option (une collection, par exemple), chacune avec sa chance
--     de reussite ; l'option la plus votee est envoyee (egalite : la plus forte chance).
-- A la fin, un seul jet decide. Reussite : chaque participant a recompense_pct % de chances de
-- recevoir la carte recompense (une version precise). Echec, ou aucun participant : rien.
-- La resolution se fait au premier passage apres `fin` (evenements_resoudre, appele par le site).

-- ── Chapitres ──
create table if not exists public.lore_chapitres (
  id bigserial primary key,
  titre text not null check (length(btrim(titre)) between 1 and 200),
  texte text not null default '' check (length(texte) <= 20000),
  image_path text,
  ordre integer not null default 0,
  cree_le timestamptz not null default now()
);

-- ── Carte du monde : une image (une seule ligne, id 1) et ses lieux (x, y en % de l'image) ──
create table if not exists public.lore_carte (
  id integer primary key default 1 check (id = 1),
  image_path text
);
create table if not exists public.lore_lieux (
  id bigserial primary key,
  nom text not null check (length(btrim(nom)) between 1 and 120),
  texte text not null default '' check (length(texte) <= 5000),
  image_path text,
  collection_id integer references public.collections(id) on delete set null,
  x numeric not null default 50 check (x between 0 and 100),
  y numeric not null default 50 check (y between 0 and 100)
);

-- ── Evenements ──
create table if not exists public.evenements (
  id bigserial primary key,
  type text not null check (type in ('defense', 'vote')),
  titre text not null check (length(btrim(titre)) between 1 and 200),
  texte text not null default '' check (length(texte) <= 5000),
  image_path text,
  fin timestamptz not null,
  base_pct integer not null default 0,
  cle_pct integer not null default 20,
  autre_pct integer not null default 2,
  nuisible_pct integer not null default 10,
  montrer_cles boolean not null default false,
  recompense_variante_id integer references public.variantes_carte(id) on delete set null,
  recompense_pct integer not null default 40 check (recompense_pct between 0 and 100),
  statut text not null default 'ouvert' check (statut in ('ouvert', 'resolu')),
  reussi boolean,
  chance_finale integer,
  tirage integer,
  option_gagnante bigint,
  resolu_le timestamptz,
  cree_le timestamptz not null default now()
);
create table if not exists public.evenements_combattants (
  evenement_id bigint not null references public.evenements(id) on delete cascade,
  carte_id integer not null references public.cartes(id) on delete cascade,
  role text not null check (role in ('cle', 'nuisible')),
  primary key (evenement_id, carte_id)
);
create table if not exists public.evenements_options (
  id bigserial primary key,
  evenement_id bigint not null references public.evenements(id) on delete cascade,
  libelle text not null check (length(btrim(libelle)) between 1 and 200),
  collection_id integer references public.collections(id) on delete set null,
  image_path text,
  chance integer not null default 50 check (chance between 0 and 100),
  ordre integer not null default 0
);
create table if not exists public.evenements_participations (
  evenement_id bigint not null references public.evenements(id) on delete cascade,
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  carte_id integer references public.cartes(id) on delete cascade,
  option_id bigint references public.evenements_options(id) on delete cascade,
  recompense boolean,
  vu boolean not null default false,
  cree_le timestamptz not null default now(),
  primary key (evenement_id, joueur_id)
);

-- Lus par tous, ecrits par l'admin ; les participations seulement par les fonctions.
do $$
declare t text;
begin
  foreach t in array array['lore_chapitres', 'lore_carte', 'lore_lieux', 'evenements', 'evenements_combattants', 'evenements_options'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_lire', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_lire', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
  end loop;
end $$;
grant usage on sequence public.lore_chapitres_id_seq, public.lore_lieux_id_seq, public.evenements_id_seq, public.evenements_options_id_seq to authenticated;
alter table public.evenements_participations enable row level security;
revoke all on public.evenements_participations from public, anon, authenticated;
-- les combattants cles et nuisibles restent caches tant que l'admin ne les montre pas
drop policy if exists evenements_combattants_lire on public.evenements_combattants;
create policy evenements_combattants_lire on public.evenements_combattants for select to anon, authenticated
  using (public.is_admin() or exists (select 1 from public.evenements e where e.id = evenement_id and (e.montrer_cles or e.statut = 'resolu')));

-- L'option envoyee d'un vote : la plus votee, a egalite la plus forte chance, puis la premiere.
create or replace function public.evenement_option_gagnante(p_id bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select o.id from public.evenements_options o
  left join public.evenements_participations p on p.option_id = o.id
  where o.evenement_id = p_id
  group by o.id, o.chance, o.ordre
  order by count(p.joueur_id) desc, o.chance desc, o.ordre, o.id
  limit 1;
$$;

-- La chance de reussite d'un evenement, avec les participations du moment.
create or replace function public.evenement_chance(p_id bigint)
returns integer language sql stable security definer set search_path = public as $$
  select case e.type
    when 'defense' then greatest(0, least(100,
      e.base_pct
      + e.cle_pct * (select count(distinct p.carte_id) from public.evenements_participations p
          join public.evenements_combattants k on k.evenement_id = e.id and k.carte_id = p.carte_id and k.role = 'cle'
          where p.evenement_id = e.id)
      + e.autre_pct * (select count(*) from public.evenements_participations p
          where p.evenement_id = e.id and p.carte_id is not null
            and not exists (select 1 from public.evenements_combattants k where k.evenement_id = e.id and k.carte_id = p.carte_id))
      - e.nuisible_pct * (select count(*) from public.evenements_participations p
          join public.evenements_combattants k on k.evenement_id = e.id and k.carte_id = p.carte_id and k.role = 'nuisible'
          where p.evenement_id = e.id)))
    else coalesce((select o.chance from public.evenements_options o where o.id = public.evenement_option_gagnante(e.id)), 0)
  end
  from public.evenements e where e.id = p_id;
$$;

-- Resout les evenements dont le temps est fini (un seul jet chacun), et donne les recompenses.
create or replace function public.evenements_resoudre()
returns integer language plpgsql security definer set search_path = public as $$
declare e record; ch int; jet int; nb int; ok boolean; n int := 0;
begin
  for e in select * from public.evenements where statut = 'ouvert' and fin <= now() order by id for update skip locked loop
    ch := coalesce(public.evenement_chance(e.id), 0);
    select count(*) into nb from public.evenements_participations where evenement_id = e.id;
    jet := 1 + floor(random() * 100)::int; -- 1..100 : reussite si jet <= chance
    ok := nb > 0 and jet <= ch;
    update public.evenements set statut = 'resolu', reussi = ok, chance_finale = ch, tirage = jet,
      option_gagnante = case when e.type = 'vote' then public.evenement_option_gagnante(e.id) end, resolu_le = now()
    where id = e.id;
    if ok and e.recompense_variante_id is not null then
      update public.evenements_participations set recompense = (random() * 100 < e.recompense_pct) where evenement_id = e.id;
      insert into public.collection_joueur (joueur_id, variante_id, quantite)
      select joueur_id, e.recompense_variante_id, 1 from public.evenements_participations where evenement_id = e.id and recompense
      on conflict (joueur_id, variante_id) do update set quantite = public.collection_joueur.quantite + 1;
    else
      update public.evenements_participations set recompense = false where evenement_id = e.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Admin : termine un evenement tout de suite (et le resout).
create or replace function public.evenement_terminer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'INTERDIT'; end if;
  update public.evenements set fin = now() where id = p_id and statut = 'ouvert';
  perform public.evenements_resoudre();
end $$;

-- Les evenements, les plus recents d'abord, avec la participation du joueur, la chance du moment,
-- les voix de chaque option et le resultat.
create or replace function public.evenements_liste()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.item order by x.cree_le desc), '[]') from (
    select e.cree_le, jsonb_build_object(
      'id', e.id, 'type', e.type, 'titre', e.titre, 'texte', e.texte, 'image_path', e.image_path,
      'fin', e.fin, 'statut', e.statut, 'reussi', e.reussi, 'chance_finale', e.chance_finale,
      'tirage', e.tirage, 'option_gagnante', e.option_gagnante,
      'recompense_pct', e.recompense_pct, 'recompense_variante_id', e.recompense_variante_id,
      'recompense_nom', (select c.nom from public.variantes_carte v join public.cartes c on c.id = v.carte_id where v.id = e.recompense_variante_id),
      'recompense_image', (select v.image_path from public.variantes_carte v where v.id = e.recompense_variante_id),
      'base_pct', e.base_pct, 'cle_pct', e.cle_pct, 'autre_pct', e.autre_pct, 'nuisible_pct', e.nuisible_pct,
      'montrer_cles', e.montrer_cles,
      'chance', public.evenement_chance(e.id),
      'participants', (select count(*) from public.evenements_participations p where p.evenement_id = e.id),
      'ma_carte', mp.carte_id, 'mon_option', mp.option_id, 'ma_recompense', mp.recompense, 'vu', coalesce(mp.vu, false),
      'combattants', case when e.montrer_cles or e.statut = 'resolu' or public.is_admin() then coalesce((
        select jsonb_agg(jsonb_build_object('carte_id', k.carte_id, 'role', k.role, 'nom', c.nom))
        from public.evenements_combattants k join public.cartes c on c.id = k.carte_id where k.evenement_id = e.id), '[]') else '[]' end,
      'options', coalesce((
        select jsonb_agg(jsonb_build_object('id', o.id, 'libelle', o.libelle, 'collection_id', o.collection_id,
          'image_path', o.image_path, 'chance', o.chance,
          'voix', (select count(*) from public.evenements_participations p where p.option_id = o.id)) order by o.ordre, o.id)
        from public.evenements_options o where o.evenement_id = e.id), '[]')
    ) as item
    from public.evenements e
    left join public.evenements_participations mp on mp.evenement_id = e.id and mp.joueur_id = auth.uid()
  ) x;
$$;

-- Joueur : participe (defense : un de ses combattants ; vote : une option), ou change d'avis tant que
-- l'evenement est ouvert.
create or replace function public.participer_evenement(p_id bigint, p_carte integer, p_option bigint)
returns void language plpgsql security definer set search_path = public as $$
declare e public.evenements;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour participer.'; end if;
  select * into e from public.evenements where id = p_id;
  if e.id is null then raise exception 'Événement inconnu.'; end if;
  if e.statut <> 'ouvert' or e.fin <= now() then raise exception 'L''événement est terminé.'; end if;
  if e.type = 'defense' then
    if not exists (select 1 from public.collection_joueur cj join public.variantes_carte v on v.id = cj.variante_id
                   join public.cartes c on c.id = v.carte_id
                   where cj.joueur_id = auth.uid() and cj.quantite > 0 and c.id = p_carte and c.type = 'combattant') then
      raise exception 'Choisis un combattant de ta collection.';
    end if;
    insert into public.evenements_participations (evenement_id, joueur_id, carte_id) values (p_id, auth.uid(), p_carte)
    on conflict (evenement_id, joueur_id) do update set carte_id = excluded.carte_id, cree_le = now();
  else
    if not exists (select 1 from public.evenements_options o where o.id = p_option and o.evenement_id = p_id) then
      raise exception 'Option inconnue.';
    end if;
    insert into public.evenements_participations (evenement_id, joueur_id, option_id) values (p_id, auth.uid(), p_option)
    on conflict (evenement_id, joueur_id) do update set option_id = excluded.option_id, cree_le = now();
  end if;
end $$;

-- Joueur : il a vu le resultat (l'animation ne se rejoue plus).
create or replace function public.evenement_vu(p_id bigint)
returns void language sql security definer set search_path = public as $$
  update public.evenements_participations set vu = true where evenement_id = p_id and joueur_id = auth.uid();
$$;

revoke all on function public.evenement_option_gagnante(bigint), public.evenement_chance(bigint), public.evenements_resoudre(),
  public.evenement_terminer(bigint), public.evenements_liste(), public.participer_evenement(bigint, integer, bigint),
  public.evenement_vu(bigint) from public;
grant execute on function public.evenement_option_gagnante(bigint), public.evenement_chance(bigint), public.evenements_liste() to anon, authenticated;
grant execute on function public.evenements_resoudre(), public.evenement_terminer(bigint),
  public.participer_evenement(bigint, integer, bigint), public.evenement_vu(bigint) to authenticated;
