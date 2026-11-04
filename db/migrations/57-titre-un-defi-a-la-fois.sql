-- 57-titre-un-defi-a-la-fois.sql — Forest Card
-- Championnat : pas de défi pendant un combat, et pas de rafale de défis.
-- Un nouveau !defi est refusé, et son auteur reçoit un avertissement :
--   - tant qu'un combat pour le titre est encore à l'écran, toutes ceintures confondues (même signal que
--     37-ceintures-sans-spoil.sql : fin de l'animation, ou 15 minutes sans overlay), sans rien révéler du résultat ;
--   - dans les 10 minutes (réglage titre_defi_delai_minutes) qui suivent un autre défi encore en attente, sur
--     n'importe quelle ceinture : lancer les 3 ceintures d'un coup est sanctionné.
-- Passé ce délai, on peut défier pour une autre ceinture même si un défi attend toujours sa réponse.
-- Sur la même ceinture, un seul défi en attente à la fois (refus simple, sans avertissement).
-- Relancer ce script après une première version : il remplace simplement titre_defier.
-- Un seul avertissement par joueur et par défi en cours : répéter !defi pendant le même combat ne le fait pas monter.
-- Au 3e avertissement (réglage titre_avertissements_max), le joueur est privé de combats de ceinture pendant
-- 7 jours (réglage titre_privation_jours) : il ne peut plus défier, et ses défis en attente sont annulés.
-- Le compteur repart à zéro après une privation.
-- À lancer une fois dans Supabase (SQL Editor), après 56-cadeaux-cartes.sql ; peut être relancé sans risque.
--
-- Lever une privation à la main :
--   update public.titre_privations set fin = now() where joueur_id = (select id from public.joueurs where lower(pseudo) = 'pseudo') and fin > now();
-- Effacer les avertissements d'un joueur :
--   update public.titre_avertissements set efface = true where joueur_id = (select id from public.joueurs where lower(pseudo) = 'pseudo') and not efface;

create table if not exists public.titre_avertissements (
  id bigserial primary key,
  joueur_id uuid not null references public.joueurs (id) on delete cascade,
  defi_id bigint not null,   -- le défi qui était en cours au moment de la tentative
  cree_le timestamptz not null default now(),
  efface boolean not null default false,   -- true une fois qu'une privation a été prononcée (ou effacé à la main)
  unique (joueur_id, defi_id)
);
create table if not exists public.titre_privations (
  id bigserial primary key,
  joueur_id uuid not null references public.joueurs (id) on delete cascade,
  debut timestamptz not null default now(),
  fin timestamptz not null
);
create index if not exists titre_privations_idx on public.titre_privations (joueur_id, fin);
alter table public.titre_avertissements enable row level security;
alter table public.titre_privations enable row level security;
revoke all on public.titre_avertissements, public.titre_privations from anon, authenticated;

-- Fin de la privation en cours d'un joueur (null s'il n'est pas privé)
create or replace function public.titre_prive_jusqua(p_joueur uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select max(fin) from public.titre_privations where joueur_id = p_joueur and fin > now();
$$;
revoke all on function public.titre_prive_jusqua(uuid) from public, anon, authenticated;

create or replace function public.titre_defier(p_twitch_id text, p_division text, p_adversaire text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; adv uuid; c public.ceintures; pb text; dc bigint[]; d public.defis_titre;
        bloque bigint; nouveau int; nb int; maxi int; jours int; jusqua timestamptz; moi text;
begin
  perform public.titre_maj();
  me := public.titre_joueur(p_twitch_id);
  if me is null then raise exception 'Joueur inconnu : connecte-toi une fois au site'; end if;
  jusqua := public.titre_prive_jusqua(me);
  if jusqua is not null then raise exception '⛔ Tu es privé de combats de ceinture jusqu''au % (trop d''avertissements).',
    to_char(jusqua at time zone 'Europe/Paris', 'DD/MM à HH24:MI'); end if;

  -- Un combat pour le titre encore à l'écran (toutes ceintures), puis un défi en attente lancé il y a moins de 10 minutes
  select d2.id into bloque from public.defis_titre d2
  where d2.statut = 'joue' and d2.fini_le > now() - interval '15 minutes'
    and not exists (select 1 from public.historique_combats h where h.seed::text = d2.seed and h.affiche)
  order by d2.fini_le limit 1;
  if bloque is null then
    select d2.id into bloque from public.defis_titre d2
    where d2.statut = 'attente'
      and d2.cree_le > now() - make_interval(mins => greatest(0, public.reglage_num('titre_defi_delai_minutes', 10))::int)
    order by d2.cree_le desc limit 1;
  end if;
  if bloque is not null then
    maxi := greatest(1, public.reglage_num('titre_avertissements_max', 3)::int);
    jours := greatest(1, public.reglage_num('titre_privation_jours', 7)::int);
    moi := (select pseudo from public.joueurs where id = me);
    insert into public.titre_avertissements (joueur_id, defi_id) values (me, bloque) on conflict (joueur_id, defi_id) do nothing;
    get diagnostics nouveau = row_count;
    select count(*) into nb from public.titre_avertissements where joueur_id = me and not efface;
    -- refus sans exception (statut HTTP 409) pour que l'avertissement soit bien enregistré
    perform set_config('response.status', '409', true);
    if nb >= maxi then
      jusqua := now() + make_interval(days => jours);
      insert into public.titre_privations (joueur_id, fin) values (me, jusqua);
      update public.titre_avertissements set efface = true where joueur_id = me and not efface;
      update public.defis_titre set statut = 'annule', fini_le = now() where challenger = me and statut = 'attente';
      return jsonb_build_object('message', format('⛔ %s, %s avertissements : privé de combats de ceinture pendant %s jours (jusqu''au %s). Un défi à la fois, ça vaut pour tout le monde !',
        moi, maxi, jours, to_char(jusqua at time zone 'Europe/Paris', 'DD/MM à HH24:MI')));
    end if;
    if nouveau = 0 then
      return jsonb_build_object('message', format('✋ %s, toujours pas : patience, un défi à la fois ! (avertissement %s/%s)', moi, nb, maxi));
    end if;
    return jsonb_build_object('message', format('✋ Doucement %s ! Un défi à la fois, une ceinture à la fois : attends la fin du combat en cours, ou %s minutes après le dernier défi. ⚠️ Avertissement %s/%s (au %se : privé de combats de ceinture pendant %s jours).',
      moi, greatest(0, public.reglage_num('titre_defi_delai_minutes', 10))::int, nb, maxi, maxi, jours));
  end if;

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
    if public.titre_prive_jusqua(adv) is not null then raise exception '% est privé de combats de ceinture en ce moment', (select pseudo from public.joueurs where id = adv); end if;
  end if;
  if public.titre_deja_joue(me, p_division) then raise exception 'Tu as déjà fait ton combat pour la % aujourd''hui, reviens demain !', public.titre_nom(p_division); end if;
  -- le champion défend sa ceinture autant de fois qu'on le défie : la limite du jour ne vaut que pour le challenger
  if c.champion is null and public.titre_deja_joue(adv, p_division) then raise exception '% a déjà fait son combat pour la % aujourd''hui, défie-le demain !', (select pseudo from public.joueurs where id = adv), public.titre_nom(p_division); end if;
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

revoke all on function public.titre_defier(text, text, text) from public, anon, authenticated;
grant execute on function public.titre_defier(text, text, text) to service_role;
