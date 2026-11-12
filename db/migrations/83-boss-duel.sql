-- 83-boss-duel.sql (a executer une fois dans Supabase, apres 82 ; peut etre relance)
-- Etape 1 du boss : un evenement de type 'boss' ou chaque joueur affronte le boss en 1 contre 1, depuis le site
-- (Lore > Evenements), boss_essais_jour fois par jour (3 par defaut, jour de Paris). Le joueur choisit un
-- combattant de sa collection ; ni magie ni piege, des deux cotes. Le boss est la carte de attaquant_variante_id
-- (elle peut rester non publiee), son ATQ et ses PV augmentes de boss_bonus_pct % (70 par defaut), passifs et
-- ultime inchanges.
-- Recompense cachee (jamais envoyee aux joueurs par evenements_liste), exponentielle : chaque tranche de 10 PV
-- retires au boss pendant un essai rapporte boss_or_croissance % de plus que la precedente, la premiere
-- boss_or_10pv gold. n tranches : boss_or_10pv * ((1 + c)^n - 1) / c, arrondi (c = 0 : boss_or_10pv * n).
-- Le combat est calcule par l'edge function (mode 'boss', depuis le site) : boss_preparer verifie tout, note
-- l'essai et rend les deux decks, la graine et le tableau des niveaux ; boss_conclure note l'issue et les
-- degats et verse le gold. Les deux ne sont appelables que par l'edge (service_role). A la fin de l'evenement
-- (fin), il est resolu : reussi si au moins un joueur a battu le boss.
-- Le boss dans une contestation (boss_contestation_id : l'evenement de contestation) : il y entre avec la cle
-- -(id de l'evenement de boss) (son nom : celui de sa carte), et chaque essai perdu contre lui (defaite ou nul)
-- lui rapporte 1 a 3 points (tire au hasard), tant que la contestation compte ses points.

alter table public.evenements drop constraint if exists evenements_type_check;
alter table public.evenements add constraint evenements_type_check
  check (type in ('defense', 'vote', 'contestation', 'boss'));
alter table public.evenements
  add column if not exists boss_bonus_pct integer not null default 70 check (boss_bonus_pct between 0 and 1000),
  add column if not exists boss_essais_jour integer not null default 3 check (boss_essais_jour between 1 and 50),
  add column if not exists boss_or_10pv integer not null default 5 check (boss_or_10pv between 0 and 100000),
  add column if not exists boss_or_croissance numeric not null default 10 check (boss_or_croissance between 0 and 100),
  add column if not exists boss_contestation_id bigint references public.evenements(id) on delete set null;

-- Le nom d'une cle de collection (0 = Basique ; negative : le boss de l'evenement -cle, le nom de sa carte).
create or replace function public.contestation_nom(p_collection integer)
returns text language sql stable security definer set search_path = public as $$
  select case when p_collection is null then null when p_collection = 0 then 'Basique'
    when p_collection < 0 then (select c.nom from public.evenements e join public.variantes_carte v on v.id = e.attaquant_variante_id
                                join public.cartes c on c.id = v.carte_id where e.id = -p_collection)
    else (select c.nom from public.collections c where c.id = p_collection) end;
$$;

create table if not exists public.evenements_boss_essais (
  id bigserial primary key,
  evenement_id bigint not null references public.evenements(id) on delete cascade,
  joueur_id uuid not null references public.joueurs(id) on delete cascade,
  carte_id bigint not null,
  seed bigint not null,
  gagne boolean,
  degats integer,
  gain integer,
  cree_le timestamptz not null default now(),
  fini_le timestamptz
);
create index if not exists evenements_boss_essais_joueur on public.evenements_boss_essais (evenement_id, joueur_id, cree_le);
alter table public.evenements_boss_essais enable row level security;
revoke all on public.evenements_boss_essais from public, anon, authenticated;

-- Debut du jour, heure de Paris (les essais du jour).
create or replace function public.boss_debut_jour()
returns timestamptz language sql stable set search_path = public as $$
  select date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
$$;

-- ATQ ou PV du boss, augmentes de boss_bonus_pct % (arrondis).
create or replace function public.boss_stat(p_evenement bigint, p_stat text)
returns integer language sql stable security definer set search_path = public as $$
  select round(coalesce(case when p_stat = 'atq' then c.atq else c.pv end, 0)::numeric * (100 + e.boss_bonus_pct) / 100)::int
  from public.evenements e
  join public.variantes_carte v on v.id = e.attaquant_variante_id
  join public.cartes c on c.id = v.carte_id
  where e.id = p_evenement;
$$;

-- Une carte au format du moteur (comme titre_deck_json), avec l'image d'une variante et la rarete (brillance).
create or replace function public.boss_carte_json(p_variante bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(c) || jsonb_build_object('image', v.image_path, 'imageCombat', v.image_combat,
    'rar', (select jsonb_build_object('nom', r.nom, 'couleur', r.couleur, 'poids', r.poids) from public.raretes r where r.id = c.rarete_id))
  from public.variantes_carte v join public.cartes c on c.id = v.carte_id
  where v.id = p_variante;
$$;

drop function if exists public.boss_preparer(bigint, bigint);
create or replace function public.boss_preparer(p_joueur uuid, p_evenement bigint, p_variante bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := p_joueur; e public.evenements; carte jsonb; boss jsonb; deja int; essai bigint; graine bigint; niv jsonb;
begin
  if me is null then raise exception 'Connecte-toi pour affronter le boss.'; end if;
  select * into e from public.evenements where id = p_evenement;
  if e.id is null or e.type <> 'boss' then raise exception 'Combat de boss introuvable.'; end if;
  if e.statut <> 'ouvert' or e.fin <= now() then raise exception 'Ce combat de boss est terminé.'; end if;
  if e.attaquant_variante_id is null then raise exception 'Le boss n''est pas encore là.'; end if;
  if not exists (select 1 from public.collection_joueur k join public.variantes_carte v on v.id = k.variante_id
                 join public.cartes c on c.id = v.carte_id
                 where k.joueur_id = me and k.variante_id = p_variante and k.quantite > 0 and c.type = 'combattant') then
    raise exception 'Choisis un combattant de ta collection.';
  end if;
  perform pg_advisory_xact_lock(hashtext('boss:' || me::text));
  select count(*) into deja from public.evenements_boss_essais
  where evenement_id = e.id and joueur_id = me and cree_le >= public.boss_debut_jour();
  if deja >= e.boss_essais_jour then
    raise exception 'Tu as déjà fait tes % essais aujourd''hui : reviens demain !', e.boss_essais_jour;
  end if;
  carte := public.boss_carte_json(p_variante);
  boss := public.boss_carte_json(e.attaquant_variante_id)
    || jsonb_build_object('atq', public.boss_stat(e.id, 'atq'), 'pv', public.boss_stat(e.id, 'pv'));
  graine := floor(random() * 1e9)::bigint;
  insert into public.evenements_boss_essais (evenement_id, joueur_id, carte_id, seed)
  values (e.id, me, (carte->>'id')::bigint, graine) returning id into essai;
  begin
    niv := (select valeur::jsonb from public.reglages_jeu where cle = 'niveaux_statuts');
  exception when others then niv := null;
  end;
  return jsonb_build_object('essai', essai, 'seed', graine, 'niveaux', niv,
    'a', jsonb_build_object('pseudo', (select pseudo from public.joueurs where id = me), 'deck', jsonb_build_array(carte)),
    'b', jsonb_build_object('pseudo', coalesce(boss->>'nom', 'Boss'), 'deck', jsonb_build_array(boss)),
    'restants', e.boss_essais_jour - deja - 1);
end $$;
revoke all on function public.boss_preparer(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.boss_preparer(uuid, bigint, bigint) to service_role;

-- L'issue d'un essai, notee par l'edge une fois le combat calcule (une seule fois) : les degats faits au boss
-- et le gold cache (exponentiel : boss_or_10pv la 1re tranche de 10 PV, puis boss_or_croissance % de plus a chaque
-- tranche), verse au joueur. Rend le gold gagne.
drop function if exists public.boss_resultat(bigint, boolean);
create or replace function public.boss_conclure(p_essai bigint, p_gagne boolean, p_degats integer)
returns integer language plpgsql security definer set search_path = public as $$
declare b public.evenements_boss_essais; e public.evenements; n int; c numeric; g int;
begin
  select * into b from public.evenements_boss_essais where id = p_essai and gagne is null for update;
  if b.id is null then return 0; end if;
  select * into e from public.evenements where id = b.evenement_id;
  n := greatest(0, coalesce(p_degats, 0)) / 10;
  c := coalesce(e.boss_or_croissance, 0) / 100;
  g := least(1000000, round(case when c > 0 then e.boss_or_10pv * (power(1 + c, n) - 1) / c else e.boss_or_10pv * n end))::int;
  update public.evenements_boss_essais set gagne = coalesce(p_gagne, false), degats = greatest(0, coalesce(p_degats, 0)),
    gain = g, fini_le = now() where id = b.id;
  if g > 0 then update public.joueurs set monnaie = coalesce(monnaie, 0) + g where id = b.joueur_id; end if;
  -- un essai perdu contre le boss : 1 a 3 points pour lui dans sa contestation, si elle compte encore
  if not coalesce(p_gagne, false) and e.boss_contestation_id is not null then
    insert into public.evenements_points (evenement_id, collection, points)
    select k.id, -e.id, 1 + floor(random() * 3)::int from public.evenements k
    where k.id = e.boss_contestation_id and k.type = 'contestation' and k.statut = 'decompte'
      and (k.decompte_fin is null or now() < k.decompte_fin)
    on conflict (evenement_id, collection) do update set points = public.evenements_points.points + excluded.points;
  end if;
  return g;
end $$;
revoke all on function public.boss_conclure(bigint, boolean, integer) from public, anon, authenticated;
grant execute on function public.boss_conclure(bigint, boolean, integer) to service_role;

-- Fin d'un combat de boss : resolu, reussi si quelqu'un l'a battu.
create or replace function public.boss_resoudre()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.evenements e set statut = 'resolu', resolu_le = now(),
    reussi = exists (select 1 from public.evenements_boss_essais b where b.evenement_id = e.id and b.gagne)
  where e.type = 'boss' and e.statut = 'ouvert' and e.fin <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.boss_resoudre() from public, anon;
grant execute on function public.boss_resoudre() to authenticated;

-- La resolution des evenements : contestations et combats de boss d'abord (la resolution des autres ne les
-- voit pas : elle tirerait leur chance comme pour un vote).
create or replace function public.evenements_resoudre()
returns integer language plpgsql security definer set search_path = public as $$
begin
  return public.contestations_resoudre() + public.boss_resoudre() + public.evenements_resoudre_base();
end $$;
revoke all on function public.evenements_resoudre() from public, anon;
grant execute on function public.evenements_resoudre() to authenticated;

create or replace function public.evenements_liste()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(x.item order by x.cree_le desc), '[]') from (
    select e.cree_le, jsonb_build_object(
      'id', e.id, 'type', e.type, 'titre', e.titre, 'texte', e.texte, 'image_path', e.image_path,
      'fin', e.fin, 'statut', e.statut, 'reussi', e.reussi, 'chance_finale', e.chance_finale,
      'tirage', e.tirage, 'option_gagnante', e.option_gagnante,
      'recompense_pct', e.recompense_pct, 'recompense_variante_id', e.recompense_variante_id,
      'recompense_nom', (select c.nom from public.variantes_carte v join public.cartes c on c.id = v.carte_id where v.id = e.recompense_variante_id),
      'recompense_image', (select v.image_path from public.variantes_carte v where v.id = e.recompense_variante_id),
      'attaquant_nom', (select c.nom from public.variantes_carte v join public.cartes c on c.id = v.carte_id where v.id = e.attaquant_variante_id),
      'attaquant_image', (select v.image_path from public.variantes_carte v where v.id = e.attaquant_variante_id),
      'lieu_id', (select l.id from public.lore_lieux l where l.id = e.lieu_id and (l.revele or public.is_admin())),
      'lieu_nom', (select l.nom from public.lore_lieux l where l.id = e.lieu_id and (l.revele or public.is_admin())),
      'eclair_x', e.eclair_x, 'eclair_y', e.eclair_y,
      'arrivee', case when e.eclair_x is not null then public.evenement_arrivee(e.id) end
    ) || jsonb_build_object(
      -- (deux objets : jsonb_build_object prend au plus 100 arguments)
      'eclair_evenement_id', e.eclair_evenement_id, 'defenseur_collection', e.defenseur_collection,
      'defenseur_nom', public.contestation_nom(e.defenseur_collection),
      'collections_engagees', to_jsonb(e.collections_engagees),
      'decompte_debut', e.decompte_debut, 'decompte_fin', e.decompte_fin,
      'gagnant_collection', e.gagnant_collection, 'gagnant_nom', public.contestation_nom(e.gagnant_collection),
      'points', coalesce((
        select jsonb_agg(jsonb_build_object('collection', pt.collection, 'nom', public.contestation_nom(pt.collection),
          'points', pt.points) order by pt.points desc, pt.collection)
        from public.evenements_points pt where pt.evenement_id = e.id), '[]'),
      'seuil_votes', e.seuil_votes,
      'boss_bonus_pct', e.boss_bonus_pct, 'boss_essais_jour', e.boss_essais_jour,
      'boss_atq', case when e.type = 'boss' then public.boss_stat(e.id, 'atq') end,
      'boss_pv', case when e.type = 'boss' then public.boss_stat(e.id, 'pv') end,
      'boss_essais', (select count(*) from public.evenements_boss_essais b where b.evenement_id = e.id),
      'boss_victoires', (select count(*) from public.evenements_boss_essais b where b.evenement_id = e.id and b.gagne),
      'mes_essais_jour', (select count(*) from public.evenements_boss_essais b
                          where b.evenement_id = e.id and b.joueur_id = auth.uid() and b.cree_le >= public.boss_debut_jour()),
 'manche', e.manche, 'depart', e.depart, 'option_envoyee', e.option_envoyee,
      'votes_manche', (select count(*) from public.evenements_participations p
                       where p.evenement_id = e.id and p.manche = e.manche and p.option_id is not null),
      'pot', case when public.is_admin() then (select t.pot from public.evenements_pots t where t.evenement_id = e.id) end,
      'mon_gain', mp.gain, 'ma_manche', mp.manche,
      'tentatives', coalesce((
        select jsonb_agg(jsonb_build_object('manche', t.manche, 'option_id', t.option_id, 'reussi', t.reussi,
          'tirage', t.tirage, 'le', t.cree_le) order by t.manche)
        from public.evenements_tentatives t where t.evenement_id = e.id), '[]'),
      'base_pct', e.base_pct, 'cle_pct', e.cle_pct, 'autre_pct', e.autre_pct, 'nuisible_pct', e.nuisible_pct,
      'montrer_cles', e.montrer_cles,
      'chance', case when e.montrer_chances or e.statut = 'resolu' then public.evenement_chance(e.id) end,
      'montrer_chances', e.montrer_chances,
      'participants', (select count(*) from public.evenements_participations p where p.evenement_id = e.id),
      'ma_carte', mp.carte_id, 'mon_option', mp.option_id, 'ma_recompense', mp.recompense, 'vu', coalesce(mp.vu, false),
      'combattants', case when e.montrer_cles or e.statut = 'resolu' or public.is_admin() then coalesce((
        select jsonb_agg(jsonb_build_object('carte_id', k.carte_id, 'role', k.role, 'nom', c.nom))
        from public.evenements_combattants k join public.cartes c on c.id = k.carte_id where k.evenement_id = e.id), '[]') else '[]' end,
      'defenseurs', case when e.type = 'defense' then coalesce((
        select jsonb_agg(d.item order by d.cree_le) from (
          select p.cree_le, jsonb_build_object(
            'pseudo', j.pseudo,
            'nom', c.nom,
            'image_path', (select v.image_path from public.variantes_carte v
                           where v.carte_id = p.carte_id and v.image_path is not null order by v.id limit 1),
            'role', case when e.montrer_cles or e.statut = 'resolu' or public.is_admin() then
              (select k.role from public.evenements_combattants k where k.evenement_id = e.id and k.carte_id = p.carte_id)
              else null end
          ) as item
          from public.evenements_participations p
          join public.joueurs j on j.id = p.joueur_id
          join public.cartes c on c.id = p.carte_id
          where p.evenement_id = e.id and p.carte_id is not null
          order by p.cree_le
          limit 40
        ) d), '[]') else '[]' end,
      'options', coalesce((
        select jsonb_agg(jsonb_build_object('id', o.id, 'libelle', o.libelle, 'collection_id', o.collection_id,
          'image_path', o.image_path,
          'chance', case when e.montrer_chances or e.statut = 'resolu' then o.chance end,
          'vitesse', o.vitesse, 'trajet_minutes', o.trajet_minutes, 'role', o.role,
          'trajet_heures', public.evenement_trajet_heures(o.id),
          'voix', (select count(*) from public.evenements_participations p where p.option_id = o.id and p.manche = e.manche)) order by o.ordre, o.id)
        from public.evenements_options o where o.evenement_id = e.id), '[]')
    ) as item
    from public.evenements e
    left join public.evenements_participations mp on mp.evenement_id = e.id and mp.joueur_id = auth.uid()
  ) x;
$function$;
