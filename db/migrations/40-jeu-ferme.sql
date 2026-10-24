-- 40-jeu-ferme.sql — Forest Card
-- Jeu fermé : un troisième état pour l'interrupteur « Jeu en live » (Admin > Réglages), en plus de
-- « en live » et « en pause : on joue sur le site » (32-mode-site.sql). Fermé, le jeu est coupé PARTOUT :
--   - les commandes du live (!combat, duels, !quotidien, championnat) répondent « jeu fermé » (swift-responder) ;
--   - !booster est refusé (le booster reste dans le stock du joueur) ;
--   - l'onglet « 🎮 Jouer » du site est masqué et le site refuse combats et ouvertures de boosters.
-- L'admin, lui, peut toujours tester depuis le site.
-- Réglage : jeu_ferme = '1'. Fermer le jeu met aussi jeu_live à '0', pour que les compteurs du
-- championnat (7 jours d'inactivité, 24 h d'un défi) restent arrêtés pendant la fermeture (33-championnat.sql).
-- Collection, deck, boutique et jeux du jour restent ouverts.
--
-- À lancer une fois dans Supabase (SQL Editor), APRÈS 32-mode-site.sql ; peut être relancé sans risque.

-- ================= Réglage =================
insert into public.reglages_jeu (cle, valeur) values ('jeu_ferme', '0')   -- 1 : jeu fermé partout
on conflict (cle) do nothing;

create or replace function public.jeu_ferme()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select valeur from public.reglages_jeu where cle = 'jeu_ferme'), '0') = '1';
$$;
revoke all on function public.jeu_ferme() from public;
grant execute on function public.jeu_ferme() to anon, authenticated;

-- État du jeu, lisible par tous : on ajoute « ferme »
create or replace function public.etat_jeu()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'live', coalesce((select valeur from public.reglages_jeu where cle = 'jeu_live'), '1') <> '0',
    'ferme', public.jeu_ferme(),
    'prix_duel', coalesce((select valeur from public.reglages_jeu where cle = 'duel_site_prix'), '50'));
$$;
revoke all on function public.etat_jeu() from public;
grant execute on function public.etat_jeu() to anon, authenticated;

-- Ouverture d'un booster depuis le site : refusée aussi quand le jeu est fermé (sauf admin)
create or replace function public.ouvrir_booster_site()
returns jsonb language plpgsql security definer set search_path = public as $$
declare tid text; noms text[]; r jsonb;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour ouvrir tes boosters'; end if;
  if public.jeu_ferme() and not public.is_admin() then
    raise exception '🔒 Le jeu est fermé pour le moment : tes boosters t''attendent, tu pourras les ouvrir à la réouverture';
  end if;
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

-- !booster (Streamer.bot appelle ouvrir_booster directement) : quand le jeu est fermé, un booster ne
-- peut pas sortir du stock. Le garde-fou est posé sur stock_boosters, pour ne pas toucher à ouvrir_booster :
-- toute baisse de quantité (ou suppression de ligne) est refusée, ce qui annule l'ouverture entière.
-- Les ajouts (achat, booster du jour, jeux du jour, dons de l'admin) passent, et l'admin connecté
-- (onglet Joueurs, remise à zéro, tests depuis le site) n'est jamais bloqué.
create or replace function public.stock_boosters_ferme()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.jeu_ferme() and not coalesce(public.is_admin(), false)
     and (tg_op = 'DELETE' or coalesce(new.quantite, 0) < coalesce(old.quantite, 0)) then
    raise exception '🔒 Le jeu est fermé pour le moment : impossible d''ouvrir un booster';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists stock_boosters_ferme on public.stock_boosters;
create trigger stock_boosters_ferme before update or delete on public.stock_boosters
  for each row execute function public.stock_boosters_ferme();
