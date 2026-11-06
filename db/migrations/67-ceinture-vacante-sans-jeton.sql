-- 67-ceinture-vacante-sans-jeton.sql — Forest Card
-- Un combat pour une ceinture vacante (défi sans champion : pour_champion = false) n'utilise plus le combat
-- pour le titre du jour, ni pour celui qui défie ni pour celui qui accepte. Seuls comptent les combats contre
-- le champion (et toujours pas la défense de sa propre ceinture, ni un match nul).
-- Les combats pour une ceinture vacante déjà joués aujourd'hui sont rendus du même coup.
-- À lancer une fois dans Supabase (SQL Editor), après 66-chiffres-versions.sql ; peut être relancé.

create or replace function public.titre_deja_joue(p_joueur uuid, p_division text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.defis_titre
    where statut = 'joue' and division = p_division and p_joueur in (challenger, adversaire)
      and pour_champion                                        -- ceinture vacante : ne compte pas
      and gagnant is not null                                  -- match nul : le combat est rendu
      and not (adversaire = p_joueur)                          -- défense de sa ceinture : ne compte pas
      and fini_le >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris');
$$;

create or replace function public.titre_deja_joue(p_joueur uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.defis_titre where statut = 'joue' and pour_champion and p_joueur in (challenger, adversaire)
    and fini_le >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris');
$$;
