-- 42-primes-verrou.sql — Forest Card
-- Championnat : verrou des primes des ceintures, pour les jours où l'admin ne peut pas faire de live
-- (Admin > Réglages, case « 🔒 Primes des ceintures verrouillées », réglage titre_primes_verrou).
-- Tant que le verrou est mis :
--   * une journée sans combat pour le titre ne paie pas de prime, mais NE CASSE PAS la série des +10 %
--     (le champion n'y peut rien : sans live, pas de combat pour le titre) ; une journée avec un combat
--     pour le titre paie normalement ;
--   * les compteurs sont arrêtés comme pendant la pause du jeu : les 7 jours d'inactivité et les 24 h
--     d'un défi ne comptent pas (titre_pause, réécrite ici, arrête les compteurs si le jeu est en pause
--     OU si les primes sont verrouillées, sans compter deux fois le temps où les deux se recouvrent).
-- Une journée compte comme verrouillée si le verrou a été mis à un moment de cette journée (jour de Paris).
-- À lancer une fois dans Supabase (SQL Editor), après 41-titre-nul-et-defense.sql ; peut être relancé sans risque.

insert into public.reglages_jeu (cle, valeur) values ('titre_primes_verrou', '0') on conflict (cle) do nothing;

-- Les périodes de verrou (fin null : en cours)
create table if not exists public.titre_verrous (
  id bigserial primary key,
  debut timestamptz not null default now(),
  fin timestamptz
);
alter table public.titre_verrous enable row level security;
revoke all on public.titre_verrous from anon, authenticated;

create or replace function public.titre_verrouille() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select valeur from public.reglages_jeu where cle = 'titre_primes_verrou'), '0') = '1';
$$;
grant execute on function public.titre_verrouille() to anon, authenticated;   -- l'onglet Ceintures l'affiche

-- Compteurs du championnat arrêtés : jeu en pause ou primes verrouillées
create or replace function public.titre_arrete() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select valeur from public.reglages_jeu where cle = 'jeu_live'), '1') = '0' or public.titre_verrouille();
$$;
revoke all on function public.titre_arrete() from public, anon, authenticated;

-- La journée j (Paris) a-t-elle été verrouillée, même un moment ?
create or replace function public.titre_jour_verrouille(p_jour date) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.titre_verrous v
    where v.debut < public.titre_minuit(p_jour + 1) and coalesce(v.fin, 'infinity') >= public.titre_minuit(p_jour));
$$;
revoke all on function public.titre_jour_verrouille(date) from public, anon, authenticated;

-- Primes (33-championnat.sql) : une journée verrouillée sans combat pour le titre ne paie pas et garde la série
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
    while j < public.titre_jour() and (public.titre_minuit(j + 1) <= limite or public.titre_jour_verrouille(j)) loop
      if exists (select 1 from public.defis_titre d where d.statut = 'joue' and c.champion in (d.challenger, d.adversaire)
                  and d.fini_le >= public.titre_minuit(j) and d.fini_le < public.titre_minuit(j + 1)) then
        select count(*) into nb from public.ceintures where champion = c.champion;
        c.jours := c.jours + 1;
        p := public.titre_prime(c.jours, nb);
        update public.joueurs set monnaie = coalesce(monnaie, 0) + p where id = c.champion;
        update public.regnes set primes = primes + p where division = c.division and fin is null;
      elsif not public.titre_jour_verrouille(j) then
        c.jours := 0;   -- journée sans combat pour le titre : pas de prime, la série repart à 90
      end if;           -- journée verrouillée sans combat : pas de prime, la série est gardée
      update public.ceintures set jours = c.jours, prime_jusqu = j where division = c.division;
      j := j + 1;
    end loop;
  end loop;
end $$;
revoke all on function public.titre_primes() from public, anon, authenticated;

-- Décisions sans combat (33-championnat.sql) : rien n'expire tant que les compteurs sont arrêtés
create or replace function public.titre_maj()
returns void language plpgsql security definer set search_path = public as $$
declare c public.ceintures;
begin
  perform public.titre_primes();   -- les primes se paient même pendant la pause
  if public.titre_arrete() then return; end if;
  update public.defis_titre set statut = 'expire', fini_le = now() where statut = 'attente' and expire_le < now();
  for c in select * from public.ceintures where champion is not null
    and coalesce(dernier_titre, depuis) < now() - make_interval(days => public.reglage_num('titre_inactivite_jours', 7)::int) loop
    perform public.titre_vacante(c.division, 'inactivite');
  end loop;
end $$;

-- Arrêt des compteurs (33-championnat.sql) : surveille la pause (jeu_live) ET le verrou des primes.
-- On note l'heure quand les compteurs s'arrêtent ; quand ils repartent, les compteurs sont décalés d'autant.
create or replace function public.titre_pause()
returns trigger language plpgsql security definer set search_path = public as $$
declare debut timestamptz; duree interval; avant boolean; apres boolean;
begin
  if new.cle not in ('jeu_live', 'titre_primes_verrou') then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.valeur, '') = coalesce(new.valeur, '') then return new; end if;
  -- les périodes de verrou
  if new.cle = 'titre_primes_verrou' then
    if new.valeur = '1' then
      if not exists (select 1 from public.titre_verrous where fin is null) then insert into public.titre_verrous (debut) values (now()); end if;
    else
      update public.titre_verrous set fin = now() where fin is null;
    end if;
  end if;
  -- les compteurs étaient-ils arrêtés avant ce changement ?
  apres := public.titre_arrete();
  avant := case when new.cle = 'jeu_live' then
      (case when tg_op = 'UPDATE' then coalesce(old.valeur, '1') = '0' else false end) or public.titre_verrouille()
    else
      coalesce((select valeur from public.reglages_jeu where cle = 'jeu_live'), '1') = '0'
      or (tg_op = 'UPDATE' and coalesce(old.valeur, '0') = '1')
    end;
  if apres and not avant then
    insert into public.reglages_jeu (cle, valeur) values ('titre_pause_debut', now()::text)
      on conflict (cle) do update set valeur = excluded.valeur;
  elsif avant and not apres then
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
