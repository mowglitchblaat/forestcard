-- 100-lueur-monte.sql — Forest Card
-- La lueur violette du ciel (96-lueur-ciel.sql) monte toute seule : chaque nuit, vers 3 h (heure de Paris),
-- lore_carte.lueur gagne 1 niveau, jusqu'à 10 (ciel embrasé).
--   - Lueur éteinte (0) : rien ne bouge. Pour arrêter la montée, la remettre à 0 dans Admin > Lore.
--   - Baissée à la main : elle repart de là la nuit suivante.
--   - Le passage au niveau 3 publie toujours l'annonce « Mais qu'est-ce ? » (trigger lueur_annonce, une fois).
-- À lancer une fois dans Supabase (SQL Editor), après 99-eclair-absorbe.sql ; peut être relancé.

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'lueur-monte';
-- pg_cron compte en UTC : 2 h 07 UTC = 3 h 07 à Paris en hiver.
select cron.schedule('lueur-monte', '7 2 * * *', $job$
  update public.lore_carte set lueur = lueur + 1 where id = 1 and lueur between 1 and 9;
$job$);
