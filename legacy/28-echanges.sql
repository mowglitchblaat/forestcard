-- 28-echanges.sql — Forest Card
-- Échanges de cartes entre joueurs, payés en fragments 🧩 (pot commun), et recyclage des doublons en fragments.
--
-- Règles :
--  • Chaque carte de l'échange ajoute le prix de sa rareté au POT (réglable : commun 5, rare 10, épique 30, légendaire 60, GGEZ 100).
--  • Les deux joueurs mettent ce qu'ils veulent dans le pot ; l'échange se fait quand le pot est plein ET que les deux ont accepté.
--    Les fragments sont retenus dès qu'ils sont mis, rendus si l'échange est annulé, refusé ou expiré, détruits si l'échange se fait.
--  • 1 échange par jour et par joueur (heure de Paris), compte d'au moins 7 jours, au moins 50 boosters ouverts (réglables).
--  • Une offre expire au bout de 48 h. Une carte échangée qui n'est plus possédée en aucun exemplaire sort du deck de combat.
--  • Recyclage : le joueur choisit gold (fonction existante recycler_doublons) OU fragments (nouvelle fonction recycler_doublons_fragments).
--  • Rattrapage unique du compteur « Boosters ouverts » (il ne compte que depuis le 17 octobre) : au moins (cartes possédées ÷ 5).
--
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

-- ================= Réglages par défaut (modifiables dans Admin > Réglages) =================
insert into public.reglages_jeu (cle, valeur) values
  ('echange_prix_commun', '5'), ('echange_prix_rare', '10'), ('echange_prix_epique', '30'), ('echange_prix_legendaire', '60'), ('echange_prix_ggez', '100'),
  ('fragments_recyclage_commun', '2'), ('fragments_recyclage_rare', '4'), ('fragments_recyclage_epique', '12'), ('fragments_recyclage_legendaire', '25'), ('fragments_recyclage_ggez', '40'),
  ('echange_age_jours', '7'), ('echange_boosters_min', '50'), ('echange_par_jour', '1'), ('echange_expiration_h', '48'),
  ('echange_max_cartes', '5'), ('echange_max_offres', '5')
on conflict (cle) do nothing;

create or replace function public.reglage_num(p_cle text, p_def numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select case when trim(valeur) ~ '^-?[0-9]+([.][0-9]+)?$' then trim(valeur)::numeric end
                   from public.reglages_jeu where cle = p_cle), p_def);
$$;
revoke all on function public.reglage_num(text, numeric) from public, anon, authenticated;

