-- 32-mode-site.sql — Forest Card
-- Jeu en pause pendant les let's play : un interrupteur (Admin > Réglages) coupe le jeu en live
-- (commandes du chat : swift-responder répond « jeu en pause ») et ouvre l'onglet « Jouer » du site,
-- où chacun ouvre ses boosters et fait ses combats (combats calculés par swift-responder, comme en live).
--
-- À lancer une fois dans Supabase (SQL Editor) ; peut être relancé sans risque.

-- ================= Réglages =================
insert into public.reglages_jeu (cle, valeur) values
  ('jeu_live', '1'),          -- 1 : le jeu se joue en live · 0 : en pause, il se joue sur le site
  ('duel_site_prix', '50')    -- gold d'un duel lancé depuis le site (en live, un duel coûte des points de chaîne)
on conflict (cle) do nothing;

-- État du jeu, lisible par tous (le site s'en sert pour afficher l'onglet « Jouer »)
create or replace function public.etat_jeu()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'live', coalesce((select valeur from public.reglages_jeu where cle = 'jeu_live'), '1') <> '0',
    'prix_duel', coalesce((select valeur from public.reglages_jeu where cle = 'duel_site_prix'), '50'));
$$;
revoke all on function public.etat_jeu() from public;
grant execute on function public.etat_jeu() to anon, authenticated;

-- Ouverture d'un booster depuis le site (jeu en pause, ou admin) : la même ouverture que « !booster »
-- (fonction ouvrir_booster existante, appelée avec l'identifiant Twitch du joueur connecté).
create or replace function public.ouvrir_booster_site()
returns jsonb language plpgsql security definer set search_path = public as $$
declare tid text; noms text[]; r jsonb;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour ouvrir tes boosters'; end if;
  if coalesce((select valeur from public.reglages_jeu where cle = 'jeu_live'), '1') <> '0' and not public.is_admin() then
    raise exception 'Le jeu se joue en live en ce moment : ouvre tes boosters avec !booster pendant le stream';
  end if;
  select j.twitch_id::text into tid from public.joueurs j where j.id = auth.uid();
  if tid is null then raise exception 'Compte Twitch introuvable'; end if;
  select p.proargnames into noms from pg_proc p where p.proname = 'ouvrir_booster' and p.pronamespace = 'public'::regnamespace limit 1;
  if noms is null or not ('p_twitch_id' = any(noms)) then raise exception 'Fonction ouvrir_booster introuvable'; end if;
  execute format('select to_jsonb(public.ouvrir_booster(p_twitch_id => %L))', tid) into r;
  if jsonb_typeof(r) = 'string' then r := (r #>> '{}')::jsonb; end if;
  if jsonb_typeof(r) = 'array' then r := r -> 0; end if;
  if r ? 'ouvrir_booster' then r := r -> 'ouvrir_booster'; end if;
  if jsonb_typeof(r) = 'string' then r := (r #>> '{}')::jsonb; end if;
  return r;
end $$;
revoke all on function public.ouvrir_booster_site() from public, anon;
grant execute on function public.ouvrir_booster_site() to authenticated;
