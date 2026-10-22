-- 34-titre-par-ceinture.sql — Forest Card
-- Championnat : un combat pour le titre par jour et PAR CEINTURE (avant : un seul par jour, toutes ceintures confondues).
-- Un joueur qui a joué pour la Rare peut encore défier, être défié et accepter pour l'Épique et la Libre le même jour.
-- Jour de Paris, remis à zéro à minuit. À lancer une fois dans Supabase (SQL Editor), après 33-championnat.sql ;
-- peut être relancé sans risque.

-- Le joueur a-t-il déjà fait son combat pour CETTE ceinture aujourd'hui ?
create or replace function public.titre_deja_joue(p_joueur uuid, p_division text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.defis_titre where statut = 'joue' and division = p_division and p_joueur in (challenger, adversaire)
    and fini_le >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris');
$$;
revoke all on function public.titre_deja_joue(uuid, text) from public, anon, authenticated;

-- Défier et accepter : même code que 33-championnat.sql, seule la limite du jour change (par ceinture)
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
  if public.titre_deja_joue(me, p_division) then raise exception 'Tu as déjà fait ton combat pour la % aujourd''hui, reviens demain !', public.titre_nom(p_division); end if;
  if public.titre_deja_joue(adv, p_division) then raise exception '% a déjà fait son combat pour la % aujourd''hui, défie-le demain !', (select pseudo from public.joueurs where id = adv), public.titre_nom(p_division); end if;
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

create or replace function public.titre_preparer(p_twitch_id text, p_division text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; d public.defis_titre; da bigint[]; db bigint[]; pb text;
begin
  perform public.titre_maj();
  me := public.titre_joueur(p_twitch_id);
  select * into d from public.defis_titre where adversaire = me and statut = 'attente'
    and (coalesce(p_division, '') = '' or division = p_division) order by cree_le limit 1;
  if d.id is null then raise exception 'Aucun défi en attente contre toi'; end if;
  if public.titre_deja_joue(me, d.division) then raise exception 'Tu as déjà fait ton combat pour la % aujourd''hui : accepte ce défi demain (il expire le %)', public.titre_nom(d.division),
    to_char(d.expire_le at time zone 'Europe/Paris', 'DD/MM à HH24:MI'); end if;
  if public.titre_deja_joue(d.challenger, d.division) then raise exception '% a déjà fait son combat pour la % aujourd''hui : accepte ce défi demain',
    (select pseudo from public.joueurs where id = d.challenger), public.titre_nom(d.division); end if;
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

revoke all on function public.titre_defier(text, text, text) from public, anon, authenticated;
revoke all on function public.titre_preparer(text, text) from public, anon, authenticated;
grant execute on function public.titre_defier(text, text, text) to service_role;
grant execute on function public.titre_preparer(text, text) to service_role;
