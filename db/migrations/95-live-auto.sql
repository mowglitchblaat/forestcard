-- 95-live-auto.sql — Forest Card
-- Live automatique : le jeu passe tout seul en live quand le stream démarre, et sur le site quand il s'arrête.
--
-- Trois réglages (Admin > Réglages > « Jeu en live ») :
--   - jeu_auto = '1'        : mode automatique (sinon : l'interrupteur manuel de 32-mode-site.sql, comme avant) ;
--   - stream_en_ligne       : écrit par la fonction Edge « statut-stream », appelée chaque minute par pg_cron,
--                             qui demande à Twitch si la chaîne est en live ;
--   - jeu_lets_play = '1'   : « ce live est un let's play » : le stream démarre mais le jeu reste sur le site.
--                             Se coche avant ou pendant le live, et se décoche tout seul à la fin du stream
--                             (pour ne pas l'oublier au live suivant).
-- En automatique, jeu_live (que lisent swift-responder, le site et le championnat) est recalculé ici :
-- jeu_live = 1 si le stream est en ligne et que ce n'est pas un let's play, sinon 0. « Fermé partout »
-- (40-jeu-ferme.sql) passe toujours avant.
--
-- Championnat (33-championnat.sql, 42-primes-verrou.sql) : en automatique, le hors-live n'arrête PAS les
-- compteurs (7 jours d'inactivité, 24 h d'un défi), comme avant quand le jeu restait « en live » entre deux
-- streams. Seuls un let's play, une pause manuelle, la fermeture ou le verrou des primes les arrêtent.
--
-- À lancer une fois dans Supabase (SQL Editor), APRÈS 42-primes-verrou.sql ; peut être relancé sans risque.
-- Ensuite : déployer la fonction Edge apps/edge/src/statut-stream.ts (Verify JWT désactivé) avec les
-- secrets TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET.

-- ================= Réglages =================
insert into public.reglages_jeu (cle, valeur) values
  ('jeu_auto', '0'),
  ('stream_en_ligne', '0'),
  ('jeu_lets_play', '0')
on conflict (cle) do nothing;

-- ================= État privé de la vérification (jamais lisible par le site) =================
create table if not exists public.stream_auto (
  id int primary key default 1 check (id = 1),
  chaine_id text not null,                                         -- identifiant Twitch de la chaîne
  secret text not null default encode(sha256((random()::text || clock_timestamp()::text)::bytea), 'hex'),  -- envoyé par pg_cron à statut-stream
  jeton text,                                                      -- jeton d'application Twitch (mis en cache)
  jeton_expire timestamptz,
  hors_ligne_depuis timestamptz,                                   -- premier « hors ligne » vu d'affilée
  verifie_le timestamptz
);
alter table public.stream_auto enable row level security;
revoke all on public.stream_auto from public, anon, authenticated;
insert into public.stream_auto (id, chaine_id)
  select 1, j.twitch_id::text from public.admins a join public.joueurs j on j.id = a.user_id limit 1
on conflict (id) do nothing;

-- ================= Calcul de jeu_live en automatique =================
create or replace function public.reglage_txt(p_cle text, p_defaut text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select valeur from public.reglages_jeu where cle = p_cle), p_defaut);
$$;
revoke all on function public.reglage_txt(text, text) from public, anon, authenticated;

create or replace function public.jeu_appliquer_auto()
returns void language plpgsql security definer set search_path = public as $$
declare cible text;
begin
  if public.reglage_txt('jeu_auto', '0') <> '1' or public.jeu_ferme() then return; end if;
  cible := case when public.reglage_txt('stream_en_ligne', '0') = '1'
                 and public.reglage_txt('jeu_lets_play', '0') <> '1' then '1' else '0' end;
  if public.reglage_txt('jeu_live', '1') <> cible then
    insert into public.reglages_jeu (cle, valeur) values ('jeu_live', cible)
      on conflict (cle) do update set valeur = excluded.valeur;
  end if;
end $$;
revoke all on function public.jeu_appliquer_auto() from public, anon, authenticated;

create or replace function public.jeu_mode_auto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cle not in ('jeu_auto', 'stream_en_ligne', 'jeu_lets_play', 'jeu_ferme') then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.valeur, '') = coalesce(new.valeur, '') then return new; end if;
  -- fin du stream : le let's play est terminé, le prochain live repart en live normal
  if new.cle = 'stream_en_ligne' and new.valeur = '0' then
    update public.reglages_jeu set valeur = '0' where cle = 'jeu_lets_play' and valeur <> '0';
  end if;
  perform public.jeu_appliquer_auto();
  return new;
