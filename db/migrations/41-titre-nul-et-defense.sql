-- 41-titre-nul-et-defense.sql — Forest Card
-- Championnat : ce qui compte comme « le combat pour le titre du jour » (par ceinture).
--   * Match nul : le combat ne compte pas. Le challenger (et, pour une ceinture vacante, les deux joueurs)
--     garde son combat pour cette ceinture et peut redéfier le jour même.
--   * Défense : un combat où le joueur défendait sa ceinture (défié en tant que champion) ne compte pas pour lui.
--     S'il perd sa ceinture, il peut donc défier le nouveau champion le jour même pour essayer de la récupérer.
-- Seule titre_deja_joue change : titre_defier et titre_preparer (35-champion-sans-limite.sql) l'appellent déjà.
-- Les primes et le compteur des 7 jours (« le champion a fait un combat pour le titre ») ne changent pas :
-- une défense, même nulle, compte toujours pour eux.
-- À lancer une fois dans Supabase (SQL Editor), après 40-jeu-ferme.sql ; peut être relancé sans risque.

create or replace function public.titre_deja_joue(p_joueur uuid, p_division text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.defis_titre
    where statut = 'joue' and division = p_division and p_joueur in (challenger, adversaire)
      and gagnant is not null                                  -- match nul : le combat est rendu
      and not (pour_champion and adversaire = p_joueur)        -- défense de sa ceinture : ne compte pas
      and fini_le >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris');
$$;
revoke all on function public.titre_deja_joue(uuid, text) from public, anon, authenticated;
