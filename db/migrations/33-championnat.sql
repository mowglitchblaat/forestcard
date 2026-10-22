-- 33-championnat.sql — Forest Card
-- Le championnat : 3 ceintures (Rare, Épique, Libre), un champion par ceinture, vacantes au lancement.
--
--   - Decks de championnat (onglet Mon deck) : un par ceinture, 15 cartes différentes, 5 combattants,
--     5 magies, 5 pièges. Ceinture Rare : cartes communes et rares seulement. Épique : jusqu'à épique.
--     Libre : toutes les raretés.
--   - Combat pour le titre : en relais, 3 combattants par joueur (moteur : simulerRelais), uniquement en live
--     (!accepter dans le chat). Le vainqueur gagne 500 gold, le perdant 150 (match nul : 150 chacun ;
--     réglages titre_gain, titre_perte). Un seul combat pour le titre par jour et par joueur (jour de Paris).
--   - Défi : un joueur défie le champion (ou, ceinture vacante, le joueur de son choix) ; le défié
--     accepte (!accepter) ou refuse (!refuser). Un seul défi en attente par ceinture. Sans réponse,
--     le défi expire au bout de 24 h (réglage titre_defi_heures), sans compter comme un refus.
--   - Le champion perd sa ceinture : s'il perd un combat pour le titre ; à son 3e refus (réglage
--     titre_refus_max) ; après 7 jours sans combat pour le titre (réglage titre_inactivite_jours).
--     Une ceinture perdue sans combat redevient vacante. Quand le jeu est en pause (let's play), les
--     7 jours et les 24 h d'un défi sont arrêtés.
--   - Prime : à chaque fin de journée (minuit, Paris) de règne où il a fait un combat pour le titre (sinon rien,
--     et la série repart de zéro), le champion reçoit 90 gold par ceinture,
--     +10 % par journée active consécutive (2e jour 99, 3e 108…), +15 % par ceinture détenue en plus
--     (2 ceintures : +15 %, 3 : +30 %). Réglages titre_prime, titre_prime_jour, titre_prime_ceinture.
--     Les journées sont payées dès que quelqu'un consulte les ceintures ou lance un défi (pas besoin de tâche planifiée). Le vainqueur d'un combat pour une ceinture
--     vacante la prend. Match nul : le champion la garde, une ceinture vacante le reste.
--
-- Utilise les vues echange_coll / echange_var et les fonctions rang_rarete, reglage_num
-- (28-echanges.sql). À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

-- ================= Réglages =================
insert into public.reglages_jeu (cle, valeur) values
  ('titre_defi_heures', '24'),        -- un défi sans réponse expire au bout de N heures
  ('titre_refus_max', '3'),           -- au N-ième refus, le champion perd sa ceinture
  ('titre_inactivite_jours', '7'),    -- N jours sans combat pour le titre : la ceinture redevient vacante
  ('titre_prime', '90'),              -- prime du champion à chaque fin de journée de règne (par ceinture)
  ('titre_prime_jour', '10'),         -- + N % par journée consécutive de règne (1er jour 90, 2e 99, 3e 108…)
  ('titre_prime_ceinture', '15'),     -- + N % par ceinture détenue en plus (2 ceintures : +15 %, 3 : +30 %)
  ('titre_gain', '500'),              -- gold du vainqueur d'un combat pour le titre
  ('titre_perte', '150')              -- gold du perdant (et de chacun en cas de match nul)
on conflict (cle) do nothing;

-- ================= Tables =================
create table if not exists public.decks_championnat (
  joueur_id uuid not null,
  division text not null check (division in ('rare', 'epique', 'libre')),
  cartes bigint[] not null,
  maj timestamptz not null default now(),
  primary key (joueur_id, division)
);
create table if not exists public.ceintures (
  division text primary key check (division in ('rare', 'epique', 'libre')),
  champion uuid,                      -- null : vacante
  depuis timestamptz,                 -- début du règne
  dernier_titre timestamptz,          -- dernier combat pour le titre du champion (inactivité)
  refus int not null default 0,       -- refus pendant ce règne
  defenses int not null default 0     -- combats pour le titre gagnés (ou nuls) pendant ce règne
);
insert into public.ceintures (division) values ('rare'), ('epique'), ('libre') on conflict do nothing;
-- Primes (relance du script : colonnes ajoutées sans rien perdre)
alter table public.ceintures add column if not exists jours int not null default 0;     -- journées de règne déjà payées
alter table public.ceintures add column if not exists prime_jusqu date;                  -- dernier jour (Paris) payé
create table if not exists public.regnes (
  id bigserial primary key,
  division text not null,
  joueur_id uuid not null,
  debut timestamptz not null default now(),
  fin timestamptz,
  defenses int not null default 0,
  raison text                         -- 'defaite', 'refus', 'inactivite' (null : en cours)
);
alter table public.regnes add column if not exists primes int not null default 0;
create index if not exists regnes_division_idx on public.regnes (division, debut desc);
create table if not exists public.defis_titre (
  id bigserial primary key,
  division text not null,
  challenger uuid not null,
  adversaire uuid not null,           -- le champion, ou le joueur choisi si la ceinture est vacante
  pour_champion boolean not null,     -- l'adversaire était le champion au moment du défi
  statut text not null default 'attente' check (statut in ('attente', 'joue', 'refuse', 'expire', 'annule')),
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null,
  fini_le timestamptz,
  gagnant uuid,
  seed text
);
create index if not exists defis_titre_idx on public.defis_titre (division, statut);
alter table public.decks_championnat enable row level security;
alter table public.ceintures enable row level security;
alter table public.regnes enable row level security;
alter table public.defis_titre enable row level security;
revoke all on public.decks_championnat, public.ceintures, public.regnes, public.defis_titre from anon, authenticated;
grant select on public.decks_championnat to authenticated;
drop policy if exists "decks championnat : les siens" on public.decks_championnat;
create policy "decks championnat : les siens" on public.decks_championnat for select to authenticated using (joueur_id = auth.uid());

-- ================= Outils internes =================
create or replace function public.titre_nom(p_division text)
returns text language sql immutable as $$
  select case p_division when 'rare' then 'Ceinture Rare' when 'epique' then 'Ceinture Épique' else 'Ceinture Libre' end;
$$;

-- Ce qui ne va pas dans un deck de championnat (null : il est valide)
create or replace function public.titre_deck_probleme(p_joueur uuid, p_division text, p_cartes bigint[])
returns text language plpgsql stable security definer set search_path = public as $$
declare n int; nc int; nm int; np int; hors int; rangs text[];
begin
  rangs := case p_division when 'rare' then array['commun', 'rare'] when 'epique' then array['commun', 'rare', 'epique'] else null end;
  select count(distinct x) into n from unnest(coalesce(p_cartes, '{}')) x;
  if n <> 15 then return format('il faut 15 cartes différentes (%s)', n); end if;
  -- cartes possédées (au moins un exemplaire, toutes versions confondues)
  select count(*) into hors from (select distinct x from unnest(p_cartes) x) d
   where not exists (select 1 from public.echange_coll c join public.echange_var v on v.variante_id = c.variante_id
                      where c.joueur_id = p_joueur and v.carte_id = d.x and c.quantite > 0);
  if hors > 0 then return format('%s carte(s) ne sont plus dans ta collection', hors); end if;
  select count(*) filter (where t = 'combattant'), count(*) filter (where t = 'magie'), count(*) filter (where t = 'piege'),
         count(*) filter (where rangs is not null and not (r = any(rangs)))
    into nc, nm, np, hors
    from (select distinct on (v.carte_id) v.carte_id, v.type as t, v.rang as r from public.echange_var v
           where v.carte_id = any(p_cartes)) d;
  if nc <> 5 or nm <> 5 or np <> 5 then return format('il faut 5 combattants, 5 magies et 5 pièges (%s, %s, %s)', nc, nm, np); end if;
  if hors > 0 then return format('%s carte(s) trop rares pour la %s', hors, public.titre_nom(p_division)); end if;
  return null;
end $$;

-- Les décisions sans combat : défis expirés, champions inactifs. Appelée avant chaque lecture ou action.
-- Prime d'une journée de règne : base × (1 + 10 % par jour consécutif après le 1er) × (1 + 15 % par ceinture en plus)
create or replace function public.titre_prime(p_jour int, p_nb int)
returns int language sql stable security definer set search_path = public as $$
  select round(public.reglage_num('titre_prime', 90) * (1 + public.reglage_num('titre_prime_jour', 10) / 100 * greatest(0, p_jour - 1))
               * (1 + public.reglage_num('titre_prime_ceinture', 15) / 100 * greatest(0, p_nb - 1)))::int;
$$;
revoke all on function public.titre_prime(int, int) from public, anon, authenticated;

-- Le jour de Paris, et le minuit (Paris) qui le commence
create or replace function public.titre_jour() returns date language sql stable as $$ select (now() at time zone 'Europe/Paris')::date $$;
create or replace function public.titre_minuit(p_jour date) returns timestamptz language sql stable as $$ select p_jour::timestamp at time zone 'Europe/Paris' $$;

-- Paye les journées de règne terminées (une prime par ceinture), tant que le champion n'est pas inactif. Une journée ne paie
-- que si le champion y a fait un combat pour le titre ; sinon rien, et la série des +10 % repart de zéro.
create or replace function public.titre_primes()
returns void language plpgsql security definer set search_path = public as $$
declare c public.ceintures; j date; nb int; p int; limite timestamptz;
begin
  for c in select * from public.ceintures where champion is not null for update loop
    if c.prime_jusqu is null then
      update public.ceintures set prime_jusqu = (coalesce(c.depuis, now()) at time zone 'Europe/Paris')::date - 1 where division = c.division;
      continue;
    end if;
    limite := coalesce(c.dernier_titre, c.depuis) + make_interval(days => public.reglage_num('titre_inactivite_jours', 7)::int);
    j := c.prime_jusqu + 1;
    -- journée j payée à son minuit de fin (j + 1) ; seulement si le champion a fait un combat pour le titre ce jour-là
    while j < public.titre_jour() and public.titre_minuit(j + 1) <= limite loop
      if exists (select 1 from public.defis_titre d where d.statut = 'joue' and c.champion in (d.challenger, d.adversaire)
                  and d.fini_le >= public.titre_minuit(j) and d.fini_le < public.titre_minuit(j + 1)) then
        select count(*) into nb from public.ceintures where champion = c.champion;
        c.jours := c.jours + 1;
        p := public.titre_prime(c.jours, nb);
        update public.joueurs set monnaie = coalesce(monnaie, 0) + p where id = c.champion;
        update public.regnes set primes = primes + p where division = c.division and fin is null;
      else
        c.jours := 0;   -- journée sans combat pour le titre : pas de prime, la série repart à 90
      end if;
      update public.ceintures set jours = c.jours, prime_jusqu = j where division = c.division;
      j := j + 1;
    end loop;
  end loop;
end $$;
revoke all on function public.titre_primes() from public, anon, authenticated;

-- Nouveau champion (ou ceinture vacante) : le compteur de journées repart de zéro
create or replace function public.titre_nouveau_regne()
returns trigger language plpgsql as $$
begin
  if new.champion is distinct from old.champion then
    new.jours := 0;
    new.prime_jusqu := case when new.champion is null then null else public.titre_jour() - 1 end;   -- le jour de la conquête compte
  end if;
  return new;
end $$;
drop trigger if exists titre_nouveau_regne on public.ceintures;
create trigger titre_nouveau_regne before update on public.ceintures for each row execute function public.titre_nouveau_regne();

create or replace function public.titre_maj()
returns void language plpgsql security definer set search_path = public as $$
declare c public.ceintures;
begin
  perform public.titre_primes();   -- les primes se paient même pendant la pause
  -- jeu en pause (let's play) : les compteurs sont arrêtés, rien n'expire
  if coalesce((select valeur from public.reglages_jeu where cle = 'jeu_live'), '1') = '0' then return; end if;
  update public.defis_titre set statut = 'expire', fini_le = now() where statut = 'attente' and expire_le < now();
  for c in select * from public.ceintures where champion is not null
    and coalesce(dernier_titre, depuis) < now() - make_interval(days => public.reglage_num('titre_inactivite_jours', 7)::int) loop
    perform public.titre_vacante(c.division, 'inactivite');
  end loop;
end $$;

-- Pause du jeu (32-mode-site.sql, interrupteur jeu_live) : le temps de pause ne compte ni dans les 7 jours
-- d'inactivité ni dans les 24 h d'un défi. À la mise en pause, on note l'heure ; à la reprise, les compteurs
-- sont décalés d'autant.
create or replace function public.titre_pause()
returns trigger language plpgsql security definer set search_path = public as $$
declare debut timestamptz; duree interval;
begin
  if new.cle <> 'jeu_live' or (tg_op = 'UPDATE' and coalesce(old.valeur, '1') = coalesce(new.valeur, '1')) then return new; end if;
  if new.valeur = '0' then
    insert into public.reglages_jeu (cle, valeur) values ('titre_pause_debut', now()::text)
      on conflict (cle) do update set valeur = excluded.valeur;
  else
    select nullif(valeur, '')::timestamptz into debut from public.reglages_jeu where cle = 'titre_pause_debut';
    if debut is not null then
      duree := now() - debut;
      update public.ceintures set dernier_titre = dernier_titre + duree, depuis = depuis + duree where champion is not null;
      update public.defis_titre set expire_le = expire_le + duree where statut = 'attente';
      update public.reglages_jeu set valeur = '' where cle = 'titre_pause_debut';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.titre_pause() from public, anon, authenticated;
drop trigger if exists titre_pause on public.reglages_jeu;
create trigger titre_pause after insert or update on public.reglages_jeu for each row execute function public.titre_pause();

-- Le champion perd sa ceinture sans combat : elle redevient vacante
create or replace function public.titre_vacante(p_division text, p_raison text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.regnes set fin = now(), raison = p_raison where division = p_division and fin is null;
  update public.ceintures set champion = null, depuis = null, dernier_titre = null, refus = 0, defenses = 0 where division = p_division;
  update public.defis_titre set statut = 'annule', fini_le = now() where division = p_division and statut = 'attente' and pour_champion;
end $$;

-- Le joueur a déjà fait son combat pour le titre aujourd'hui (jour de Paris)
create or replace function public.titre_deja_joue(p_joueur uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.defis_titre where statut = 'joue' and p_joueur in (challenger, adversaire)
    and fini_le >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris');
$$;

create or replace function public.titre_joueur(p_twitch_id text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.joueurs where twitch_id::text = p_twitch_id limit 1;
$$;

revoke all on function public.titre_deck_probleme(uuid, text, bigint[]) from public, anon, authenticated;
revoke all on function public.titre_maj() from public, anon, authenticated;
revoke all on function public.titre_vacante(text, text) from public, anon, authenticated;
revoke all on function public.titre_joueur(text) from public, anon, authenticated;
revoke all on function public.titre_deja_joue(uuid) from public, anon, authenticated;

-- ================= Site : decks de championnat =================
create or replace function public.enregistrer_deck_championnat(p_division text, p_cartes bigint[])
returns void language plpgsql security definer set search_path = public as $$
declare pb text;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour enregistrer ton deck'; end if;
  if p_division not in ('rare', 'epique', 'libre') then raise exception 'Ceinture inconnue'; end if;
  if p_cartes is null or cardinality(p_cartes) = 0 then
    delete from public.decks_championnat where joueur_id = auth.uid() and division = p_division; return;
  end if;
  pb := public.titre_deck_probleme(auth.uid(), p_division, p_cartes);
  if pb is not null then raise exception 'Deck de championnat invalide : %', pb; end if;
  insert into public.decks_championnat (joueur_id, division, cartes, maj)
  values (auth.uid(), p_division, (select array_agg(distinct x) from unnest(p_cartes) x), now())
  on conflict (joueur_id, division) do update set cartes = excluded.cartes, maj = now();
end $$;
revoke all on function public.enregistrer_deck_championnat(text, bigint[]) from public, anon;
grant execute on function public.enregistrer_deck_championnat(text, bigint[]) to authenticated;

-- ================= Lecture publique : les ceintures, les défis en attente, l'historique des règnes =================
create or replace function public.ceintures_etat()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.titre_maj();
  return jsonb_build_object(
    'ceintures', (select coalesce(jsonb_agg(jsonb_build_object(
        'division', c.division, 'nom', public.titre_nom(c.division), 'champion', c.champion, 'pseudo', j.pseudo,
        'depuis', c.depuis, 'dernier_titre', c.dernier_titre, 'refus', c.refus, 'defenses', c.defenses,
        'refus_max', public.reglage_num('titre_refus_max', 3),
        'defendu', exists (select 1 from public.defis_titre d where d.statut = 'joue' and c.champion in (d.challenger, d.adversaire)
           and d.fini_le >= public.titre_minuit(public.titre_jour())),
        'jours', c.jours, 'prime', case when c.champion is not null then public.titre_prime(c.jours + 1,
           (select count(*)::int from public.ceintures k where k.champion = c.champion)) end,
        'vacante_le', case when c.champion is not null then coalesce(c.dernier_titre, c.depuis)
                        + make_interval(days => public.reglage_num('titre_inactivite_jours', 7)::int) end)
        order by array_position(array['rare', 'epique', 'libre'], c.division)), '[]')
      from public.ceintures c left join public.joueurs j on j.id = c.champion),
    'defis', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'division', d.division, 'challenger', d.challenger, 'pseudo_challenger', a.pseudo,
        'adversaire', d.adversaire, 'pseudo_adversaire', b.pseudo, 'expire_le', d.expire_le) order by d.cree_le), '[]')
      from public.defis_titre d join public.joueurs a on a.id = d.challenger join public.joueurs b on b.id = d.adversaire
      where d.statut = 'attente'),
    'regnes', (select coalesce(jsonb_agg(x order by x->>'debut' desc), '[]') from (
        select jsonb_build_object('division', r.division, 'joueur', r.joueur_id, 'pseudo', j.pseudo, 'debut', r.debut, 'fin', r.fin,
               'defenses', r.defenses, 'raison', r.raison, 'primes', r.primes) x
        from public.regnes r left join public.joueurs j on j.id = r.joueur_id order by r.debut desc limit 60) y));
end $$;
revoke all on function public.ceintures_etat() from public;
grant execute on function public.ceintures_etat() to anon, authenticated;

-- ================= swift-responder (clé de service) : défier, refuser, préparer et conclure un combat pour le titre =================
-- Défi : p_adversaire (twitch_id ou pseudo) seulement si la ceinture est vacante
create or replace function public.titre_defier(p_twitch_id text, p_division text, p_adversaire text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; adv uuid; c public.ceintures; pb text; dc bigint[]; d public.defis_titre;
begin
  perform public.titre_maj();
  me := public.titre_joueur(p_twitch_id);
  if me is null then raise exception 'Joueur inconnu : connecte-toi une fois au site'; end if;
  if p_division not in ('rare', 'epique', 'libre') then raise exception 'Précise la ceinture : rare, épique ou libre'; end if;
  select * into c from public.ceintures where division = p_division for update;
  select * into d from public.defis_titre where division = p_division and statut = 'attente' limit 1;
  if d.id is not null then raise exception 'Un défi pour la % est déjà en attente : attends sa réponse', public.titre_nom(p_division); end if;
  if c.champion is not null then
    if c.champion = me then raise exception 'Tu es déjà le champion de la %', public.titre_nom(p_division); end if;
    adv := c.champion;
  else
    if coalesce(trim(p_adversaire), '') = '' then
      raise exception 'La % est vacante : écris le @ du joueur à affronter pour la prendre', public.titre_nom(p_division); end if;
    select id into adv from public.joueurs where twitch_id::text = trim(p_adversaire)
       or lower(pseudo) = lower(ltrim(trim(p_adversaire), '@')) limit 1;
    if adv is null then raise exception 'Joueur introuvable : %', p_adversaire; end if;
    if adv = me then raise exception 'Tu ne peux pas te défier toi-même'; end if;
  end if;
  if public.titre_deja_joue(me) then raise exception 'Tu as déjà fait ton combat pour le titre aujourd''hui, reviens demain !'; end if;
  if public.titre_deja_joue(adv) then raise exception '% a déjà fait son combat pour le titre aujourd''hui, défie-le demain !', (select pseudo from public.joueurs where id = adv); end if;
  select cartes into dc from public.decks_championnat where joueur_id = me and division = p_division;
  pb := case when dc is null then 'tu n''as pas de deck pour cette ceinture' else public.titre_deck_probleme(me, p_division, dc) end;
  if pb is not null then raise exception 'Ton deck de championnat (%) n''est pas prêt : % (onglet Mon deck du site)', public.titre_nom(p_division), pb; end if;
  select cartes into dc from public.decks_championnat where joueur_id = adv and division = p_division;
  if c.champion is null and (dc is null or public.titre_deck_probleme(adv, p_division, dc) is not null) then
    raise exception '% n''a pas de deck valide pour la %', (select pseudo from public.joueurs where id = adv), public.titre_nom(p_division); end if;
  insert into public.defis_titre (division, challenger, adversaire, pour_champion, expire_le)
  values (p_division, me, adv, c.champion is not null, now() + make_interval(hours => public.reglage_num('titre_defi_heures', 24)::int))
  returning * into d;
  return jsonb_build_object('id', d.id, 'division', p_division, 'nom', public.titre_nom(p_division), 'pour_champion', d.pour_champion,
    'challenger', (select pseudo from public.joueurs where id = me), 'adversaire', (select pseudo from public.joueurs where id = adv),
    'heures', public.reglage_num('titre_defi_heures', 24));
end $$;

-- Le défié refuse son défi (le plus ancien en attente, ou celui de p_division)
create or replace function public.titre_refuser(p_twitch_id text, p_division text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; d public.defis_titre; c public.ceintures; perdu boolean := false; mx int;
begin
  perform public.titre_maj();
  me := public.titre_joueur(p_twitch_id);
  select * into d from public.defis_titre where adversaire = me and statut = 'attente'
    and (coalesce(p_division, '') = '' or division = p_division) order by cree_le limit 1 for update;
  if d.id is null then raise exception 'Aucun défi en attente contre toi'; end if;
  update public.defis_titre set statut = 'refuse', fini_le = now() where id = d.id;
  select * into c from public.ceintures where division = d.division for update;
  mx := public.reglage_num('titre_refus_max', 3)::int;
  if d.pour_champion and c.champion = me then
    update public.ceintures set refus = refus + 1 where division = d.division returning * into c;
    if c.refus >= mx then perform public.titre_vacante(d.division, 'refus'); perdu := true; end if;
  end if;
  return jsonb_build_object('division', d.division, 'nom', public.titre_nom(d.division), 'pour_champion', d.pour_champion,
    'refus', c.refus, 'refus_max', mx, 'perdue', perdu,
    'challenger', (select pseudo from public.joueurs where id = d.challenger), 'adversaire', (select pseudo from public.joueurs where id = me));
end $$;

-- Le défié accepte : le défi et les deux decks (cartes complètes, image de la version la plus rare possédée)
create or replace function public.titre_preparer(p_twitch_id text, p_division text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; d public.defis_titre; da bigint[]; db bigint[]; pb text;
begin
  perform public.titre_maj();
  me := public.titre_joueur(p_twitch_id);
  select * into d from public.defis_titre where adversaire = me and statut = 'attente'
    and (coalesce(p_division, '') = '' or division = p_division) order by cree_le limit 1;
  if d.id is null then raise exception 'Aucun défi en attente contre toi'; end if;
  if public.titre_deja_joue(me) then raise exception 'Tu as déjà fait ton combat pour le titre aujourd''hui : accepte ce défi demain (il expire le %)',
    to_char(d.expire_le at time zone 'Europe/Paris', 'DD/MM à HH24:MI'); end if;
  if public.titre_deja_joue(d.challenger) then raise exception '% a déjà fait son combat pour le titre aujourd''hui : accepte ce défi demain',
    (select pseudo from public.joueurs where id = d.challenger); end if;
  select cartes into da from public.decks_championnat where joueur_id = d.challenger and division = d.division;
  pb := case when da is null then 'deck supprimé' else public.titre_deck_probleme(d.challenger, d.division, da) end;
  if pb is not null then
    update public.defis_titre set statut = 'annule', fini_le = now() where id = d.id;
    raise exception 'Défi annulé : le deck de % n''est plus valide (%)', (select pseudo from public.joueurs where id = d.challenger), pb;
  end if;
  select cartes into db from public.decks_championnat where joueur_id = me and division = d.division;
  pb := case when db is null then 'tu n''as pas de deck pour cette ceinture' else public.titre_deck_probleme(me, d.division, db) end;
  if pb is not null then raise exception 'Ton deck de championnat (%) n''est pas prêt : % (onglet Mon deck du site)', public.titre_nom(d.division), pb; end if;
  return jsonb_build_object('id', d.id, 'division', d.division, 'nom', public.titre_nom(d.division), 'pour_champion', d.pour_champion,
    'gain', public.reglage_num('titre_gain', 500), 'perte', public.reglage_num('titre_perte', 150),
    'a', public.titre_deck_json(d.challenger, da), 'b', public.titre_deck_json(me, db));
end $$;

create or replace function public.titre_deck_json(p_joueur uuid, p_cartes bigint[])
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', j.id, 'pseudo', j.pseudo, 'deck', (
    select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('image', v.image_path, 'imageCombat', v.image_combat)), '[]')
    from public.cartes c
    cross join lateral (select vv.image_path, vv.image_combat from public.variantes_carte vv
       join public.echange_coll k on k.variante_id = vv.id and k.joueur_id = p_joueur and k.quantite > 0
       where vv.carte_id = c.id order by coalesce(vv.poids, 100), vv.id limit 1) v
    where c.id = any(p_cartes)))
  from public.joueurs j where j.id = p_joueur;