-- Rang d'une rareté d'après son nom (même règle que le site) : ggez, legendaire, epique, rare, sinon commun
create or replace function public.rang_rarete(p_nom text)
returns text language sql immutable as $$
  select case when n like '%ggez%' then 'ggez' when n like '%legend%' then 'legendaire' when n like '%epiq%' then 'epique'
              when n like '%rare%' then 'rare' else 'commun' end
  from (select translate(lower(coalesce(p_nom, '')), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') as n) x;
$$;

-- ================= Vues internes (noms de colonnes retrouvés automatiquement) =================
do $$
declare cv text; cr text;
begin
  -- colonne de collection_joueur qui pointe vers variantes_carte
  select a.attname into cv from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
   where k.contype = 'f' and k.conrelid = 'public.collection_joueur'::regclass and k.confrelid = 'public.variantes_carte'::regclass limit 1;
  if cv is null then
    select column_name into cv from information_schema.columns where table_schema = 'public' and table_name = 'collection_joueur'
      and column_name in ('variante_id', 'variante', 'id_variante') limit 1;
  end if;
  if cv is null then raise exception 'collection_joueur : colonne de la variante introuvable'; end if;
  -- colonne de cartes qui pointe vers raretes
  select a.attname into cr from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
   where k.contype = 'f' and k.conrelid = 'public.cartes'::regclass and k.confrelid = 'public.raretes'::regclass limit 1;
  if cr is null then
    select column_name into cr from information_schema.columns where table_schema = 'public' and table_name = 'cartes'
      and column_name in ('rarete_id', 'rarete', 'id_rarete') limit 1;
  end if;
  if cr is null then raise exception 'cartes : colonne de la rareté introuvable'; end if;

  -- collection : une ligne par joueur et par variante (vue modifiable : les fonctions y font leurs mises à jour)
  execute format('create or replace view public.echange_coll as select joueur_id, %I as variante_id, quantite from public.collection_joueur', cv);
  -- infos d'une variante : carte, rareté, rang, image
  execute format($v$create or replace view public.echange_var as
    select v.id as variante_id, v.carte_id, c.nom, v.nom as variante, v.image_path, c.type, r.nom as rarete, r.couleur,
           public.rang_rarete(r.nom) as rang
    from public.variantes_carte v join public.cartes c on c.id = v.carte_id left join public.raretes r on r.id = c.%I$v$, cr);
end $$;
revoke all on public.echange_coll from public, anon, authenticated;
revoke all on public.echange_var from public, anon, authenticated;

create or replace function public.echange_prix(p_rang text)
returns int language sql stable security definer set search_path = public as $$
  select public.reglage_num('echange_prix_' || p_rang,
    case p_rang when 'ggez' then 100 when 'legendaire' then 60 when 'epique' then 30 when 'rare' then 10 else 5 end)::int;
$$;
revoke all on function public.echange_prix(text) from public, anon, authenticated;

-- ================= Tables =================
create table if not exists public.echanges (
  id bigserial primary key,
  de uuid not null,                 -- celui qui propose
  pour uuid not null,               -- celui à qui c'est proposé
  statut text not null default 'ouvert' check (statut in ('ouvert', 'valide', 'refuse', 'annule', 'expire')),
  pot int not null,
  part_de int not null default 0,
  part_pour int not null default 0,
  ok_pour boolean not null default false,   -- le destinataire a accepté (le proposeur accepte en proposant)
  raison text,
  annonce boolean not null default false,   -- déjà annoncé sur l'overlay
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null,
  fini_le timestamptz
);
create index if not exists echanges_de_idx on public.echanges (de, statut);
create index if not exists echanges_pour_idx on public.echanges (pour, statut);
create table if not exists public.echanges_cartes (
  echange_id bigint not null references public.echanges(id) on delete cascade,
  cote text not null check (cote in ('de', 'pour')),   -- 'de' = cartes données par le proposeur, 'pour' = cartes données par le destinataire
  variante_id bigint not null,
  quantite int not null default 1,
  prix int not null
);
create index if not exists echanges_cartes_idx on public.echanges_cartes (echange_id);
alter table public.echanges enable row level security;          -- lecture et écriture uniquement par les fonctions ci-dessous
alter table public.echanges_cartes enable row level security;
revoke all on public.echanges from anon, authenticated;
revoke all on public.echanges_cartes from anon, authenticated;

-- ================= Outils internes =================
create or replace function public.echange_minuit()
returns timestamptz language sql stable as $$ select date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris' $$;

-- Pourquoi un joueur ne peut pas échanger (tableau vide = il peut)
create or replace function public.echange_raisons(p_joueur uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare R text[] := '{}'; age numeric; nb int; jour int;
begin
  select extract(epoch from now() - u.created_at) / 86400 into age from auth.users u where u.id = p_joueur;
  if coalesce(age, 0) < public.reglage_num('echange_age_jours', 7) then
    R := R || format('compte de moins de %s jours', public.reglage_num('echange_age_jours', 7)); end if;
  select coalesce(boosters_ouverts, 0) into nb from public.stats_joueurs where joueur_id = p_joueur;
  if coalesce(nb, 0) < public.reglage_num('echange_boosters_min', 50) then
    R := R || format('moins de %s boosters ouverts (%s)', public.reglage_num('echange_boosters_min', 50), coalesce(nb, 0)); end if;
  select count(*) into jour from public.echanges where statut = 'valide' and fini_le >= public.echange_minuit() and (de = p_joueur or pour = p_joueur);
  if jour >= public.reglage_num('echange_par_jour', 1) then R := R || 'échange du jour déjà fait'::text; end if;
  return R;
end $$;
revoke all on function public.echange_raisons(uuid) from public, anon, authenticated;

-- Rend les fragments retenus et ferme l'échange
create or replace function public.echange_fermer(p_id bigint, p_statut text, p_raison text default null)
returns void language plpgsql security definer set search_path = public as $$
declare e public.echanges;
begin
  select * into e from public.echanges where id = p_id for update;
  if e.id is null or e.statut <> 'ouvert' then return; end if;
  update public.joueurs set fragments = coalesce(fragments, 0) + e.part_de where id = e.de and e.part_de > 0;
  update public.joueurs set fragments = coalesce(fragments, 0) + e.part_pour where id = e.pour and e.part_pour > 0;
  update public.echanges set statut = p_statut, raison = p_raison, fini_le = now(), part_de = 0, part_pour = 0 where id = p_id;
end $$;
revoke all on function public.echange_fermer(bigint, text, text) from public, anon, authenticated;

-- Offres trop vieilles : expirées et remboursées
create or replace function public.echanges_expirer()
returns void language plpgsql security definer set search_path = public as $$
declare i bigint;
begin
  for i in select id from public.echanges where statut = 'ouvert' and expire_le < now() loop
    perform public.echange_fermer(i, 'expire', 'Offre expirée');
  end loop;
end $$;
revoke all on function public.echanges_expirer() from public, anon, authenticated;

-- Le joueur possède-t-il encore les cartes de ce côté de l'échange ?
create or replace function public.echange_possede(p_id bigint, p_cote text, p_joueur uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from (select variante_id, sum(quantite) q from public.echanges_cartes where echange_id = p_id and cote = p_cote group by variante_id) w
    where coalesce((select sum(c.quantite) from public.echange_coll c where c.joueur_id = p_joueur and c.variante_id = w.variante_id), 0) < w.q);
$$;
revoke all on function public.echange_possede(bigint, text, uuid) from public, anon, authenticated;

-- Déplace les cartes d'un joueur à l'autre ; une carte qui n'est plus possédée du tout sort du deck de combat
create or replace function public.echange_deplacer(p_id bigint, p_cote text, p_de uuid, p_vers uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w record; reste int;
begin
  for w in select variante_id, sum(quantite)::int q from public.echanges_cartes where echange_id = p_id and cote = p_cote group by variante_id loop
    update public.echange_coll set quantite = quantite - w.q where joueur_id = p_de and variante_id = w.variante_id;
    delete from public.echange_coll where joueur_id = p_de and variante_id = w.variante_id and quantite <= 0;
    update public.echange_coll set quantite = quantite + w.q where joueur_id = p_vers and variante_id = w.variante_id;
    if not found then insert into public.echange_coll (joueur_id, variante_id, quantite) values (p_vers, w.variante_id, w.q); end if;
    select coalesce(sum(c.quantite), 0) into reste from public.echange_coll c join public.variantes_carte v on v.id = c.variante_id
     where c.joueur_id = p_de and v.carte_id = (select carte_id from public.variantes_carte where id = w.variante_id);
    if reste <= 0 then
      delete from public.deck where joueur_id = p_de and carte_id = (select carte_id from public.variantes_carte where id = w.variante_id);
    end if;
  end loop;
end $$;
revoke all on function public.echange_deplacer(bigint, text, uuid, uuid) from public, anon, authenticated;

-- Fait l'échange si le pot est plein et que les deux ont accepté
create or replace function public.echange_tenter(p_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare e public.echanges; ra text[]; rb text[];
begin
  select * into e from public.echanges where id = p_id for update;
  if e.statut <> 'ouvert' or not e.ok_pour or e.part_de + e.part_pour < e.pot then return 'attente'; end if;
  perform 1 from public.joueurs where id in (e.de, e.pour) order by id for update;   -- un seul échange à la fois pour ces deux joueurs
  ra := public.echange_raisons(e.de); rb := public.echange_raisons(e.pour);
  if array_length(ra, 1) > 0 then raise exception 'ECHANGE_IMPOSSIBLE: % (%)', (select pseudo from public.joueurs where id = e.de), array_to_string(ra, ', '); end if;
  if array_length(rb, 1) > 0 then raise exception 'ECHANGE_IMPOSSIBLE: % (%)', (select pseudo from public.joueurs where id = e.pour), array_to_string(rb, ', '); end if;
  if not public.echange_possede(p_id, 'de', e.de) or not public.echange_possede(p_id, 'pour', e.pour) then
    perform public.echange_fermer(p_id, 'annule', 'Une des cartes n''est plus dans la collection de son propriétaire');
    return 'annule';
  end if;
  perform public.echange_deplacer(p_id, 'de', e.de, e.pour);
  perform public.echange_deplacer(p_id, 'pour', e.pour, e.de);
  update public.echanges set statut = 'valide', fini_le = now() where id = p_id;   -- les fragments du pot sont détruits
  return 'valide';
end $$;
revoke all on function public.echange_tenter(bigint) from public, anon, authenticated;

-- Cartes d'un côté de l'échange, pour l'affichage
create or replace function public.echange_cartes_json(p_id bigint, p_cote text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('variante_id', w.variante_id, 'quantite', w.q, 'nom', v.nom, 'variante', v.variante,
    'image', v.image_path, 'type', v.type, 'rarete', v.rarete, 'couleur', v.couleur, 'rang', v.rang, 'prix', w.p) order by w.p desc, v.nom), '[]'::jsonb)
  from (select variante_id, sum(quantite)::int q, sum(prix)::int p from public.echanges_cartes where echange_id = p_id and cote = p_cote group by variante_id) w
  join public.echange_var v on v.variante_id = w.variante_id;
$$;
revoke all on function public.echange_cartes_json(bigint, text) from public, anon, authenticated;

-- ================= Fonctions appelées par le site =================

-- Réglages et situation du joueur connecté
create or replace function public.echange_infos()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); R text[];
begin
  if me is null then raise exception 'Non connecté'; end if;
  perform public.echanges_expirer();
  R := public.echange_raisons(me);
  return jsonb_build_object(
    'ok', coalesce(array_length(R, 1), 0) = 0, 'raisons', to_jsonb(R),
    'fragments', (select coalesce(fragments, 0) from public.joueurs where id = me),
    'boosters', (select coalesce(boosters_ouverts, 0) from public.stats_joueurs where joueur_id = me),
    'age_jours', (select floor(extract(epoch from now() - created_at) / 86400) from auth.users where id = me),
    'prix', jsonb_build_object('commun', public.echange_prix('commun'), 'rare', public.echange_prix('rare'), 'epique', public.echange_prix('epique'),
                               'legendaire', public.echange_prix('legendaire'), 'ggez', public.echange_prix('ggez')),
    'age_min', public.reglage_num('echange_age_jours', 7), 'boosters_min', public.reglage_num('echange_boosters_min', 50),
    'par_jour', public.reglage_num('echange_par_jour', 1), 'expiration_h', public.reglage_num('echange_expiration_h', 48),
    'max_cartes', public.reglage_num('echange_max_cartes', 5));
end $$;
grant execute on function public.echange_infos() to authenticated;

-- Joueurs avec qui échanger (recherche par pseudo)
create or replace function public.echange_joueurs(p_recherche text default '')
returns table (id uuid, pseudo text, peut boolean, raisons text[])
language sql stable security definer set search_path = public as $$
  select j.id, j.pseudo::text, coalesce(array_length(public.echange_raisons(j.id), 1), 0) = 0, public.echange_raisons(j.id)
  from public.joueurs j
  where j.id <> auth.uid() and auth.uid() is not null and j.pseudo ilike '%' || coalesce(p_recherche, '') || '%'
  order by lower(j.pseudo) limit 30;
$$;
grant execute on function public.echange_joueurs(text) to authenticated;

-- Cartes d'un joueur (soi ou l'autre joueur), avec le prix de chaque carte dans le pot
create or replace function public.echange_collection(p_joueur uuid)
returns table (variante_id bigint, quantite int, carte_id bigint, nom text, variante text, image_path text, type text, rarete text, couleur text, rang text, prix int, au_deck boolean)
language sql stable security definer set search_path = public as $$
  select v.variante_id::bigint, c.quantite::int, v.carte_id::bigint, v.nom::text, v.variante::text, v.image_path::text, v.type::text, v.rarete::text, v.couleur::text, v.rang, public.echange_prix(v.rang),
         exists (select 1 from public.deck d where d.joueur_id = p_joueur and d.carte_id = v.carte_id)
  from public.echange_coll c join public.echange_var v on v.variante_id = c.variante_id
  where auth.uid() is not null and c.joueur_id = p_joueur and c.quantite > 0;
$$;
grant execute on function public.echange_collection(uuid) to authenticated;

-- Proposer un échange : p_donne = mes cartes (ids de variantes, répéter un id pour plusieurs exemplaires), p_recoit = ses cartes, p_part = ma mise
create or replace function public.echange_proposer(p_pour uuid, p_donne bigint[], p_recoit bigint[], p_part int default 0)
returns bigint language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); R text[]; pot int; id_ bigint; mx int := public.reglage_num('echange_max_cartes', 5); frag int;
begin
  if me is null then raise exception 'Non connecté'; end if;
  perform public.echanges_expirer();
  if p_pour is null or p_pour = me or not exists (select 1 from public.joueurs where id = p_pour) then raise exception 'ECHANGE: joueur introuvable'; end if;
  if coalesce(array_length(p_donne, 1), 0) < 1 or coalesce(array_length(p_recoit, 1), 0) < 1 then raise exception 'ECHANGE: il faut au moins une carte de chaque côté'; end if;
  if array_length(p_donne, 1) > mx or array_length(p_recoit, 1) > mx then raise exception 'ECHANGE: % cartes maximum de chaque côté', mx; end if;
  R := public.echange_raisons(me);
  if coalesce(array_length(R, 1), 0) > 0 then raise exception 'ECHANGE: tu ne peux pas encore échanger (%)', array_to_string(R, ', '); end if;
  R := public.echange_raisons(p_pour);
  if coalesce(array_length(R, 1), 0) > 0 then raise exception 'ECHANGE: ce joueur ne peut pas encore échanger (%)', array_to_string(R, ', '); end if;
  if (select count(*) from public.echanges where de = me and statut = 'ouvert') >= public.reglage_num('echange_max_offres', 5) then
    raise exception 'ECHANGE: trop d''offres en attente (% maximum) : annule-en une', public.reglage_num('echange_max_offres', 5); end if;
  -- possession
  if exists (select 1 from (select x v, count(*) q from unnest(p_donne) x group by x) w
             where coalesce((select sum(quantite) from public.echange_coll where joueur_id = me and variante_id = w.v), 0) < w.q) then
    raise exception 'ECHANGE: tu ne possèdes pas toutes ces cartes'; end if;
  if exists (select 1 from (select x v, count(*) q from unnest(p_recoit) x group by x) w
             where coalesce((select sum(quantite) from public.echange_coll where joueur_id = p_pour and variante_id = w.v), 0) < w.q) then
    raise exception 'ECHANGE: ce joueur ne possède pas toutes ces cartes'; end if;
  select coalesce(sum(public.echange_prix(v.rang)), 0) into pot
    from (select unnest(p_donne) x union all select unnest(p_recoit)) a join public.echange_var v on v.variante_id = a.x;
  p_part := greatest(0, least(coalesce(p_part, 0), pot));
  select coalesce(fragments, 0) into frag from public.joueurs where id = me for update;
  if frag < p_part then raise exception 'ECHANGE: pas assez de fragments (tu en as %)', frag; end if;
  update public.joueurs set fragments = coalesce(fragments, 0) - p_part where id = me;
  insert into public.echanges (de, pour, pot, part_de, expire_le)
    values (me, p_pour, pot, p_part, now() + make_interval(hours => public.reglage_num('echange_expiration_h', 48)::int)) returning id into id_;
  insert into public.echanges_cartes (echange_id, cote, variante_id, prix)
    select id_, 'de', v.variante_id, public.echange_prix(v.rang) from unnest(p_donne) x join public.echange_var v on v.variante_id = x;
  insert into public.echanges_cartes (echange_id, cote, variante_id, prix)
    select id_, 'pour', v.variante_id, public.echange_prix(v.rang) from unnest(p_recoit) x join public.echange_var v on v.variante_id = x;
  return id_;
end $$;
grant execute on function public.echange_proposer(uuid, bigint[], bigint[], int) to authenticated;

-- Mettre des fragments dans le pot (le destinataire accepte l'échange en le faisant, même avec 0). Renvoie 'valide', 'attente' ou 'annule'.
create or replace function public.echange_contribuer(p_id bigint, p_montant int)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e public.echanges; m int; frag int;
begin
  if me is null then raise exception 'Non connecté'; end if;
  perform public.echanges_expirer();
  select * into e from public.echanges where id = p_id for update;
  if e.id is null or me not in (e.de, e.pour) then raise exception 'ECHANGE: échange introuvable'; end if;
  if e.statut <> 'ouvert' then raise exception 'ECHANGE: cet échange est terminé'; end if;
  m := greatest(0, least(coalesce(p_montant, 0), e.pot - e.part_de - e.part_pour));
  select coalesce(fragments, 0) into frag from public.joueurs where id = me for update;
  if frag < m then raise exception 'ECHANGE: pas assez de fragments (tu en as %)', frag; end if;
  update public.joueurs set fragments = coalesce(fragments, 0) - m where id = me;
  if me = e.de then update public.echanges set part_de = part_de + m where id = p_id;
  else update public.echanges set part_pour = part_pour + m, ok_pour = true where id = p_id; end if;
  return public.echange_tenter(p_id);
end $$;
grant execute on function public.echange_contribuer(bigint, int) to authenticated;

-- Annuler (proposeur) ou refuser (destinataire) : chacun récupère ses fragments
create or replace function public.echange_annuler(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e public.echanges;
begin
  select * into e from public.echanges where id = p_id;
  if e.id is null or me is null or me not in (e.de, e.pour) then raise exception 'ECHANGE: échange introuvable'; end if;
  perform public.echange_fermer(p_id, case when me = e.de then 'annule' else 'refuse' end,
    case when me = e.de then 'Annulé par ' else 'Refusé par ' end || coalesce((select pseudo from public.joueurs where id = me), '?'));
end $$;
grant execute on function public.echange_annuler(bigint) to authenticated;

-- Mes échanges : en cours + 10 derniers terminés
create or replace function public.mes_echanges()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Non connecté'; end if;
  perform public.echanges_expirer();
  return coalesce((select jsonb_agg(x order by x.ouvert desc, x.cree_le desc) from (
    select e.id, e.statut, e.statut = 'ouvert' as ouvert, e.cree_le, e.expire_le, e.fini_le, e.raison, e.pot, e.ok_pour,
           (e.de = me) as moi_propose,
           case when e.de = me then e.part_de else e.part_pour end as ma_part,
           case when e.de = me then e.part_pour else e.part_de end as sa_part,
           (select pseudo from public.joueurs where id = case when e.de = me then e.pour else e.de end) as autre,
           public.echange_cartes_json(e.id, case when e.de = me then 'de' else 'pour' end) as je_donne,
           public.echange_cartes_json(e.id, case when e.de = me then 'pour' else 'de' end) as je_recois
    from public.echanges e
    where (e.de = me or e.pour = me)
      and (e.statut = 'ouvert' or e.id in (select id from public.echanges where (de = me or pour = me) and statut <> 'ouvert' order by fini_le desc nulls last limit 10))
  ) x), '[]'::jsonb);
end $$;
grant execute on function public.mes_echanges() to authenticated;

-- Overlay OBS : le dernier échange réussi pas encore annoncé (moins de 15 minutes)
create or replace function public.echange_a_annoncer()
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.echanges;
begin
  select * into e from public.echanges where statut = 'valide' and not annonce and fini_le > now() - interval '15 minutes'
   order by fini_le limit 1 for update skip locked;
  if e.id is null then return null; end if;
  update public.echanges set annonce = true where id = e.id;
  return jsonb_build_object('id', e.id, 'a', (select pseudo from public.joueurs where id = e.de), 'b', (select pseudo from public.joueurs where id = e.pour),
    'cartes_a', public.echange_cartes_json(e.id, 'de'), 'cartes_b', public.echange_cartes_json(e.id, 'pour'));
end $$;
revoke all on function public.echange_a_annoncer() from public;
grant execute on function public.echange_a_annoncer() to anon, authenticated;

-- ================= Recyclage des doublons en fragments (au lieu du gold) =================
create or replace function public.recycler_doublons_fragments(p_variante bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int; f int;
begin
  if me is null then raise exception 'Non connecté'; end if;
  select coalesce(sum(c.quantite - 1), 0), coalesce(sum((c.quantite - 1) * public.reglage_num('fragments_recyclage_' || v.rang,
           case v.rang when 'ggez' then 40 when 'legendaire' then 25 when 'epique' then 12 when 'rare' then 4 else 2 end)), 0)
    into n, f
    from public.echange_coll c join public.echange_var v on v.variante_id = c.variante_id
   where c.joueur_id = me and c.quantite > 1 and (p_variante is null or c.variante_id = p_variante);
  if n <= 0 then raise exception 'RIEN_A_RECYCLER'; end if;
  update public.echange_coll set quantite = 1 where joueur_id = me and quantite > 1 and (p_variante is null or variante_id = p_variante);
  update public.joueurs set fragments = coalesce(fragments, 0) + f where id = me;
  return jsonb_build_object('cartes', n, 'gold', 0, 'fragments', f);
end $$;
grant execute on function public.recycler_doublons_fragments(bigint) to authenticated;

-- Prix de recyclage en fragments (affichage sur le site)
create or replace function public.prix_fragments_recyclage()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('commun', public.reglage_num('fragments_recyclage_commun', 2), 'rare', public.reglage_num('fragments_recyclage_rare', 4),
    'epique', public.reglage_num('fragments_recyclage_epique', 12), 'legendaire', public.reglage_num('fragments_recyclage_legendaire', 25),
    'ggez', public.reglage_num('fragments_recyclage_ggez', 40));
$$;
grant execute on function public.prix_fragments_recyclage() to authenticated;

-- ================= Rattrapage unique du compteur « Boosters ouverts » =================
do $$
begin
  if not exists (select 1 from public.reglages_jeu where cle = 'echange_rattrapage_boosters') then
    update public.stats_joueurs s set boosters_ouverts = greatest(coalesce(s.boosters_ouverts, 0), t.n)
      from (select joueur_id, floor(sum(quantite) / 5.0)::int n from public.echange_coll group by joueur_id) t
     where s.joueur_id = t.joueur_id;
    insert into public.stats_joueurs (joueur_id, boosters_ouverts)
      select t.joueur_id, t.n from (select joueur_id, floor(sum(quantite) / 5.0)::int n from public.echange_coll group by joueur_id) t
       where not exists (select 1 from public.stats_joueurs s where s.joueur_id = t.joueur_id) and t.joueur_id in (select id from public.joueurs);
    insert into public.reglages_jeu (cle, valeur) values ('echange_rattrapage_boosters', to_char(now(), 'YYYY-MM-DD'));
  end if;
end $$;

-- Vérification : qui peut échanger aujourd'hui
select j.pseudo, coalesce(s.boosters_ouverts, 0) as boosters_ouverts,
       floor(extract(epoch from now() - u.created_at) / 86400) as anciennete_jours,
       coalesce(array_to_string(public.echange_raisons(j.id), ', '), '') as bloque_par
from public.joueurs j left join public.stats_joueurs s on s.joueur_id = j.id left join auth.users u on u.id = j.id
order by 2 desc;