end $$;
revoke all on function public.jeu_mode_auto() from public, anon, authenticated;
drop trigger if exists jeu_mode_auto on public.reglages_jeu;
create trigger jeu_mode_auto after insert or update on public.reglages_jeu
  for each row execute function public.jeu_mode_auto();

-- ================= Compteurs du championnat =================
-- Arrêtés : verrou des primes, jeu fermé, ou jeu en pause… sauf la pause « hors live » du mode automatique.
create or replace function public.titre_arrete() returns boolean language sql stable security definer set search_path = public as $$
  select public.titre_verrouille() or public.jeu_ferme()
    or (public.reglage_txt('jeu_live', '1') = '0'
        and not (public.reglage_txt('jeu_auto', '0') = '1' and public.reglage_txt('stream_en_ligne', '0') = '0'));
$$;
revoke all on function public.titre_arrete() from public, anon, authenticated;

-- Même rôle que dans 42-primes-verrou.sql, mais l'état « avant » est lu dans titre_pause_debut (rempli tant que
-- les compteurs sont arrêtés) : plus besoin de deviner l'ancien état à partir de la clé qui change.
create or replace function public.titre_pause()
returns trigger language plpgsql security definer set search_path = public as $$
declare debut timestamptz; duree interval; avant boolean; apres boolean;
begin
  if new.cle not in ('jeu_live', 'titre_primes_verrou', 'jeu_ferme', 'jeu_auto', 'stream_en_ligne', 'jeu_lets_play') then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.valeur, '') = coalesce(new.valeur, '') then return new; end if;
  if new.cle = 'titre_primes_verrou' then
    if new.valeur = '1' then
      if not exists (select 1 from public.titre_verrous where fin is null) then insert into public.titre_verrous (debut) values (now()); end if;
    else
      update public.titre_verrous set fin = now() where fin is null;
    end if;
  end if;
  select nullif(valeur, '')::timestamptz into debut from public.reglages_jeu where cle = 'titre_pause_debut';
  avant := debut is not null;
  apres := public.titre_arrete();
  if apres and not avant then
    insert into public.reglages_jeu (cle, valeur) values ('titre_pause_debut', now()::text)
      on conflict (cle) do update set valeur = excluded.valeur;
  elsif avant and not apres then
    duree := now() - debut;
    update public.ceintures set dernier_titre = dernier_titre + duree, depuis = depuis + duree where champion is not null;
    update public.defis_titre set expire_le = expire_le + duree where statut = 'attente';
    update public.reglages_jeu set valeur = '' where cle = 'titre_pause_debut';
  end if;
  return new;
end $$;
revoke all on function public.titre_pause() from public, anon, authenticated;
drop trigger if exists titre_pause on public.reglages_jeu;
create trigger titre_pause after insert or update on public.reglages_jeu for each row execute function public.titre_pause();

-- ================= Vérification chaque minute =================
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'statut-stream';
select cron.schedule('statut-stream', '* * * * *', $job$
  select net.http_post(
    url := 'https://bjsvqikjnvaomyoifiml.supabase.co/functions/v1/statut-stream',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-secret', (select secret from public.stream_auto where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000);
$job$);

-- L'historique de pg_cron grossit d'une ligne par minute : on ne garde que les 3 derniers jours.
select cron.unschedule(jobid) from cron.job where jobname = 'statut-stream-menage';
select cron.schedule('statut-stream-menage', '17 4 * * *', $job$
  delete from cron.job_run_details where end_time < now() - interval '3 days';
$job$);