$$;

-- Le combat a eu lieu : la ceinture, le règne, le défi, les gains
create or replace function public.titre_conclure(p_defi bigint, p_gagnant int, p_seed text, p_gain_a int, p_gain_b int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.defis_titre; c public.ceintures; w uuid; change boolean := false; ancien uuid;
begin
  select * into d from public.defis_titre where id = p_defi for update;
  if d.id is null or d.statut <> 'attente' then raise exception 'Défi déjà joué'; end if;
  w := case p_gagnant when 0 then d.challenger when 1 then d.adversaire end;
  update public.defis_titre set statut = 'joue', fini_le = now(), gagnant = w, seed = p_seed where id = d.id;
  update public.joueurs set monnaie = coalesce(monnaie, 0) + greatest(0, p_gain_a) where id = d.challenger;
  update public.joueurs set monnaie = coalesce(monnaie, 0) + greatest(0, p_gain_b) where id = d.adversaire;
  select * into c from public.ceintures where division = d.division for update;
  ancien := c.champion;
  if w is not null and (c.champion is null or c.champion <> w) and (c.champion is null or c.champion in (d.challenger, d.adversaire)) then
    -- nouveau champion
    update public.regnes set fin = now(), raison = 'defaite' where division = d.division and fin is null;
    update public.ceintures set champion = w, depuis = now(), dernier_titre = now(), refus = 0, defenses = 0 where division = d.division;
    insert into public.regnes (division, joueur_id) values (d.division, w);
    change := true;
  elsif c.champion is not null and c.champion in (d.challenger, d.adversaire) then
    -- le champion garde sa ceinture (victoire ou nul)
    update public.ceintures set dernier_titre = now(), defenses = defenses + 1 where division = d.division;
    update public.regnes set defenses = defenses + 1 where division = d.division and fin is null;
  end if;
  return jsonb_build_object('division', d.division, 'nom', public.titre_nom(d.division), 'nouveau', change,
    'champion', (select pseudo from public.joueurs j join public.ceintures k on k.champion = j.id where k.division = d.division),
    'ancien', (select pseudo from public.joueurs where id = ancien),
    'defenses', (select defenses from public.ceintures where division = d.division));
end $$;

revoke all on function public.titre_defier(text, text, text) from public, anon, authenticated;
revoke all on function public.titre_refuser(text, text) from public, anon, authenticated;
revoke all on function public.titre_preparer(text, text) from public, anon, authenticated;
revoke all on function public.titre_deck_json(uuid, bigint[]) from public, anon, authenticated;
revoke all on function public.titre_conclure(bigint, int, text, int, int) from public, anon, authenticated;
-- swift-responder appelle ces fonctions avec la clé de service (rôle service_role)
grant execute on function public.ceintures_etat() to service_role;
grant execute on function public.titre_defier(text, text, text) to service_role;
grant execute on function public.titre_refuser(text, text) to service_role;
grant execute on function public.titre_preparer(text, text) to service_role;
grant execute on function public.titre_conclure(bigint, int, text, int, int) to service_role;
